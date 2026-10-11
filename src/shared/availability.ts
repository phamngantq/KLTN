/**
 * Pure availability rules shared by the Worker (authoritative) and the browser (instant feedback).
 * Precedence on a given local date: weekly rules → `extra` windows add → `closed` removes.
 * A closed exception therefore always wins over both weekly rules and extra windows.
 */
import { SLOT_MINUTES, timeToMinutes } from './schemas/availability';
import { addDays, DAY_MINUTES, localToUtc, weekdayOf } from './time';

export interface WindowLike {
  start: string;
  end: string;
}

export interface WeeklyRuleLike extends WindowLike {
  weekday: number;
  effectiveFrom?: string | null | undefined;
  effectiveTo?: string | null | undefined;
}

export interface ExceptionLike {
  date: string;
  kind: 'closed' | 'extra';
  start: string | null;
  end: string | null;
}

/** Half-open [start, end) windows overlap. Touching windows do not. */
export function windowsOverlap(a: WindowLike, b: WindowLike): boolean {
  return (
    timeToMinutes(a.start) < timeToMinutes(b.end) && timeToMinutes(b.start) < timeToMinutes(a.end)
  );
}

function datesIntersect(a: WeeklyRuleLike, b: WeeklyRuleLike): boolean {
  const aFrom = a.effectiveFrom ?? '0000-01-01';
  const aTo = a.effectiveTo ?? '9999-12-31';
  const bFrom = b.effectiveFrom ?? '0000-01-01';
  const bTo = b.effectiveTo ?? '9999-12-31';
  return aFrom <= bTo && bFrom <= aTo;
}

/** Index pairs of weekly rules overlapping on the same weekday while both are in effect. */
export function findOverlaps(
  rules: readonly WeeklyRuleLike[],
): { first: number; second: number }[] {
  const overlaps: { first: number; second: number }[] = [];
  for (let i = 0; i < rules.length; i++) {
    for (let j = i + 1; j < rules.length; j++) {
      const a = rules[i]!;
      const b = rules[j]!;
      if (a.weekday === b.weekday && windowsOverlap(a, b) && datesIntersect(a, b)) {
        overlaps.push({ first: i, second: j });
      }
    }
  }
  return overlaps;
}

/** Whole-day closures have no times; they conflict with anything on the same date. */
export function exceptionsConflict(a: ExceptionLike, b: ExceptionLike): boolean {
  if (a.date !== b.date) return false;
  if (a.start === null || b.start === null) return true;
  return windowsOverlap(a as WindowLike, b as WindowLike);
}

function ruleApplies(rule: WeeklyRuleLike, date: string, weekday: number): boolean {
  return (
    rule.weekday === weekday &&
    (!rule.effectiveFrom || rule.effectiveFrom <= date) &&
    (!rule.effectiveTo || date <= rule.effectiveTo)
  );
}

/** Local minute offsets (multiples of 30) that are open on `date`. */
export function openMinutesOn(
  date: string,
  rules: readonly WeeklyRuleLike[],
  exceptions: readonly ExceptionLike[],
): number[] {
  const weekday = weekdayOf(date);
  const open = new Set<number>();
  const addWindow = (w: WindowLike) => {
    for (let m = timeToMinutes(w.start); m < timeToMinutes(w.end); m += SLOT_MINUTES) open.add(m);
  };
  for (const rule of rules) if (ruleApplies(rule, date, weekday)) addWindow(rule);
  const today = exceptions.filter((e) => e.date === date);
  for (const e of today) if (e.kind === 'extra' && e.start && e.end) addWindow(e as WindowLike);
  for (const e of today) {
    if (e.kind !== 'closed') continue;
    const from = e.start ? timeToMinutes(e.start) : 0;
    const to = e.end ? timeToMinutes(e.end) : DAY_MINUTES;
    for (const m of [...open]) if (m >= from && m < to) open.delete(m);
  }
  return [...open].sort((a, b) => a - b);
}

/** UTC epoch-ms starts of every open 30-minute cell for local dates in [fromDate, toDate]. */
export function openCellsUtc(
  fromDate: string,
  toDate: string,
  rules: readonly WeeklyRuleLike[],
  exceptions: readonly ExceptionLike[],
  timeZone: string,
): Set<number> {
  const cells = new Set<number>();
  for (let date = fromDate; date <= toDate; date = addDays(date, 1)) {
    for (const minutes of openMinutesOn(date, rules, exceptions)) {
      cells.add(localToUtc(date, minutes, timeZone).getTime());
    }
  }
  return cells;
}

/** All 30-minute cell starts covered by [startMs, endMs). */
export function cellsOf(startMs: number, endMs: number): number[] {
  const cells: number[] = [];
  for (let t = startMs; t < endMs; t += SLOT_MINUTES * 60_000) cells.push(t);
  return cells;
}

export interface SlotProjectionInput {
  rules: readonly WeeklyRuleLike[];
  exceptions: readonly ExceptionLike[];
  /** UTC epoch-ms of 30-minute cells already claimed by active bookings. */
  claimed: ReadonlySet<number>;
  fromDate: string;
  toDate: string;
  timeZone: string;
  durationMinutes: number;
  now: Date;
}

/**
 * Bookable start instants: every run of `duration / 30` consecutive open, unclaimed, future
 * cells. Pure — the booking API re-runs it server-side; the UI only displays it.
 */
export function projectSlots(input: SlotProjectionInput): { startMs: number; endMs: number }[] {
  const cellMs = SLOT_MINUTES * 60_000;
  const needed = input.durationMinutes / SLOT_MINUTES;
  const nowMs = input.now.getTime();
  const open = openCellsUtc(
    input.fromDate,
    input.toDate,
    input.rules,
    input.exceptions,
    input.timeZone,
  );
  const free = new Set([...open].filter((cell) => cell >= nowMs && !input.claimed.has(cell)));
  const slots: { startMs: number; endMs: number }[] = [];
  for (const start of [...free].sort((a, b) => a - b)) {
    let ok = true;
    for (let i = 1; i < needed && ok; i++) ok = free.has(start + i * cellMs);
    if (ok) slots.push({ startMs: start, endMs: start + needed * cellMs });
  }
  return slots;
}
