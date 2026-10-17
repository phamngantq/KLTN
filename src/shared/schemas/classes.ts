import { z } from 'zod';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './discovery';
import { REQUEST_GRADE_OPTIONS, requestScheduleSchema } from './requests';

export const CLASS_STATUSES = ['draft', 'open', 'active', 'completed', 'cancelled'] as const;
export type ClassStatus = (typeof CLASS_STATUSES)[number];
export const APPLICATION_STATUSES = ['submitted', 'withdrawn', 'rejected', 'selected'] as const;
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];
export const FEE_OPTION_KEYS = [
  'first_lesson_percent',
  'lesson_multiplier_with_deposit',
  'monthly_percent',
] as const;
export type FeeOptionKey = (typeof FEE_OPTION_KEYS)[number];
export const FEE_OPTION_STATUSES = ['draft', 'published'] as const;

export const classSorts = ['newest', 'oldest', 'budget_asc', 'budget_desc'] as const;
export const MATCH_ADJUSTMENTS = ['grade', 'area', 'schedule'] as const;
export const MATCH_ALGORITHM_VERSION = '2026-10-12-v1';
export type MatchAdjustment = (typeof MATCH_ADJUSTMENTS)[number];
export type MatchCriterionKey = 'subject' | 'mode' | MatchAdjustment | 'budget';
export interface MatchCriterion {
  key: MatchCriterionKey;
  score: number;
  maxScore: number;
  status: 'match' | 'adjustable' | 'unknown';
  reason: string;
}
/** Exact fields the tutor agrees to add/change in their own profile. */
export interface MatchProfileChanges {
  preferredGrade: string | null;
  preferredArea: string | null;
  negotiableTime: boolean;
}
export interface ClassMatch {
  algorithmVersion: typeof MATCH_ALGORITHM_VERSION;
  score: number;
  /** Percentage of criteria with enough structured data to assess. */
  coverage: number;
  level: 'strong' | 'near' | 'uncertain' | 'low';
  criteria: MatchCriterion[];
  adjustments: MatchAdjustment[];
  profileChangesPreview: MatchProfileChanges;
}
export interface ClassRecommendation {
  class: PublicClass;
  match: ClassMatch;
}
/** Recorded at application time; these are tutor commitments, not agreed terms with the parent. */
export interface ApplicationMatchSnapshot {
  algorithmVersion: typeof MATCH_ALGORITHM_VERSION;
  classVersion: number;
  score: number;
  acceptedAdjustments: MatchAdjustment[];
  profileChanges?: MatchProfileChanges;
}
const pageFields = {
  page: z.coerce.number().int().min(1).max(1000).default(1),
  pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
};

export const classSearchSchema = z.strictObject({
  subjectId: z.string().min(1).max(80).optional(),
  grade: z
    .string()
    .refine((grade) => REQUEST_GRADE_OPTIONS.includes(grade))
    .optional(),
  mode: z.enum(['online', 'offline']).optional(),
  area: z.string().trim().min(1).max(120).optional(),
  /** Keyword over code, subject, grade and area. */
  q: z.string().trim().min(1).max(100).optional(),
  sort: z.enum(classSorts).default('newest'),
  ...pageFields,
});
export type ClassSearchQuery = z.infer<typeof classSearchSchema>;
/** Ranking is always by match score; callers cannot request an ignored sort order. */
export const classRecommendationQuerySchema = classSearchSchema.omit({ sort: true });

/** Broad location is chosen by a moderator and cannot contain an obvious contact/address. */
const publicArea = z
  .string()
  .trim()
  .min(2)
  .max(120)
  .refine(
    (value) =>
      !/@|https?:|\+?[0-9][0-9 .-]{6,}[0-9]|\b(?:số|đường|ngõ|hẻm|phố|street)\b/iu.test(value),
    'Khu vực công khai không được chứa địa chỉ hoặc thông tin liên hệ.',
  );

