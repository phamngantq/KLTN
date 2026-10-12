import { z } from 'zod';
import type { EducationLevel } from './requests';

export const PRICING_LEVELS = ['basic', 'advanced', 'intensive'] as const;
export const PRICING_MODES = ['online', 'offline'] as const;
export const PRICING_CATALOG_STATUSES = ['draft', 'published', 'retired'] as const;

const money = z.number().int().min(0).max(100_000_000);
const subjectId = z.string().min(1).max(80);
const gradeLabel = z.string().trim().min(1).max(40);

export const createTuitionPriceSchema = z.strictObject({
  subjectId,
  gradeLabel,
  level: z.enum(PRICING_LEVELS),
  mode: z.enum(PRICING_MODES),
  pricePerSessionMinor: money.min(1),
});
export type CreateTuitionPriceInput = z.infer<typeof createTuitionPriceSchema>;

export const updateTuitionPriceSchema = z.strictObject({
  editVersion: z.number().int().min(1),
  pricePerSessionMinor: money.min(1),
});
export type UpdateTuitionPriceInput = z.infer<typeof updateTuitionPriceSchema>;

export const createClassFeeGuidanceSchema = z
  .strictObject({
    mode: z.enum(PRICING_MODES),
    minFeeMinor: money,
    maxFeeMinor: money,
    description: z.string().trim().min(10).max(500),
  })
  .refine((value) => value.minFeeMinor <= value.maxFeeMinor, {
    path: ['maxFeeMinor'],
    message: 'Phí tối đa phải bằng hoặc cao hơn phí tối thiểu.',
  });
export type CreateClassFeeGuidanceInput = z.infer<typeof createClassFeeGuidanceSchema>;

export const updateClassFeeGuidanceSchema = z
  .strictObject({
    editVersion: z.number().int().min(1),
    minFeeMinor: money,
    maxFeeMinor: money,
    description: z.string().trim().min(10).max(500),
  })
  .refine((value) => value.minFeeMinor <= value.maxFeeMinor, {
    path: ['maxFeeMinor'],
    message: 'Phí tối đa phải bằng hoặc cao hơn phí tối thiểu.',
  });
export type UpdateClassFeeGuidanceInput = z.infer<typeof updateClassFeeGuidanceSchema>;

export const catalogPublishSchema = z.strictObject({ editVersion: z.number().int().min(1) });
export const catalogRetireSchema = z.strictObject({ version: z.number().int().min(1) });
export const catalogDiscardSchema = catalogPublishSchema;

export interface TuitionPriceVersion {
  id: string;
  subjectId: string;
  subjectName: string;
  gradeLabel: string;
  level: (typeof PRICING_LEVELS)[number];
  mode: (typeof PRICING_MODES)[number];
  pricePerSessionMinor: number;
  version: number;
  editVersion: number;
  status: (typeof PRICING_CATALOG_STATUSES)[number];
  publishedAt: string | null;
  createdAt: string;
}

export interface ClassFeeGuidanceVersion {
  id: string;
  mode: (typeof PRICING_MODES)[number];
  minFeeMinor: number;
  maxFeeMinor: number;
  description: string;
  version: number;
  editVersion: number;
  status: (typeof PRICING_CATALOG_STATUSES)[number];
  publishedAt: string | null;
  createdAt: string;
}

/** Learner "Bảng giá": reference ranges per session, by tutor type or by subject. */
export const LEARNER_PRICE_DIMENSIONS = ['tutor_type', 'subject'] as const;
export type LearnerPriceDimension = (typeof LEARNER_PRICE_DIMENSIONS)[number];
export const TUTOR_TYPES = ['university_student', 'pedagogy_student', 'teacher'] as const;
export type TutorType = (typeof TUTOR_TYPES)[number];
export const TUTOR_TYPE_LABELS: Record<TutorType, string> = {
  university_student: 'Sinh viên',
  pedagogy_student: 'Sinh viên sư phạm',
  teacher: 'Giáo viên',
};

export interface LearnerPriceGuide {
  id: string;
  dimension: LearnerPriceDimension;
  tutorType: TutorType | null;
  subjectId: string | null;
  subjectName: string | null;
  educationLevel: EducationLevel;
  minPriceMinor: number;
  maxPriceMinor: number;
}
