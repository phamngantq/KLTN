import { Hono } from 'hono';
import {
  bookingListSchema,
  createBookingSchema,
  type Booking,
  type BookingAction,
  type BookingWithActions,
} from '../../../shared/schemas/bookings';
import type { Page } from '../../../shared/schemas/discovery';
import { ok } from '../../lib/respond';
import { parseJsonBody, parseQuery } from '../../lib/validate';
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

/** Own bookings only: students see bookings they made, tutors bookings made with them. */
bookingRoutes.get('/', requireRole('student', 'tutor'), async (c) => {
  const query = parseQuery(c, bookingListSchema);
  const { id, role } = authOf(c).user;
  return ok<Page<BookingWithActions>>(c, await service.listBookings(c.var.db, { id, role }, query));
});

bookingRoutes.get('/:id', requireRole('student', 'tutor'), async (c) => {
  const { id, role } = authOf(c).user;
  return ok<BookingWithActions>(
    c,
    await service.getBookingFor(c.var.db, { id, role }, c.req.param('id')),
  );
});

bookingRoutes.post(
  '/:id/:action{confirm|reject|cancel|complete}',
  requireRole('student', 'tutor'),
  async (c) => {
    const { id, role } = authOf(c).user;
    const action = c.req.param('action') as BookingAction;
    return ok<BookingWithActions>(
      c,
      await service.transition(c.var.db, { id, role }, c.req.param('id'), action),
    );
  },
);
