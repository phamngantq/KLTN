import {
  DEFAULT_TIMEZONE,
  type PutWeeklyAvailabilityInput,
  type WeeklyAvailability,
} from '../../../shared/schemas/availability';
import type { Db } from '../../db/client';
import { AppError } from '../../lib/errors';
import { findOverlaps } from './overlap';
import * as repo from './repository';

export async function getWeeklyAvailability(db: Db, tutorId: string): Promise<WeeklyAvailability> {
  const rows = await repo.listRules(db, tutorId);
  return {
    timezone: rows[0]?.timezone ?? DEFAULT_TIMEZONE,
    rules: rows.map(({ timezone: _tz, ...rule }) => rule),
  };
}

/**
 * Replaces the caller's weekly schedule. `tutorId` always comes from the session, never the body.
 * Existing bookings are intentionally not modified (PLAN §3.2.6).
 */
export async function putWeeklyAvailability(
  db: Db,
  tutorId: string,
  input: PutWeeklyAvailabilityInput,
  now = new Date(),
): Promise<WeeklyAvailability> {
  const overlaps = findOverlaps(input.rules);
  if (overlaps.length > 0) {
    throw new AppError(
      422,
      'AVAILABILITY_OVERLAP',
      'Các khung giờ trong cùng một ngày không được chồng lấn.',
      overlaps.map(({ first, second }) => ({ rules: [first, second] })),
    );
  }
  const createdAt = now.toISOString();
  await repo.replaceRules(
    db,
    tutorId,
    input.rules.map((rule) => ({
      id: crypto.randomUUID(),
      tutorId,
      weekday: rule.weekday,
      startLocal: rule.start,
      endLocal: rule.end,
      timezone: input.timezone,
      effectiveFrom: rule.effectiveFrom ?? null,
      effectiveTo: rule.effectiveTo ?? null,
      createdAt,
    })),
  );
  return getWeeklyAvailability(db, tutorId);
}
