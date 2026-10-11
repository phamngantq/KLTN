import { Hono } from 'hono';
import { createBookingSchema, type Booking } from '../../../shared/schemas/bookings';
import { ok } from '../../lib/respond';
import { parseJsonBody } from '../../lib/validate';
import { authOf, requireRole } from '../../middleware/guards';
import type { AppEnv } from '../../types';
import * as idempotency from '../idempotency/service';
import * as repo from './repository';
import * as service from './service';

/** Mounted at /api/v1/bookings. */
export const bookingRoutes = new Hono<AppEnv>();

const CREATE_ENDPOINT = 'POST /bookings';

bookingRoutes.post('/', requireRole('student'), async (c) => {
  const input = await parseJsonBody(c, createBookingSchema);
  const studentId = authOf(c).user.id;
  const rawKey = c.req.header(idempotency.IDEMPOTENCY_HEADER);
  if (rawKey === undefined) {
    return ok<Booking>(c, await service.createBooking(c.var.db, studentId, input), 201);
  }

  const ctx = await idempotency.buildContext(studentId, CREATE_ENDPOINT, rawKey, input);
  const claim = await idempotency.claim(c.var.db, ctx);
  if (claim.kind === 'replay') {
    const booking = await repo.findBooking(c.var.db, claim.resultRef);
    if (!booking || booking.studentId !== studentId) throw new Error('Idempotent result missing');
    c.header('Idempotency-Replayed', 'true');
    return ok<Booking>(c, booking, 201);
  }
  try {
    const booking = await service.createBooking(
      c.var.db,
      studentId,
      input,
      new Date(),
      (bookingId) => [idempotency.completeStatement(c.var.db, ctx, bookingId, 201)],
    );
    return ok<Booking>(c, booking, 201);
  } catch (err) {
    await idempotency.release(c.var.db, ctx);
    throw err;
  }
});
