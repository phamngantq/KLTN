import type { BatchItem } from 'drizzle-orm/batch';
import { cellsOf, projectSlots } from '../../../shared/availability';
import { SLOT_HORIZON_DAYS, SLOT_MINUTES } from '../../../shared/schemas/availability';
import type { UserRole } from '../../../shared/schemas/auth';
import {
  BOOKING_STATUS_LABELS,
  type Booking,
  type BookingAction,
  type BookingListQuery,
  type BookingWithActions,
  type CreateBookingInput,
} from '../../../shared/schemas/bookings';
import type { Page } from '../../../shared/schemas/discovery';
import { addDays, todayIn, utcToLocal } from '../../../shared/time';
import type { Db } from '../../db/client';
import { AppError, isUniqueViolation } from '../../lib/errors';
import { loadSchedule } from '../availability/service';
import { getPublicTutorById } from '../discovery/service';
import { actorAllowed, allowedActions, TRANSITIONS, type Participant } from './lifecycle';
import * as repo from './repository';

const CELL_MS = SLOT_MINUTES * 60_000;

export const slotUnavailable = () =>
  new AppError(409, 'SLOT_UNAVAILABLE', 'Khung giờ này vừa được đặt. Vui lòng chọn giờ khác.');

/** Server-side price: hourly rate (whole thousands of VND, DEC-004) × duration. */
export function priceFor(hourlyRateMinor: number, durationMinutes: number): number {
  return (hourlyRateMinor * durationMinutes) / 60;
}

/**
 * Creates a PENDING booking for the signed-in student. Everything except tutor, start and
 * duration is derived here; the slot is re-validated against the tutor's schedule and the
 * claims' UNIQUE constraint settles races atomically.
 */
export async function createBooking(
  db: Db,
  studentId: string,
  input: CreateBookingInput,
  now = new Date(),
  /** Statements committed atomically with the booking (e.g. idempotency completion). */
  extraStatements: (bookingId: string) => BatchItem<'sqlite'>[] = () => [],
): Promise<Booking> {
  const tutor = await getPublicTutorById(db, input.tutorId); // 404 unless publicly listed
  const startMs = Date.parse(input.startUtc);
  const endMs = startMs + input.durationMinutes * 60_000;

  if (startMs % CELL_MS !== 0) {
    throw new AppError(422, 'INVALID_START', 'Giờ bắt đầu phải theo bước 30 phút.', [
      { path: 'startUtc' },
    ]);
  }
  if (startMs <= now.getTime()) {
    throw new AppError(422, 'START_IN_PAST', 'Không thể đặt lịch cho thời điểm đã qua.', [
      { path: 'startUtc' },
    ]);
  }

  const schedule = await loadSchedule(db, tutor.id);
  const tz = schedule.timezone;
  const startDate = utcToLocal(startMs, tz).date;
  const endDate = utcToLocal(endMs - 1, tz).date;
  if (startDate > addDays(todayIn(tz, now), SLOT_HORIZON_DAYS)) {
    throw new AppError(
      422,
      'BEYOND_HORIZON',
      `Chỉ đặt được lịch trong ${SLOT_HORIZON_DAYS} ngày tới.`,
    );
  }

  // Must lie entirely inside the tutor's availability (claims are checked by the DB constraint).
  const offered = projectSlots({
    rules: schedule.rules,
    exceptions: schedule.exceptions,
    claimed: new Set(),
    fromDate: startDate,
    toDate: endDate,
    timeZone: tz,
    durationMinutes: input.durationMinutes,
    now,
  });
  if (!offered.some((slot) => slot.startMs === startMs)) {
    throw new AppError(422, 'SLOT_NOT_AVAILABLE', 'Khung giờ này nằm ngoài lịch dạy của gia sư.');
  }

  const id = crypto.randomUUID();
  const nowIso = now.toISOString();
  const booking: repo.NewBooking = {
    id,
    tutorId: tutor.id,
    studentId,
    startsAtUtc: new Date(startMs).toISOString(),
    endsAtUtc: new Date(endMs).toISOString(),
    durationMinutes: input.durationMinutes,
    status: 'PENDING',
    hourlyRateMinor: tutor.hourlyRateMinor,
    priceMinor: priceFor(tutor.hourlyRateMinor, input.durationMinutes),
    currency: 'VND',
    createdAt: nowIso,
    updatedAt: nowIso,
  };
  const cells = cellsOf(startMs, endMs).map((ms) => new Date(ms).toISOString());
  try {
    await repo.insertBookingWithClaims(db, booking, cells, nowIso, extraStatements(id));
  } catch (err) {
    if (isUniqueViolation(err, 'booking_slot_claims.')) throw slotUnavailable();
    throw err;
  }
  const created = await repo.findBooking(db, id);
  if (!created) throw new Error('Booking missing after insert');
  return created;
}

