import { Hono } from 'hono';
import { createBookingSchema, type Booking } from '../../../shared/schemas/bookings';
import { ok } from '../../lib/respond';
import { parseJsonBody } from '../../lib/validate';
import { authOf, requireRole } from '../../middleware/guards';
import type { AppEnv } from '../../types';
import * as service from './service';

/** Mounted at /api/v1/bookings. */
export const bookingRoutes = new Hono<AppEnv>();

bookingRoutes.post('/', requireRole('student'), async (c) => {
  const input = await parseJsonBody(c, createBookingSchema);
  const booking = await service.createBooking(c.var.db, authOf(c).user.id, input);
  return ok<Booking>(c, booking, 201);
});
