import type { BatchItem } from 'drizzle-orm/batch';
import { cellsOf, projectSlots } from '../../../shared/availability';
import { SLOT_HORIZON_DAYS, SLOT_MINUTES } from '../../../shared/schemas/availability';
import type { Booking, CreateBookingInput } from '../../../shared/schemas/bookings';
import { addDays, todayIn, utcToLocal } from '../../../shared/time';
import type { Db } from '../../db/client';
import { AppError, isUniqueViolation } from '../../lib/errors';
import { loadSchedule } from '../availability/service';
import { getPublicTutorById } from '../discovery/service';
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
