import {
  cellsOf,
  exceptionsConflict,
  findOverlaps,
  openCellsUtc,
  type ExceptionLike,
} from '../../../shared/availability';
import {
  DEFAULT_TIMEZONE,
  MAX_UPCOMING_EXCEPTIONS,
  type AvailabilityException,
  type ExceptionInput,
  type ExceptionList,
  type ExceptionSaveResult,
  type PutWeeklyAvailabilityInput,
  type WeeklyAvailability,
  type WeeklyAvailabilitySaveResult,
} from '../../../shared/schemas/availability';
import { todayIn, utcToLocal } from '../../../shared/time';
import type { Db } from '../../db/client';
import { AppError } from '../../lib/errors';
import * as repo from './repository';

export async function getWeeklyAvailability(db: Db, tutorId: string): Promise<WeeklyAvailability> {
  const rows = await repo.listRules(db, tutorId);
  return {
    timezone: rows[0]?.timezone ?? DEFAULT_TIMEZONE,
    rules: rows.map(({ timezone: _tz, ...rule }) => rule),
  };
}

/** Rules + exceptions (from `fromDate`) in the tutor's timezone — input for slot projection. */
export async function loadSchedule(db: Db, tutorId: string, fromDate?: string) {
  const weekly = await getWeeklyAvailability(db, tutorId);
  const from = fromDate ?? todayIn(weekly.timezone);
  const exceptions = await repo.listExceptions(db, tutorId, from);
  return { ...weekly, exceptions: exceptions as ExceptionLike[] };
}

/**
 * Number of PENDING/CONFIRMED bookings still ahead that the current schedule no longer fully
 * covers. Used to warn the tutor; bookings themselves are never modified here.
 */
export async function countUncoveredBookings(
  db: Db,
  tutorId: string,
  now = new Date(),
): Promise<number> {
  const active = await repo.listActiveUpcomingBookings(db, tutorId, now.toISOString());
  if (active.length === 0) return 0;
  const weekly = await getWeeklyAvailability(db, tutorId);
  const tz = weekly.timezone;
  const starts = active.map((b) => Date.parse(b.startsAtUtc));
  const ends = active.map((b) => Date.parse(b.endsAtUtc));
  const fromDate = utcToLocal(Math.min(...starts), tz).date;
  const toDate = utcToLocal(Math.max(...ends), tz).date;
  const exceptions = (await repo.listExceptions(db, tutorId, fromDate)) as ExceptionLike[];
  const open = openCellsUtc(fromDate, toDate, weekly.rules, exceptions, tz);
  return active.filter((_, i) => cellsOf(starts[i]!, ends[i]!).some((cell) => !open.has(cell)))
    .length;
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
): Promise<WeeklyAvailabilitySaveResult> {
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
    input.timezone,
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
  const saved = await getWeeklyAvailability(db, tutorId);
  return { ...saved, affectedBookings: await countUncoveredBookings(db, tutorId, now) };
}

export async function listExceptions(
  db: Db,
  tutorId: string,
  now = new Date(),
): Promise<ExceptionList> {
  const { timezone } = await getWeeklyAvailability(db, tutorId);
  return { timezone, exceptions: await repo.listExceptions(db, tutorId, todayIn(timezone, now)) };
}

function toException(id: string, input: ExceptionInput): AvailabilityException {
  return {
    id,
    date: input.date,
    kind: input.kind,
    start: input.start ?? null,
    end: input.end ?? null,
  };
}

async function validateException(
  db: Db,
  tutorId: string,
  candidate: AvailabilityException,
  now: Date,
): Promise<string> {
  const { timezone } = await getWeeklyAvailability(db, tutorId);
  const today = todayIn(timezone, now);
  if (candidate.date < today) {
    throw new AppError(422, 'EXCEPTION_IN_PAST', 'Không thể tạo ngoại lệ cho ngày đã qua.', [
      { path: 'date' },
    ]);
  }
  const sameDay = (await repo.listExceptions(db, tutorId, candidate.date)).filter(
    (e) => e.date === candidate.date && e.id !== candidate.id,
  );
  if (sameDay.some((e) => exceptionsConflict(e, candidate))) {
    throw new AppError(
      422,
      'EXCEPTION_OVERLAP',
      'Ngày này đã có ngoại lệ trùng khung giờ. Hãy sửa hoặc xóa ngoại lệ cũ.',
      [{ path: 'date' }],
    );
  }
  return timezone;
}

export async function createException(
  db: Db,
  tutorId: string,
  input: ExceptionInput,
  now = new Date(),
): Promise<ExceptionSaveResult> {
  const exception = toException(crypto.randomUUID(), input);
  const timezone = await validateException(db, tutorId, exception, now);
  if (
    (await repo.countUpcomingExceptions(db, tutorId, todayIn(timezone, now))) >=
    MAX_UPCOMING_EXCEPTIONS
  ) {
    throw new AppError(422, 'TOO_MANY_EXCEPTIONS', 'Đã đạt số ngoại lệ tối đa.');
  }
  await repo.insertException(db, {
    id: exception.id,
    tutorId,
    dateLocal: exception.date,
    kind: exception.kind,
    startLocal: exception.start,
    endLocal: exception.end,
    timezone,
    createdAt: now.toISOString(),
  });
  return { exception, affectedBookings: await countUncoveredBookings(db, tutorId, now) };
}

const notFound = () => new AppError(404, 'EXCEPTION_NOT_FOUND', 'Không tìm thấy ngoại lệ.');

export async function updateException(
  db: Db,
  tutorId: string,
  id: string,
  input: ExceptionInput,
  now = new Date(),
): Promise<ExceptionSaveResult> {
  if (!(await repo.findException(db, tutorId, id))) throw notFound();
  const exception = toException(id, input);
  await validateException(db, tutorId, exception, now);
  await repo.updateException(db, tutorId, id, {
    dateLocal: exception.date,
    kind: exception.kind,
    startLocal: exception.start,
    endLocal: exception.end,
  });
  return { exception, affectedBookings: await countUncoveredBookings(db, tutorId, now) };
}

export async function deleteException(db: Db, tutorId: string, id: string, now = new Date()) {
  if (!(await repo.findException(db, tutorId, id))) throw notFound();
  await repo.deleteException(db, tutorId, id);
  return {
    deleted: true as const,
    affectedBookings: await countUncoveredBookings(db, tutorId, now),
  };
}
