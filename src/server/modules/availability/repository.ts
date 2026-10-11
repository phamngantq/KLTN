import { asc, eq } from 'drizzle-orm';
import type { Db } from '../../db/client';
import { availabilityRules } from '../../db/schema';

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

/** Replaces the tutor's whole weekly schedule in one atomic D1 batch. Bookings are untouched. */
export async function replaceRules(db: Db, tutorId: string, rules: NewRuleRecord[]): Promise<void> {
  const remove = db.delete(availabilityRules).where(eq(availabilityRules.tutorId, tutorId));
  // D1 caps bound parameters per statement, so insert row by row inside the same batch.
  const inserts = rules.map((rule) => db.insert(availabilityRules).values(rule));
  await db.batch([remove, ...inserts]);
}
