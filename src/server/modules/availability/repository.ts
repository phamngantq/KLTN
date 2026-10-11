import { and, asc, count, eq, gt, gte, inArray } from 'drizzle-orm';
import type { Db } from '../../db/client';
import { availabilityExceptions, availabilityRules, bookings } from '../../db/schema';

export function listRules(db: Db, tutorId: string) {
  return db
    .select({
      id: availabilityRules.id,
      weekday: availabilityRules.weekday,
      start: availabilityRules.startLocal,
      end: availabilityRules.endLocal,
      timezone: availabilityRules.timezone,
      effectiveFrom: availabilityRules.effectiveFrom,
      effectiveTo: availabilityRules.effectiveTo,
    })
    .from(availabilityRules)
    .where(eq(availabilityRules.tutorId, tutorId))
    .orderBy(asc(availabilityRules.weekday), asc(availabilityRules.startLocal))
    .all();
}

export type NewRuleRecord = typeof availabilityRules.$inferInsert;

/**
 * Replaces the tutor's whole weekly schedule in one atomic D1 batch and re-labels the tutor's
 * exceptions with the (possibly new) timezone. Bookings are untouched.
 */
export async function replaceRules(
  db: Db,
  tutorId: string,
  timezone: string,
  rules: NewRuleRecord[],
): Promise<void> {
  const remove = db.delete(availabilityRules).where(eq(availabilityRules.tutorId, tutorId));
  const retag = db
    .update(availabilityExceptions)
    .set({ timezone })
    .where(eq(availabilityExceptions.tutorId, tutorId));
  // D1 caps bound parameters per statement, so insert row by row inside the same batch.
  const inserts = rules.map((rule) => db.insert(availabilityRules).values(rule));
  await db.batch([remove, retag, ...inserts]);
}

const exceptionColumns = {
  id: availabilityExceptions.id,
  date: availabilityExceptions.dateLocal,
  kind: availabilityExceptions.kind,
  start: availabilityExceptions.startLocal,
  end: availabilityExceptions.endLocal,
};

export function listExceptions(db: Db, tutorId: string, fromDate: string) {
  return db
    .select(exceptionColumns)
    .from(availabilityExceptions)
    .where(
      and(
        eq(availabilityExceptions.tutorId, tutorId),
        gte(availabilityExceptions.dateLocal, fromDate),
      ),
    )
    .orderBy(asc(availabilityExceptions.dateLocal), asc(availabilityExceptions.startLocal))
    .all();
}

export function findException(db: Db, tutorId: string, id: string) {
  return db
    .select(exceptionColumns)
    .from(availabilityExceptions)
    .where(and(eq(availabilityExceptions.id, id), eq(availabilityExceptions.tutorId, tutorId)))
    .get();
}

export async function countUpcomingExceptions(db: Db, tutorId: string, fromDate: string) {
  const row = await db
    .select({ n: count() })
    .from(availabilityExceptions)
    .where(
      and(
        eq(availabilityExceptions.tutorId, tutorId),
        gte(availabilityExceptions.dateLocal, fromDate),
      ),
    )
    .get();
  return row?.n ?? 0;
}

export async function insertException(db: Db, record: typeof availabilityExceptions.$inferInsert) {
  await db.insert(availabilityExceptions).values(record);
}

export async function updateException(
  db: Db,
  tutorId: string,
  id: string,
  fields: Pick<
    typeof availabilityExceptions.$inferInsert,
    'dateLocal' | 'kind' | 'startLocal' | 'endLocal'
  >,
) {
  await db
    .update(availabilityExceptions)
    .set(fields)
    .where(and(eq(availabilityExceptions.id, id), eq(availabilityExceptions.tutorId, tutorId)));
}

export async function deleteException(db: Db, tutorId: string, id: string) {
  await db
    .delete(availabilityExceptions)
    .where(and(eq(availabilityExceptions.id, id), eq(availabilityExceptions.tutorId, tutorId)));
}

/** Bookings that still hold the tutor's time: PENDING/CONFIRMED and not yet finished. */
export function listActiveUpcomingBookings(db: Db, tutorId: string, nowIso: string) {
  return db
    .select({ id: bookings.id, startsAtUtc: bookings.startsAtUtc, endsAtUtc: bookings.endsAtUtc })
    .from(bookings)
    .where(
      and(
        eq(bookings.tutorId, tutorId),
        inArray(bookings.status, ['PENDING', 'CONFIRMED']),
        gt(bookings.endsAtUtc, nowIso),
      ),
    )
    .all();
}
