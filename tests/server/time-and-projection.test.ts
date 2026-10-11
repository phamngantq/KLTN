import { describe, expect, it } from 'vitest';
import { openCellsUtc, openMinutesOn } from '../../src/shared/availability';
import { addDays, localToUtc, todayIn, utcToLocal, weekdayOf } from '../../src/shared/time';

const VN = 'Asia/Ho_Chi_Minh';
const NY = 'America/New_York';

describe('time conversion', () => {
  it('converts Vietnam local time (UTC+7, no DST) to UTC and back', () => {
    expect(localToUtc('2026-11-02', 18 * 60, VN).toISOString()).toBe('2026-11-02T11:00:00.000Z');
    expect(localToUtc('2026-11-02', 3 * 60, VN).toISOString()).toBe('2026-11-01T20:00:00.000Z');
    expect(utcToLocal(Date.parse('2026-11-01T20:00:00.000Z'), VN)).toEqual({
      date: '2026-11-02',
      minutes: 180,
    });
  });

  it('treats 24:00 as the next local midnight', () => {
    expect(localToUtc('2026-11-02', 24 * 60, VN).toISOString()).toBe('2026-11-02T17:00:00.000Z');
  });

  it('handles DST offsets (America/New_York)', () => {
    expect(localToUtc('2026-07-01', 9 * 60, NY).toISOString()).toBe('2026-07-01T13:00:00.000Z'); // EDT
    expect(localToUtc('2026-12-01', 9 * 60, NY).toISOString()).toBe('2026-12-01T14:00:00.000Z'); // EST
    // Spring forward 2026-03-08 02:00 → 03:00; 03:30 local exists as EDT.
    expect(localToUtc('2026-03-08', 3 * 60 + 30, NY).toISOString()).toBe(
      '2026-03-08T07:30:00.000Z',
    );
  });

  it('computes ISO weekdays and calendar arithmetic', () => {
    expect(weekdayOf('2026-10-11')).toBe(7); // Sunday
    expect(weekdayOf('2026-10-12')).toBe(1); // Monday
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(todayIn(VN, new Date('2026-10-11T18:30:00.000Z'))).toBe('2026-10-12');
  });
});

describe('availability projection', () => {
  const monday = '2026-10-12';
  const rules = [{ weekday: 1, start: '18:00', end: '20:00' }];

  it('opens 30-minute cells from weekly rules on matching weekdays only', () => {
    expect(openMinutesOn(monday, rules, [])).toEqual([1080, 1110, 1140, 1170]);
    expect(openMinutesOn('2026-10-13', rules, [])).toEqual([]);
  });

  it('respects effective date ranges', () => {
    const ranged = [{ ...rules[0]!, effectiveFrom: '2026-10-19', effectiveTo: null }];
    expect(openMinutesOn(monday, ranged, [])).toEqual([]);
    expect(openMinutesOn('2026-10-19', ranged, [])).toHaveLength(4);
  });

  it('applies extra windows then closed windows (closed wins)', () => {
    const extra = { date: monday, kind: 'extra' as const, start: '08:00', end: '09:00' };
    expect(openMinutesOn(monday, rules, [extra])).toEqual([480, 510, 1080, 1110, 1140, 1170]);
    const partialClose = { date: monday, kind: 'closed' as const, start: '18:30', end: '19:30' };
    expect(openMinutesOn(monday, rules, [extra, partialClose])).toEqual([480, 510, 1080, 1170]);
    const dayOff = { date: monday, kind: 'closed' as const, start: null, end: null };
    expect(openMinutesOn(monday, rules, [extra, dayOff])).toEqual([]);
  });

  it('projects local cells to UTC instants', () => {
    const cells = openCellsUtc(monday, monday, rules, [], VN);
    expect([...cells].map((ms) => new Date(ms).toISOString())).toEqual([
      '2026-10-12T11:00:00.000Z',
      '2026-10-12T11:30:00.000Z',
      '2026-10-12T12:00:00.000Z',
      '2026-10-12T12:30:00.000Z',
    ]);
  });
});
