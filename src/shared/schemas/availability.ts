import { z } from 'zod';

export const DEFAULT_TIMEZONE = 'Asia/Ho_Chi_Minh';
export const SLOT_MINUTES = 30;
export const MAX_WEEKLY_RULES = 100;

/** 'HH:MM' on the 30-minute grid. */
const TIME_RE = /^([01]\d|2[0-4]):([03]0)$/;

export function timeToMinutes(value: string): number {
  const [h, m] = value.split(':').map(Number);
  return h! * 60 + m!;
}

const startTime = z
  .string()
  .regex(TIME_RE, 'Giờ phải theo dạng HH:MM, bước 30 phút.')
  .refine((v) => timeToMinutes(v) <= 23 * 60 + 30, 'Giờ bắt đầu tối đa 23:30.');
const endTime = z
  .string()
  .regex(TIME_RE, 'Giờ phải theo dạng HH:MM, bước 30 phút.')
  .refine((v) => timeToMinutes(v) <= 24 * 60, 'Giờ kết thúc tối đa 24:00.');

export function isValidTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

export const timeZoneSchema = z
  .string()
  .min(1)
  .max(64)
  .refine(isValidTimeZone, 'Múi giờ không hợp lệ (IANA, ví dụ Asia/Ho_Chi_Minh).');

/** Calendar date 'YYYY-MM-DD' that actually exists. */
export const localDateSchema = z.iso.date('Ngày phải theo dạng YYYY-MM-DD.');

export const weeklyRuleSchema = z
  .strictObject({
    weekday: z.int().min(1).max(7), // 1 = Monday .. 7 = Sunday
    start: startTime,
    end: endTime,
    effectiveFrom: localDateSchema.nullish(),
    effectiveTo: localDateSchema.nullish(),
  })
  .refine((r) => timeToMinutes(r.start) < timeToMinutes(r.end), {
    message: 'Giờ bắt đầu phải trước giờ kết thúc (không vắt qua nửa đêm).',
    path: ['end'],
  })
  .refine((r) => !r.effectiveFrom || !r.effectiveTo || r.effectiveFrom <= r.effectiveTo, {
    message: 'Ngày hiệu lực không hợp lệ.',
    path: ['effectiveTo'],
  });
export type WeeklyRuleInput = z.infer<typeof weeklyRuleSchema>;

export const putWeeklyAvailabilitySchema = z.strictObject({
  timezone: timeZoneSchema.default(DEFAULT_TIMEZONE),
  rules: z.array(weeklyRuleSchema).max(MAX_WEEKLY_RULES),
});
export type PutWeeklyAvailabilityInput = z.infer<typeof putWeeklyAvailabilitySchema>;

export interface WeeklyRule {
  id: string;
  weekday: number;
  start: string;
  end: string;
  effectiveFrom: string | null;
  effectiveTo: string | null;
}

export interface WeeklyAvailability {
  timezone: string;
  rules: WeeklyRule[];
}

export const MAX_UPCOMING_EXCEPTIONS = 200;

/** Date-specific override. `closed` without times closes the whole local day. */
export const exceptionInputSchema = z
  .strictObject({
    date: localDateSchema,
    kind: z.enum(['closed', 'extra']),
    start: startTime.nullish(),
    end: endTime.nullish(),
  })
  .refine((e) => (e.start == null) === (e.end == null), {
    message: 'Cần nhập cả giờ bắt đầu và giờ kết thúc.',
    path: ['end'],
  })
  .refine((e) => e.kind === 'closed' || e.start != null, {
    message: 'Khung giờ mở thêm cần có giờ bắt đầu và kết thúc.',
    path: ['start'],
  })
  .refine(
    (e) => e.start == null || e.end == null || timeToMinutes(e.start) < timeToMinutes(e.end),
    {
      message: 'Giờ bắt đầu phải trước giờ kết thúc (không vắt qua nửa đêm).',
      path: ['end'],
    },
  );
export type ExceptionInput = z.infer<typeof exceptionInputSchema>;

export interface AvailabilityException {
  id: string;
  date: string;
  kind: 'closed' | 'extra';
  start: string | null;
  end: string | null;
}

export interface ExceptionList {
  timezone: string;
  exceptions: AvailabilityException[];
}

/**
 * Every availability mutation reports how many upcoming PENDING/CONFIRMED bookings are no longer
 * covered by the new schedule. Bookings are never changed automatically (PLAN §3.2.6).
 */
export interface AffectedBookings {
  affectedBookings: number;
}

export type WeeklyAvailabilitySaveResult = WeeklyAvailability & AffectedBookings;
export type ExceptionSaveResult = { exception: AvailabilityException } & AffectedBookings;