export interface Viewer {
  id: string;
  role: UserRole;
}

const bookingNotFound = () => new AppError(404, 'BOOKING_NOT_FOUND', 'Không tìm thấy lịch học.');

/** The viewer's role in this booking, or null for non-participants (who get 404, not 403). */
function participantOf(
  booking: { tutorId: string; studentId: string },
  viewer: Viewer,
): Participant | null {
  if (viewer.role === 'tutor' && booking.tutorId === viewer.id) return 'tutor';
  if (viewer.role === 'student' && booking.studentId === viewer.id) return 'student';
  return null;
}

function withActions(booking: Booking, participant: Participant, now: Date): BookingWithActions {
  return { ...booking, allowedActions: allowedActions(booking, participant, now) };
}

export async function getBookingFor(
  db: Db,
  viewer: Viewer,
  id: string,
  now = new Date(),
): Promise<BookingWithActions> {
  const booking = await repo.findBooking(db, id);
  const participant = booking && participantOf(booking, viewer);
  if (!booking || !participant) throw bookingNotFound();
  return withActions(booking, participant, now);
}

export async function listBookings(
  db: Db,
  viewer: Viewer,
  query: BookingListQuery,
  now = new Date(),
): Promise<Page<BookingWithActions>> {
  const as: Participant = viewer.role === 'tutor' ? 'tutor' : 'student';
  const { rows, total } = await repo.listBookingsFor(db, { id: viewer.id, as }, query);
  return {
    items: rows.map((row) => withActions(row, as, now)),
    page: query.page,
    pageSize: query.pageSize,
    total,
  };
}

/** Applies (actor, current state, action) rules, then a compare-and-set batch. */
export async function transition(
  db: Db,
  viewer: Viewer,
  id: string,
  action: BookingAction,
  now = new Date(),
): Promise<BookingWithActions> {
  const current = await repo.findBookingVersion(db, id);
  const participant = current && participantOf(current, viewer);
  if (!current || !participant) throw bookingNotFound();

  const rule = TRANSITIONS[action];
  if (!actorAllowed(rule, participant)) {
    throw new AppError(403, 'FORBIDDEN', 'Bạn không có quyền thực hiện thao tác này.');
  }
  if (!rule.from.includes(current.status)) {
    throw new AppError(
      409,
      'INVALID_TRANSITION',
      `Không thể thực hiện thao tác khi lịch học đang ở trạng thái "${BOOKING_STATUS_LABELS[current.status]}".`,
    );
  }
  if (!rule.timing(current, now)) {
    throw new AppError(409, 'TRANSITION_NOT_ALLOWED', rule.timingMessage);
  }
  const applied = await repo.applyTransition(db, {
    id,
    from: current.status,
    to: rule.to,
    version: current.version,
    releaseClaims: rule.releasesClaims,
    actorId: viewer.id,
    action: `booking.${action}`,
    now: now.toISOString(),
  });
  if (!applied) {
    throw new AppError(
      409,
      'STALE_BOOKING',
      'Lịch học vừa được cập nhật bởi người khác. Vui lòng tải lại.',
    );
  }
  return getBookingFor(db, viewer, id, now);
}
