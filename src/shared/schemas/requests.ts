import { z } from 'zod';
import { DEFAULT_TIMEZONE } from './availability';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './discovery';
import { isHanoiCatalogArea } from './hanoi-wards';

export const REQUEST_STATUSES = [
  'draft',
  'submitted',
  'sourcing',
  'assigned',
  'fulfilled',
  'cancelled',
] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];
/**
 * Sharing rule recorded when a request is sent. v1 (2026-10-11) was a checkbox, v2 a notice
 * above "Gửi yêu cầu"; v3 (2026-10-12) shows no separate notice in the form. Bump on any change.
 */
export const CONTACT_SHARING_CONSENT_VERSION = '2026-10-12-v3';
export const CONTACT_SHARING_CONSENT_TEXT =
  'Khi bạn gửi yêu cầu, môn học, lớp, hình thức, học phí dự kiến và lịch mong muốn sẽ hiển thị trong danh sách lớp tìm gia sư. Họ tên, số điện thoại, khu vực và các ghi chú không được công khai; gia sư chỉ xem số điện thoại và địa chỉ cụ thể (nếu có) sau khi được kiểm duyệt viên gán.';
/** Anti-abuse bound only; the form itself does not limit how many slots a parent picks. */
export const REQUEST_MAX_WINDOWS = 168;
export const REQUEST_GRADE_OPTIONS = Array.from({ length: 12 }, (_, i) => `Lớp ${i + 1}`).concat([
  'Ôn thi đại học',
]);

/** School stage shown as "Cấp học"; each grade option belongs to exactly one stage. */
export const EDUCATION_LEVELS = [
  'primary',
  'lower_secondary',
  'upper_secondary',
  'university_prep',
] as const;
export type EducationLevel = (typeof EDUCATION_LEVELS)[number];
export const EDUCATION_LEVEL_LABELS: Record<EducationLevel, string> = {
  primary: 'Tiểu học',
  lower_secondary: 'THCS',
  upper_secondary: 'THPT',
  university_prep: 'Luyện thi đại học',
};

export function educationLevelForGrade(grade: string): EducationLevel | null {
  const match = /^Lớp (\d{1,2})$/.exec(grade);
  if (match) {
    const value = Number(match[1]);
    if (value >= 1 && value <= 5) return 'primary';
    if (value >= 6 && value <= 9) return 'lower_secondary';
    if (value >= 10 && value <= 12) return 'upper_secondary';
  }
  return grade === 'Ôn thi đại học' ? 'university_prep' : null;
}

const localTime = z.string().regex(/^([01][0-9]|2[0-3]):[0-5][0-9]$/);
const timezone = z
  .string()
  .min(1)
  .max(64)
  .refine((value) => {
    try {
      new Intl.DateTimeFormat('en', { timeZone: value });
      return true;
    } catch {
      return false;
    }
  }, 'Múi giờ không hợp lệ.');

export const requestWindowSchema = z
  .strictObject({
    weekday: z.number().int().min(1).max(7), // Monday = 1, Sunday = 7.
    startLocal: localTime,
    endLocal: localTime,
  })
  .refine((window) => window.startLocal < window.endLocal, {
    path: ['endLocal'],
    message: 'Giờ kết thúc phải sau giờ bắt đầu.',
  });

export const requestScheduleSchema = z
  .strictObject({
    timezone: timezone.default(DEFAULT_TIMEZONE),
    discussLater: z.boolean(),
    windows: z.array(requestWindowSchema).max(REQUEST_MAX_WINDOWS),
  })
  .superRefine((schedule, ctx) => {
    if (schedule.discussLater && schedule.windows.length) {
      ctx.addIssue({
        code: 'custom',
        path: ['windows'],
        message: 'Không chọn giờ khi hẹn trao đổi sau.',
      });
    }
    if (!schedule.discussLater && !schedule.windows.length) {
      ctx.addIssue({ code: 'custom', path: ['windows'], message: 'Cần ít nhất một khung giờ.' });
    }
    const ordered = [...schedule.windows].sort(
      (a, b) => a.weekday - b.weekday || a.startLocal.localeCompare(b.startLocal),
    );
    for (let i = 1; i < ordered.length; i++) {
      const previous = ordered[i - 1]!;
      const current = ordered[i]!;
      if (previous.weekday === current.weekday && previous.endLocal > current.startLocal) {
        ctx.addIssue({
          code: 'custom',
          path: ['windows'],
          message: 'Các khung giờ không được chồng lấn.',
        });
        break;
      }
    }
  });