export const createClassSchema = z.strictObject({
  sourceRequestId: z.uuid(),
  requestVersion: z.number().int().min(1),
  publicArea: publicArea.nullable(),
});
export type CreateClassInput = z.infer<typeof createClassSchema>;
export const publishClassSchema = z.strictObject({ version: z.number().int().min(1) });
export const refreshClassSchema = z.strictObject({
  version: z.number().int().min(1),
  requestVersion: z.number().int().min(1),
  publicArea: publicArea.nullable(),
});
export type RefreshClassInput = z.infer<typeof refreshClassSchema>;
export const adminClassListSchema = z.strictObject({
  status: z.enum(CLASS_STATUSES).optional(),
  ...pageFields,
});

export interface PublicClass {
  id: string;
  code: string;
  subjectId: string;
  subjectName: string;
  grade: string;
  mode: 'online' | 'offline';
  publicArea: string | null;
  /** Parent's expected budget, never an agreed tutor fee or class-acceptance charge. */
  expectedBudgetMinor: number | null;
  status: ClassStatus;
  version: number;
  schedule: z.infer<typeof requestScheduleSchema>;
  publishedAt: string | null;
  createdAt: string;
  /**
   * Structured fields of the source request; null for guests, who see only the summary.
   * The request's free-text description stays private (it may hold contact details).
   */
  sessionsPerWeek: number | null;
  tutorRequirements: string | null;
  studentTraits: string | null;
  /** "Phí nhận lớp": monthly-percent policy × budget × sessions/week × 4; null when unknown. */
  placementFeeMinor: number | null;
}

/** The single placement-fee policy tutors accept ("Phí nhận lớp"). */
export const PLACEMENT_FEE_OPTION_KEY = 'monthly_percent' as const;
/** Weeks counted in one month of tuition for the placement fee. */
export const PLACEMENT_FEE_WEEKS = 4;

/** Sessions per week for the fee: the request's own count, else its weekly time slots. */
export function feeSessionsPerWeek(
  sessionsPerWeek: number | null,
  weeklyWindows: number,
): number | null {
  return sessionsPerWeek ?? (weeklyWindows > 0 ? weeklyWindows : null);
}

export function placementFee(
  budgetMinor: number | null,
  sessionsPerWeek: number | null,
  rateBasisPoints: number | null,
): number | null {
  if (budgetMinor === null || !sessionsPerWeek || rateBasisPoints === null) return null;
  return Math.round(
    (budgetMinor * sessionsPerWeek * PLACEMENT_FEE_WEEKS * rateBasisPoints) / 10_000,
  );
}

export interface AdminClass extends PublicClass {
  sourceRequestId: string;
  sourceRequestVersion: number;
  parentUserId: string;
  updatedAt: string;
}

const feeParameters = z.strictObject({
  optionKey: z.enum(FEE_OPTION_KEYS),
  title: z.string().trim().min(2).max(120),
  policyText: z.string().trim().min(10).max(2000),
  /** 10000 = 100%; for lesson_multiplier_with_deposit, 30000 = 3 × lesson fee. */
  rateBasisPoints: z.number().int().min(1).max(100_000),
  depositBasisPoints: z.number().int().min(1).max(10_000).nullable(),
  scopeSubjectId: z.string().min(1).max(80).nullable(),
  scopeMode: z.enum(['online', 'offline']).nullable(),
  effectiveFrom: z.iso.datetime({ offset: true }).nullable(),
  effectiveTo: z.iso.datetime({ offset: true }).nullable(),
});

