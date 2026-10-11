import { and, eq, gte, lt } from 'drizzle-orm';
import { projectSlots } from '../../../shared/availability';
import {
  SLOT_HORIZON_DAYS,
  type SlotList,
  type SlotQuery,
} from '../../../shared/schemas/availability';
import { addDays, daysBetween, localToUtc, todayIn } from '../../../shared/time';
import type { Db } from '../../db/client';
import { bookingSlotClaims } from '../../db/schema';
import { AppError } from '../../lib/errors';
import { loadSchedule } from '../availability/service';

/** Claimed 30-minute cells for [fromMs, toMs). Served by the (tutor_id, slot_start_utc) primary key. */
export async function claimedCells(
  db: Db,
  tutorId: string,
  fromMs: number,
  toMs: number,
): Promise<Set<number>> {
  const rows = await db
    .select({ slot: bookingSlotClaims.slotStartUtc })
    .from(bookingSlotClaims)
    .where(
      and(
        eq(bookingSlotClaims.tutorId, tutorId),
        gte(bookingSlotClaims.slotStartUtc, new Date(fromMs).toISOString()),
        lt(bookingSlotClaims.slotStartUtc, new Date(toMs).toISOString()),
      ),
    )
    .all();
  return new Set(rows.map((r) => Date.parse(r.slot)));
}

/** Bookable slots between local dates [fromDate, toDate] in the tutor's timezone. */
export async function computeSlots(
  db: Db,
  tutorId: string,
  fromDate: string,
  toDate: string,
  durationMinutes: number,
  now: Date,
) {
  const schedule = await loadSchedule(db, tutorId, fromDate);
  const rangeStart = localToUtc(fromDate, 0, schedule.timezone).getTime();
  const rangeEnd = localToUtc(addDays(toDate, 1), 0, schedule.timezone).getTime();
  const claimed = await claimedCells(db, tutorId, rangeStart, rangeEnd);
  const slots = projectSlots({
    rules: schedule.rules,
    exceptions: schedule.exceptions,
    claimed,
    fromDate,
    toDate,
    timeZone: schedule.timezone,
    durationMinutes,
    now,
  });
  return { timezone: schedule.timezone, slots };
}

/** Public slot listing. Caller must already have verified the tutor is publicly listed. */
export async function listSlots(
  db: Db,
  tutorId: string,
  query: SlotQuery,
  now = new Date(),
): Promise<SlotList> {
  const { timezone } = await loadSchedule(db, tutorId);
  const today = todayIn(timezone, now);
  const horizonEnd = addDays(today, SLOT_HORIZON_DAYS);
  const from = query.from ?? today;
  const to = query.to ?? (addDays(from, 6) > horizonEnd ? horizonEnd : addDays(from, 6));
  if (from < today) {
    throw new AppError(422, 'RANGE_IN_PAST', 'Không thể xem lịch của ngày đã qua.', [
      { path: 'from' },
    ]);
  }
  if (to > horizonEnd || daysBetween(from, to) > SLOT_HORIZON_DAYS) {
    throw new AppError(
      422,
      'BEYOND_HORIZON',
      `Chỉ xem được lịch trong ${SLOT_HORIZON_DAYS} ngày tới.`,
      [{ path: 'to' }],
    );
  }
  const result = await computeSlots(db, tutorId, from, to, query.duration, now);
  return {
    tutorId,
    timezone: result.timezone,
    duration: query.duration,
    from,
    to,
    slots: result.slots.map(({ startMs, endMs }) => ({
      startUtc: new Date(startMs).toISOString(),
      endUtc: new Date(endMs).toISOString(),
    })),
  };
}