const requestFields = z.strictObject({
  subjectId: z.string().min(1).max(80),
  grade: z
    .string()
    .refine((grade) => REQUEST_GRADE_OPTIONS.includes(grade), 'Lớp học không hợp lệ.'),
  mode: z.enum(['online', 'offline']),
  area: z.string().trim().min(1).max(120).nullable(),
  expectedBudgetMinor: z.number().int().min(0).max(100_000_000).nullable(),
  description: z.string().trim().max(1000),
  schedule: requestScheduleSchema,
  contactPhone: z
    .string()
    .trim()
    .regex(/^\+?[0-9]{8,15}$/)
    .nullable(),
  contactAddress: z.string().trim().min(1).max(200).nullable(),
  // Figma request details. Optional in drafts so older clients and saved drafts stay valid.
  studentName: z.string().trim().min(1).max(100).nullable().default(null),
  educationLevel: z.enum(EDUCATION_LEVELS).nullable().default(null),
  sessionsPerWeek: z.number().int().min(1).max(14).nullable().default(null),
  tutorRequirements: z.string().trim().max(500).default(''),
  studentTraits: z.string().trim().max(500).default(''),
});

type RefinableRequest = {
  mode: 'online' | 'offline';
  area: string | null;
  grade: string;
  educationLevel: EducationLevel | null;
};

function refineRequest(value: RefinableRequest, ctx: z.RefinementCtx) {
  if (value.mode === 'offline' && value.area === null) {
    ctx.addIssue({
      code: 'custom',
      path: ['area'],
      message: 'Cần chọn phường/xã cho hình thức học offline.',
    });
  }
  if (
    value.educationLevel !== null &&
    value.educationLevel !== educationLevelForGrade(value.grade)
  ) {
    ctx.addIssue({
      code: 'custom',
      path: ['educationLevel'],
      message: 'Cấp học không khớp với lớp đã chọn.',
    });
  }
}

/** New requests must pick a current Hà Nội phường/xã; edits may keep a stored legacy area. */
export const createParentRequestSchema = requestFields.superRefine((value, ctx) => {
  refineRequest(value, ctx);
  if (value.area !== null && !isHanoiCatalogArea(value.area)) {
    ctx.addIssue({
      code: 'custom',
      path: ['area'],
      message: 'Chọn phường/xã thuộc Hà Nội theo danh mục hiện hành.',
    });
  }
});
export type CreateParentRequestInput = z.infer<typeof createParentRequestSchema>;

export const updateParentRequestSchema = requestFields
  .extend({ version: z.number().int().min(1) })
  .superRefine(refineRequest);
export type UpdateParentRequestInput = z.infer<typeof updateParentRequestSchema>;

export const submitParentRequestSchema = z.strictObject({
  version: z.number().int().min(1),
  consentToShareContact: z.literal(true),
});

/**
 * Learner-facing stage of a request, the three tabs of "Tìm kiếm gia sư":
 * searching = sent and waiting for the centre; found = a moderator proposed (assigned) a tutor
 * the learner has not confirmed yet; confirmed = the learner confirmed hiring, or the class
 * already completed. Drafts and cancelled requests are "other" and have no tab.
 */
export const LEARNER_REQUEST_STAGES = ['searching', 'found', 'confirmed'] as const;
export type LearnerRequestStage = (typeof LEARNER_REQUEST_STAGES)[number];
export type RequestStage = LearnerRequestStage | 'other';
export type LearnerStageCounts = Record<LearnerRequestStage, number>;

