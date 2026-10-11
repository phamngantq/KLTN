import { eq } from 'drizzle-orm';
import { alias } from 'drizzle-orm/sqlite-core';
import type { Db } from '../../db/client';
import { auditLogs, bookingSlotClaims, bookings, users } from '../../db/schema';

export type NewBooking = typeof bookings.$inferInsert;

const tutorUser = alias(users, 'tutor_user');
const studentUser = alias(users, 'student_user');

export const bookingColumns = {
  id: bookings.id,
  tutorId: bookings.tutorId,
  studentId: bookings.studentId,
  tutorName: tutorUser.displayName,
  studentName: studentUser.displayName,
  startsAtUtc: bookings.startsAtUtc,
  endsAtUtc: bookings.endsAtUtc,
  durationMinutes: bookings.durationMinutes,
  status: bookings.status,
  hourlyRateMinor: bookings.hourlyRateMinor,
  priceMinor: bookings.priceMinor,
  currency: bookings.currency,
  createdAt: bookings.createdAt,
  updatedAt: bookings.updatedAt,
};

/** Booking rows joined with both participants' display names. */
export function selectBookings(db: Db) {
  return db
    .select(bookingColumns)
    .from(bookings)
    .innerJoin(tutorUser, eq(tutorUser.id, bookings.tutorId))
    .innerJoin(studentUser, eq(studentUser.id, bookings.studentId));
}

export function findBooking(db: Db, id: string) {
  return selectBookings(db).where(eq(bookings.id, id)).get();
}

/**
 * Booking + one claim per 30-minute cell + audit entry in a single D1 batch (one transaction).
 * The (tutor_id, slot_start_utc) primary key on claims makes a competing booking fail and
 * roll the whole batch back — no orphan booking, no partial claims.
 */
export async function insertBookingWithClaims(
  db: Db,
  booking: NewBooking,
  cellStartsUtc: string[],
  now: string,
): Promise<void> {
  await db.batch([
    db.insert(bookings).values(booking),
    ...cellStartsUtc.map((slotStartUtc) =>
      db
        .insert(bookingSlotClaims)
        .values({ tutorId: booking.tutorId, slotStartUtc, bookingId: booking.id }),
    ),
    db.insert(auditLogs).values({
      id: crypto.randomUUID(),
      actorId: booking.studentId,
      action: 'booking.created',
      targetType: 'booking',
      targetId: booking.id,
      metadata: JSON.stringify({ status: booking.status, startsAtUtc: booking.startsAtUtc }),
      createdAt: now,
    }),
  ]);
}
