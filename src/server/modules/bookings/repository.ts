import { and, asc, count, desc, eq, exists, inArray, sql, type SQL } from 'drizzle-orm';
import type { BatchItem } from 'drizzle-orm/batch';
import { alias } from 'drizzle-orm/sqlite-core';
import type { BookingListQuery, BookingStatus } from '../../../shared/schemas/bookings';
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
  extra: BatchItem<'sqlite'>[] = [],
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
    ...extra,
  ]);
}

export function findBookingVersion(db: Db, id: string) {
  return db
    .select({
      id: bookings.id,
      tutorId: bookings.tutorId,
      studentId: bookings.studentId,
      status: bookings.status,
      version: bookings.version,
      startsAtUtc: bookings.startsAtUtc,
      endsAtUtc: bookings.endsAtUtc,
    })
    .from(bookings)
    .where(eq(bookings.id, id))
    .get();
}

export interface TransitionWrite {
  id: string;
  from: BookingStatus;
  to: BookingStatus;
  version: number;
  releaseClaims: boolean;
  actorId: string;
  action: string;
  now: string;
}

/**
 * Compare-and-set transition in one D1 batch. The claim release and audit insert only take effect
 * when this batch's UPDATE produced (status = to, version = version + 1), so concurrent requests
 * cannot double-release or double-audit. Returns false when another request won the race.
 */
export async function applyTransition(db: Db, t: TransitionWrite): Promise<boolean> {
  const committed = and(
    eq(bookings.id, t.id),
    eq(bookings.status, t.to),
    eq(bookings.version, t.version + 1),
  );
  const update = db
    .update(bookings)
    .set({ status: t.to, version: sql`${bookings.version} + 1`, updatedAt: t.now })
    .where(and(eq(bookings.id, t.id), eq(bookings.status, t.from), eq(bookings.version, t.version)))
    .returning({ id: bookings.id });
  const metadata = JSON.stringify({ from: t.from, to: t.to });
  // Parameterised INSERT … SELECT … WHERE EXISTS: audit row only when this transition committed.
  // Values follow audit_logs column order (id, actor_id, action, target_type, target_id, metadata, created_at).
  const audit = db.insert(auditLogs).select(
    sql`SELECT ${crypto.randomUUID()}, ${t.actorId}, ${t.action}, 'booking', ${t.id}, ${metadata}, ${t.now}
        WHERE EXISTS (SELECT 1 FROM bookings
                      WHERE id = ${t.id} AND status = ${t.to} AND version = ${t.version + 1})`,
  );
  if (t.releaseClaims) {
    const release = db.delete(bookingSlotClaims).where(
      and(
        eq(bookingSlotClaims.bookingId, t.id),
        exists(
          db
            .select({ one: sql`1` })
            .from(bookings)
            .where(committed),
        ),
      ),
    );
    const [updated] = await db.batch([update, release, audit]);
    return updated.length === 1;
  }
  const [updated] = await db.batch([update, audit]);
  return updated.length === 1;
}

/** Bookings where the viewer participates in the given role. */
export async function listBookingsFor(
  db: Db,
  participant: { id: string; as: 'tutor' | 'student' },
  query: BookingListQuery,
) {
  const conditions: SQL[] = [
    participant.as === 'tutor'
      ? eq(bookings.tutorId, participant.id)
      : eq(bookings.studentId, participant.id),
  ];
  if (query.status) conditions.push(inArray(bookings.status, query.status));
  const where = and(...conditions);
  const order = query.order === 'asc' ? asc(bookings.startsAtUtc) : desc(bookings.startsAtUtc);
  // Not db.batch(): D1 batch results are keyed objects, and the two aliased users.display_name
  // columns collide, shifting every following value. Plain queries use positional rows.
  const [rows, totals] = await Promise.all([
    selectBookings(db)
      .where(where)
      .orderBy(order, asc(bookings.id))
      .limit(query.pageSize)
      .offset((query.page - 1) * query.pageSize)
      .all(),
    db.select({ total: count() }).from(bookings).where(where).all(),
  ]);
  return { rows, total: totals[0]?.total ?? 0 };
}
