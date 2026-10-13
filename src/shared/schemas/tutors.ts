import { z } from 'zod';

export const MIN_HOURLY_RATE = 10_000;
export const MAX_HOURLY_RATE = 10_000_000;
/** DEC-004: rates are whole thousands of VND so every 30-minute multiple prices to an integer. */
export const RATE_STEP = 1_000;
export const MAX_SUBJECTS_PER_TUTOR = 10;
export const MAX_BIO_LENGTH = 2_000;
export const GRADE_OPTIONS = Array.from({ length: 12 }, (_, i) => `Lớp ${i + 1}`).concat([
  'Ôn thi đại học',
  'Tiếng Anh giao tiếp',
]);
export const MAX_PREFERRED_AREAS = 12;

const preferredGradesSchema = z
  .array(z.string().refine((grade) => GRADE_OPTIONS.includes(grade), 'Lớp học không hợp lệ.'))
  .max(GRADE_OPTIONS.length)
  .refine((grades) => new Set(grades).size === grades.length, 'Lớp học bị trùng.');
const preferredAreasSchema = z
  .array(z.string().trim().min(1).max(80))
  .max(MAX_PREFERRED_AREAS)
  .refine(
    (areas) => new Set(areas.map((area) => area.toLocaleLowerCase('vi'))).size === areas.length,
    'Khu vực bị trùng.',
  );

export const updateTutorProfileSchema = z
  .strictObject({
    displayName: z.string().trim().min(1).max(100),
    bio: z.string().trim().max(MAX_BIO_LENGTH),
    subjectIds: z
      .array(z.string().min(1).max(64))
      .max(MAX_SUBJECTS_PER_TUTOR)
      .refine((ids) => new Set(ids).size === ids.length, 'Môn học bị trùng.'),
    hourlyRateMinor: z
      .int('Học phí phải là số nguyên.')
      .min(MIN_HOURLY_RATE, `Học phí tối thiểu ${MIN_HOURLY_RATE.toLocaleString('vi-VN')} ₫/giờ.`)
      .max(MAX_HOURLY_RATE)
      .refine((v) => v % RATE_STEP === 0, 'Học phí phải là bội số của 1.000 ₫.'),
    teachesOnline: z.boolean(),
    teachesOffline: z.boolean(),
    preferredGrades: preferredGradesSchema,
    preferredAreas: preferredAreasSchema,
    negotiableTime: z.boolean(),
    tutorType: z.enum(['university_student', 'pedagogy_student', 'teacher']).nullable(),
    school: z.string().trim().min(1).max(120).nullable(),
    specialization: z.string().trim().min(1).max(160).nullable(),
    experienceYears: z.number().int().min(0).max(60).nullable(),
    experienceSummary: z.string().trim().min(1).max(500).nullable(),
  })
  .partial();
export type UpdateTutorProfileInput = z.infer<typeof updateTutorProfileSchema>;

export type ApprovalStatus = 'draft' | 'pending' | 'approved' | 'rejected';
export type Visibility = 'private' | 'public';

export interface Subject {
  id: string;
  slug: string;
  name: string;
}

/** Fields still required before a profile can be submitted for review. */
export type ProfileRequirement = 'bio' | 'subjects' | 'hourlyRate' | 'teachingMode';

export interface TutorProfile {
  userId: string;
  slug: string;
  displayName: string;
  bio: string;
  hourlyRateMinor: number | null;
  currency: 'VND';
  teachesOnline: boolean;
  teachesOffline: boolean;
  preferredGrades: string[];
  preferredAreas: string[];
  negotiableTime: boolean;
  subjects: Subject[];
  approvalStatus: ApprovalStatus;
  visibility: Visibility;
  /** Admin's reason when the profile was rejected or hidden. */
  moderationNote: string | null;
  missing: ProfileRequirement[];
  tutorType: 'university_student' | 'pedagogy_student' | 'teacher' | null;
  school: string | null;
  specialization: string | null;
  experienceYears: number | null;
  experienceSummary: string | null;
  hasPhoto: boolean;
}

export const PROFILE_PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export const PROFILE_PHOTO_MAX_BYTES = 1_048_576;

export const PROFILE_REQUIREMENT_LABELS: Record<ProfileRequirement, string> = {
  bio: 'Giới thiệu bản thân',
  subjects: 'Ít nhất một môn dạy',
  hourlyRate: 'Học phí theo giờ',
  teachingMode: 'Ít nhất một hình thức dạy',
};

export const APPROVAL_STATUS_LABELS: Record<ApprovalStatus, string> = {
  draft: 'Bản nháp',
  pending: 'Chờ duyệt',
  approved: 'Đã duyệt',
  rejected: 'Bị từ chối',
};
