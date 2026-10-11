import { timeToMinutes, type WeeklyRuleInput } from '../../../shared/schemas/availability';

export interface RuleOverlap {
  first: number;
  second: number;
}

/** Effective ranges intersect; null bounds are open-ended. ISO dates compare lexicographically. */
function datesIntersect(a: WeeklyRuleInput, b: WeeklyRuleInput): boolean {
  const aFrom = a.effectiveFrom ?? '0000-01-01';
  const aTo = a.effectiveTo ?? '9999-12-31';
  const bFrom = b.effectiveFrom ?? '0000-01-01';
  const bTo = b.effectiveTo ?? '9999-12-31';
  return aFrom <= bTo && bFrom <= aTo;
}

/**
 * Pairs of rule indexes whose windows overlap on the same weekday while both are in effect.
 * Touching windows (10:00-12:00 and 12:00-14:00) do not overlap.
 */
export function findOverlaps(rules: readonly WeeklyRuleInput[]): RuleOverlap[] {
  const overlaps: RuleOverlap[] = [];
  for (let i = 0; i < rules.length; i++) {
    for (let j = i + 1; j < rules.length; j++) {
      const a = rules[i]!;
      const b = rules[j]!;
      if (
        a.weekday === b.weekday &&
        timeToMinutes(a.start) < timeToMinutes(b.end) &&
        timeToMinutes(b.start) < timeToMinutes(a.end) &&
        datesIntersect(a, b)
      ) {
        overlaps.push({ first: i, second: j });
      }
    }
  }
  return overlaps;
}