export const createFeeOptionSchema = feeParameters
  .superRefine((value, ctx) => {
    if (value.optionKey === 'lesson_multiplier_with_deposit') {
      if (value.depositBasisPoints === null)
        ctx.addIssue({
          code: 'custom',
          path: ['depositBasisPoints'],
          message: 'Cần tỷ lệ đặt cọc.',
        });
    } else {
      if (value.depositBasisPoints !== null)
        ctx.addIssue({
          code: 'custom',
          path: ['depositBasisPoints'],
          message: 'Phương án này không có đặt cọc.',
        });
      if (value.rateBasisPoints > 10_000)
        ctx.addIssue({
          code: 'custom',
          path: ['rateBasisPoints'],
          message: 'Tỷ lệ không được quá 100%.',
        });
    }
    if (
      value.effectiveFrom &&
      value.effectiveTo &&
      Date.parse(value.effectiveFrom) >= Date.parse(value.effectiveTo)
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['effectiveTo'],
        message: 'Ngày kết thúc phải sau ngày bắt đầu.',
      });
    }
  })
  .transform((value) => ({
    ...value,
    effectiveFrom: value.effectiveFrom ? new Date(value.effectiveFrom).toISOString() : null,
    effectiveTo: value.effectiveTo ? new Date(value.effectiveTo).toISOString() : null,
  }));
export type CreateFeeOptionInput = z.infer<typeof createFeeOptionSchema>;
export const publishFeeOptionSchema = z.strictObject({ version: z.number().int().min(1) });
export const feeOptionsForClassSchema = z.strictObject({ classId: z.uuid() });

export interface FeeOptionVersion {
  id: string;
  optionKey: FeeOptionKey;
  version: number;
  title: string;
  policyText: string;
  rateBasisPoints: number;
  depositBasisPoints: number | null;
  scopeSubjectId: string | null;
  scopeMode: 'online' | 'offline' | null;
  status: 'draft' | 'published';
  effectiveFrom: string | null;
  effectiveTo: string | null;
  publishedAt: string | null;
}

const clockTime = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Giờ không hợp lệ.');

const availabilityWindow = z
  .strictObject({
    weekday: z.number().int().min(1).max(7),
    startLocal: clockTime,
    endLocal: clockTime,
  })
  .refine((window) => window.startLocal < window.endLocal, {
    message: 'Giờ kết thúc phải sau giờ bắt đầu.',
    path: ['endLocal'],
  });

/** "Thời gian rảnh có thể đi dạy" for one application: cells of the weekly matrix. */
export const applicationAvailabilitySchema = z.strictObject({
  windows: z
    .array(availabilityWindow)
    .min(1, 'Chọn ít nhất một khung giờ có thể dạy.')
    .max(49)
    .refine(
      (windows) =>
        new Set(windows.map((w) => `${w.weekday}-${w.startLocal}`)).size === windows.length,
      'Khung giờ bị trùng.',
    ),
});
export type ApplicationAvailability = z.infer<typeof applicationAvailabilitySchema>;

export const applyClassSchema = z.strictObject({
  feeOptionVersionId: z.uuid(),
  classVersion: z.number().int().min(1),
  availability: applicationAvailabilitySchema,
  /** "Tôi xác nhận đã đọc và đồng ý với Điều khoản trách nhiệm của trung tâm". */
  termsAgreed: z.literal(true, 'Cần xác nhận đồng ý với Điều khoản trách nhiệm.'),
  acceptedAdjustments: z
    .array(z.enum(MATCH_ADJUSTMENTS))
    .max(MATCH_ADJUSTMENTS.length)
    .refine((values) => new Set(values).size === values.length)
    .optional(),
});
export type ApplyClassInput = z.infer<typeof applyClassSchema>;
export const withdrawApplicationSchema = z.strictObject({ version: z.number().int().min(1) });
export const tutorApplicationListSchema = z.strictObject({
  status: z.enum(APPLICATION_STATUSES).optional(),
  ...pageFields,
});
export interface TutorApplication {
  id: string;
  classId: string;
  feeOptionVersionId: string;
  status: ApplicationStatus;
  rejectionReason: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
  matchSnapshot: ApplicationMatchSnapshot | null;
  /** Null for applications sent before the free-time step existed. */
  availability: ApplicationAvailability | null;
  class: PublicClass;
}
