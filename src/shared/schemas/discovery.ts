import { z } from 'zod';
import type { Subject } from './tutors';

export const DEFAULT_PAGE_SIZE = 12;
export const MAX_PAGE_SIZE = 48;
export const TUTOR_SORTS = ['rate_asc', 'rate_desc', 'newest'] as const;
export type TutorSort = (typeof TUTOR_SORTS)[number];

const optionalInt = (max: number) =>
  z.preprocess(
    (v) => (v === '' || v === undefined ? undefined : v),
    z.coerce.number().int().min(0).max(max).optional(),
  );

/** Query string for GET /tutors. Unknown params are ignored (e.g. utm_*); bad values → 422. */
export const tutorSearchSchema = z
  .object({
    subject: z
      .string()
      .regex(/^[a-z0-9-]{1,80}$/)
      .optional(),
    mode: z.enum(['online', 'offline']).optional(),
    minRate: optionalInt(100_000_000),
    maxRate: optionalInt(100_000_000),
    sort: z.enum(TUTOR_SORTS).default('rate_asc'),
    page: z.coerce.number().int().min(1).max(1000).default(1),
    pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
  })
  .refine((q) => q.minRate === undefined || q.maxRate === undefined || q.minRate <= q.maxRate, {
    message: 'Khoảng giá không hợp lệ.',
    path: ['maxRate'],
  });
export type TutorSearchQuery = z.infer<typeof tutorSearchSchema>;

/** Public tutor card/detail. Contains no contact details or moderation data. */
export interface PublicTutor {
  id: string;
  slug: string;
  displayName: string;
  bio: string;
  hourlyRateMinor: number;
  currency: 'VND';
  teachesOnline: boolean;
  teachesOffline: boolean;
  subjects: Subject[];
}

export interface Page<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}

export const SORT_LABELS: Record<TutorSort, string> = {
  rate_asc: 'Học phí thấp → cao',
  rate_desc: 'Học phí cao → thấp',
  newest: 'Mới nhất',
};
