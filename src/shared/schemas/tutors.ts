import { z } from 'zod';
import { HANOI_DISTRICTS, isHanoiDistrict } from './hanoi-wards';
import { TUTOR_TYPES } from './pricing';

export const MIN_HOURLY_RATE = 10_000;
export const MAX_HOURLY_RATE = 10_000_000;
/** DEC-004: rates are whole thousands of VND so every 30-minute multiple prices to an integer. */
export const RATE_STEP = 1_000;
export const MAX_SUBJECTS_PER_TUTOR = 10;
export const MAX_BIO_LENGTH = 2_000;
/** Grades offered as checkboxes ("Lớp học có thể dạy"). */
export const DEFAULT_GRADE_OPTIONS = Array.from({ length: 12 }, (_, i) => `Lớp ${i + 1}`).concat([
  'Tiền tiểu học',
  'Ôn thi đại học',
]);
/** System grades; the last one is legacy, kept valid for profiles that already chose it. */
export const GRADE_OPTIONS = [...DEFAULT_GRADE_OPTIONS, 'Tiếng Anh giao tiếp'];
/** Every Hà Nội district can be chosen; the D1 quota (40) stays above it. */
export const MAX_PREFERRED_AREAS = HANOI_DISTRICTS.length;

/**
 * "Tự thêm lựa chọn": tutor-added options per group, at most MAX_CUSTOM_OPTIONS each.
 * Storage still knows "mode" and "area" rows saved earlier; new saves accept only the
 * groups that keep "+ Thêm lựa chọn" (teaching modes and Hà Nội areas are fixed lists).
 */
export const CUSTOM_OPTION_KINDS = ['subject', 'grade', 'mode', 'area'] as const;
export type CustomOptionKind = (typeof CUSTOM_OPTION_KINDS)[number];
export const EDITABLE_OPTION_KINDS = ['subject', 'grade'] as const;
export type EditableOptionKind = (typeof EDITABLE_OPTION_KINDS)[number];
export const MAX_CUSTOM_OPTIONS = 20;
/** Built-in "Hình thức có thể dạy"; they map to teachesOffline / teachesOnline. */
export const DEFAULT_MODE_OPTIONS = ['Trực tiếp', 'Trực tuyến'] as const;
export const MAX_PREFERRED_GRADES = GRADE_OPTIONS.length + MAX_CUSTOM_OPTIONS;

/** Case-insensitive identity of an option label, also used to reject duplicates. */
export function optionKey(label: string): string {
  return label.trim().replace(/\s+/g, ' ').toLocaleLowerCase('vi');
}

export interface TutorCustomOption {
  kind: CustomOptionKind;
  label: string;
  selected: boolean;
}

const customOptionsSchema = z
  .array(
    z
      .strictObject({
        kind: z.enum(EDITABLE_OPTION_KINDS, 'Nhóm này không cho thêm lựa chọn.'),
        label: z.string().trim().min(1, 'Lựa chọn không được để trống.').max(80),
        selected: z.boolean(),
      })
      .refine((option) => option.kind !== 'grade' || option.label.length <= 40, {
        message: 'Lớp học tối đa 40 ký tự.',
        path: ['label'],
      }),
  )
  .max(EDITABLE_OPTION_KINDS.length * MAX_CUSTOM_OPTIONS)
  .refine(
    (options) =>
      EDITABLE_OPTION_KINDS.every(
        (kind) => options.filter((option) => option.kind === kind).length <= MAX_CUSTOM_OPTIONS,
      ),
    `Mỗi nhóm chỉ thêm tối đa ${MAX_CUSTOM_OPTIONS} lựa chọn.`,
  )
  .refine(
    (options) =>
      new Set(options.map((option) => `${option.kind}:${optionKey(option.label)}`)).size ===
      options.length,
    'Lựa chọn bị trùng.',
  );

// Custom grades are checked against the tutor's own options by the service.
const preferredGradesSchema = z
  .array(z.string().trim().min(1).max(40))
  .max(MAX_PREFERRED_GRADES)
  .refine((grades) => new Set(grades).size === grades.length, 'Lớp học bị trùng.');
// Teaching areas are Hà Nội districts only; the server rejects anything else.
const preferredAreasSchema = z
  .array(
    z
      .string()
      .trim()
      .refine((area): boolean => isHanoiDistrict(area), 'Khu vực phải là quận/huyện thuộc Hà Nội.'),
  )
  .max(MAX_PREFERRED_AREAS)
  .refine(
    (areas) => new Set(areas.map((area) => area.toLocaleLowerCase('vi'))).size === areas.length,
    'Khu vực bị trùng.',
  );

/** "Thẻ căn cước": checked at the centre, or from uploaded front/back photos. */
export const ID_VERIFICATION_METHODS = ['center', 'upload'] as const;
export type IdVerificationMethod = (typeof ID_VERIFICATION_METHODS)[number];
export const TUTOR_DOCUMENT_KINDS = ['id_front', 'id_back', 'credential'] as const;
export type TutorDocumentKind = (typeof TUTOR_DOCUMENT_KINDS)[number];
export const TUTOR_DOCUMENT_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
] as const;
export type TutorDocumentType = (typeof TUTOR_DOCUMENT_TYPES)[number];
export const TUTOR_DOCUMENT_MAX_BYTES = 1_572_864;
export const MAX_TUTOR_CREDENTIALS = 10;

export interface TutorDocument {
  id: string;
  kind: TutorDocumentKind;
  fileName: string;
  contentType: TutorDocumentType;
  sizeBytes: number;
  createdAt: string;
}

const todayIso = () => new Date().toISOString().slice(0, 10);
const pastDate = z.iso
  .date('Ngày không hợp lệ.')
  .refine((value) => value <= todayIso(), 'Ngày không được ở tương lai.');

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
    customOptions: customOptionsSchema,
    tutorType: z.enum(TUTOR_TYPES, 'Loại gia sư không hợp lệ.').nullable(),
    school: z.string().trim().min(1).max(120).nullable(),
    specialization: z.string().trim().min(1).max(160).nullable(),
    experienceYears: z.number().int().min(0).max(60).nullable(),
    experienceSummary: z.string().trim().min(1).max(500).nullable(),
    major: z.string().trim().min(1).max(120).nullable(),
    graduationYear: z.number().int().min(1950).max(2100).nullable(),
    // Private: shown only to the tutor and moderators.
    phone: z
      .string()
      .trim()
      .regex(/^\+?[0-9]{8,15}$/, 'Số điện thoại không hợp lệ.')
      .nullable(),
    dateOfBirth: pastDate.nullable(),
    idNumber: z
      .string()
      .trim()
      .regex(/^[0-9]{12}$/, 'Số thẻ CCCD gồm 12 chữ số.')
      .nullable(),
    idIssuedOn: pastDate.nullable(),
    idResidence: z.string().trim().min(1).max(200).nullable(),
    idVerification: z.enum(ID_VERIFICATION_METHODS),
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
  /** Tutor-added options; grade/area ones are selected when listed in preferredGrades/Areas. */
  customOptions: TutorCustomOption[];
  major: string | null;
  graduationYear: number | null;
  /** Account email; changed only through the account, not the profile. */
  email: string;
  // Private facts below are returned only to the owner (and moderators).
  phone: string | null;
  dateOfBirth: string | null;
  idNumber: string | null;
  idIssuedOn: string | null;
  idResidence: string | null;
  idVerification: IdVerificationMethod;
  documents: TutorDocument[];
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
