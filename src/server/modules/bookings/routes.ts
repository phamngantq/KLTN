import { Hono } from 'hono';
import {
  bookingListSchema,
  type BookingAction,
  type BookingWithActions,
} from '../../../shared/schemas/bookings';
import type { Page } from '../../../shared/schemas/discovery';
import { fail, ok } from '../../lib/respond';
import { parseQuery } from '../../lib/validate';
import { authOf, requireRole } from '../../middleware/guards';
import type { AppEnv } from '../../types';
import * as service from './service';

/** Mounted at /api/v1/bookings. */
export const bookingRoutes = new Hono<AppEnv>();

// The Figma class-request flow replaced creation of 30-minute bookings.
// Historical bookings remain readable and their pending states remain actionable.
bookingRoutes.post('/', requireRole('student'), (c) =>
  fail(c, 410, 'LEGACY_BOOKING_CLOSED', 'Đặt lịch mới đã đóng. Vui lòng gửi yêu cầu tìm gia sư.'),
);

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
