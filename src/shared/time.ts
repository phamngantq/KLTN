/**
 * Local-calendar ↔ UTC conversion for IANA time zones using only Intl (works in Workers and
 * browsers). Local dates are 'YYYY-MM-DD'; local times are minutes since local midnight
 * (0..1440, where 1440 = '24:00').
 */

const MINUTE_MS = 60_000;
export const DAY_MINUTES = 24 * 60;

const formatters = new Map<string, Intl.DateTimeFormat>();

function partsFormatter(timeZone: string): Intl.DateTimeFormat {
  let formatter = formatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    formatters.set(timeZone, formatter);
  }
  return formatter;
}

function localParts(utcMs: number, timeZone: string) {
  const parts = partsFormatter(timeZone).formatToParts(new Date(utcMs));
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)!.value);
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: get('hour'),
    minute: get('minute'),
    second: get('second'),
  };
}

/** Offset (local − UTC) in minutes at the given instant. */
export function offsetMinutes(utcMs: number, timeZone: string): number {
  const p = localParts(utcMs, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return Math.round((asUtc - Math.floor(utcMs / 1000) * 1000) / MINUTE_MS);
}

function parseDate(date: string): [number, number, number] {
  const [y, m, d] = date.split('-').map(Number);
  return [y!, m!, d!];
}

/** UTC instant of `date` + `minutes` in `timeZone`. */
export function localToUtc(date: string, minutes: number, timeZone: string): Date {
  const [y, m, d] = parseDate(date);
  const naive = Date.UTC(y, m - 1, d, 0, minutes);
  const first = naive - offsetMinutes(naive, timeZone) * MINUTE_MS;
  const second = naive - offsetMinutes(first, timeZone) * MINUTE_MS; // settle across DST edges
  return new Date(second);
}

export function formatDateUtc(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** Local calendar date and minutes-since-midnight of an instant. */
export function utcToLocal(utcMs: number, timeZone: string): { date: string; minutes: number } {
  const p = localParts(utcMs, timeZone);
  return {
    date: `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`,
    minutes: p.hour * 60 + p.minute,
  };
}

export function todayIn(timeZone: string, now = new Date()): string {
  return utcToLocal(now.getTime(), timeZone).date;
}

export function addDays(date: string, days: number): string {
  const [y, m, d] = parseDate(date);
  return formatDateUtc(Date.UTC(y, m - 1, d + days));
}

/** ISO weekday: 1 = Monday .. 7 = Sunday. */
export function weekdayOf(date: string): number {
  const [y, m, d] = parseDate(date);
  const day = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return day === 0 ? 7 : day;
}

export function daysBetween(from: string, to: string): number {
  const [y1, m1, d1] = parseDate(from);
  const [y2, m2, d2] = parseDate(to);
  return Math.round(
    (Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / (DAY_MINUTES * MINUTE_MS),
  );
}

export function minutesToTime(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}