/** Only proposals scoring above this are shown to the learner. */
export const PROPOSAL_MIN_FIT = 80;

export const selectProposalSchema = z.strictObject({ version: z.number().int().min(1) });

export const confirmTutorSchema = z.strictObject({
  version: z.number().int().min(1),
  assignmentId: z.uuid(),
});

const localDate = z.iso.date();

export const parentRequestListSchema = z.strictObject({
  status: z.enum(REQUEST_STATUSES).optional(),
  group: z.enum(LEARNER_REQUEST_STAGES).optional(),
  q: z.string().trim().max(100).optional(),
  subjectId: z.string().min(1).max(80).optional(),
  mode: z.enum(['online', 'offline']).optional(),
  /** Inclusive local dates (Asia/Ho_Chi_Minh) on the request creation time. */
  from: localDate.optional(),
  to: localDate.optional(),
  page: z.coerce.number().int().min(1).max(1000).default(1),
  pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
});
export type ParentRequestListQuery = z.infer<typeof parentRequestListSchema>;

/** Deliberately excludes contact and exact address. No endpoint in TASK-23 exposes a public request. */
export interface ParentRequestSummary {
  id: string;
  code: string;
  subjectId: string;
  subjectName: string;
  grade: string;
  mode: 'online' | 'offline';
  area: string | null;
  expectedBudgetMinor: number | null;
  description: string;
  educationLevel: EducationLevel | null;
  sessionsPerWeek: number | null;
  tutorRequirements: string;
  studentTraits: string;
  status: RequestStatus;
  version: number;
  schedule: z.infer<typeof requestScheduleSchema>;
  createdAt: string;
  updatedAt: string;
}

/** Parent's own list row: adds the parent's own private student name and phone. */
export interface ParentRequestListItem extends ParentRequestSummary {
  studentName: string | null;
  contactPhone: string | null;
  stage: RequestStage;
}

/** Fit of the proposed tutor for this request, from the shared class-matching score. */
export interface ProposedTutorFit {
  score: number;
  coverage: number;
  level: 'strong' | 'near' | 'uncertain' | 'low';
  criteria: {
    key: string;
    score: number;
    maxScore: number;
    status: 'match' | 'adjustable' | 'unknown';
  }[];
}

/** Learner-facing profile of a tutor (proposal card or assigned tutor). */
export interface TutorProfileCard {
  displayName: string;
  tutorType: 'university_student' | 'pedagogy_student' | 'teacher' | null;
  school: string | null;
  specialization: string | null;
  experienceYears: number | null;
  experienceSummary: string | null;
  bio: string;
  subjects: string[];
  teachesOnline: boolean;
  teachesOffline: boolean;
  hasPhoto: boolean;
}

/** Tutor proposed by the centre for an assigned or completed request (owner view only). */
export interface ProposedTutor extends TutorProfileCard {
  assignmentId: string;
  assignedAt: string;
  learnerConfirmedAt: string | null;
  fit: ProposedTutorFit;
}

/** One of the centre's proposals for a request; only scores above PROPOSAL_MIN_FIT are sent. */
export interface TutorProposal extends TutorProfileCard {
  id: string;
  fitScore: number;
  status: 'proposed' | 'selected' | 'declined';
  selectedAt: string | null;
}

/** Returned only from an owner-authenticated detail/create/update endpoint. */
export interface OwnParentRequest extends ParentRequestSummary {
  /** Parent-only reference while its published class remains open. */
  publishedClassId: string | null;
  publishedClassCode: string | null;
  /** Agreed VND per session for the current assignment; null before assignment or after revocation. */
  agreedTuitionPerSessionMinor: number | null;
  cancellationReason?: string | null;
  studentName: string | null;
  contactPhone: string | null;
  contactAddress: string | null;
  contactConsentAt: string | null;
  contactConsentVersion: string | null;
  stage: RequestStage;
  tutor: ProposedTutor | null;
  /** Proposals scoring above PROPOSAL_MIN_FIT, best first. */
  proposals: TutorProposal[];
}
