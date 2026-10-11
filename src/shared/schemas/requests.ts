import { z } from 'zod';
import { DEFAULT_TIMEZONE } from './availability';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './discovery';

export const REQUEST_STATUSES = [
  'draft',
  'submitted',
  'sourcing',
  'assigned',
  'fulfilled',
  'cancelled',
] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];
/** The exact consent presented by the UI for request contact sharing after moderator assignment. */
export const CONTACT_SHARING_CONSENT_VERSION = '2026-10-11-v1';
export const CONTACT_SHARING_CONSENT_TEXT =
  'Tôi đồng ý chia sẻ số điện thoại và địa chỉ liên hệ (nếu có) trong yêu cầu này chỉ với gia sư được kiểm duyệt viên gán.';
export const REQUEST_GRADE_OPTIONS = Array.from({ length: 12 }, (_, i) => `Lớp ${i + 1}`).concat([
  'Ôn thi đại học',
]);

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
    windows: z.array(requestWindowSchema).max(14),
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
});

function validArea(value: { mode: 'online' | 'offline'; area: string | null }): boolean {
  return value.mode === 'online' || value.area !== null;
}

export const createParentRequestSchema = requestFields.refine(validArea, {
  path: ['area'],
  message: 'Cần khu vực chung cho hình thức học trực tiếp.',
});
export type CreateParentRequestInput = z.infer<typeof createParentRequestSchema>;

export const updateParentRequestSchema = requestFields
  .extend({ version: z.number().int().min(1) })
  .refine(validArea, { path: ['area'], message: 'Cần khu vực chung cho hình thức học trực tiếp.' });
export type UpdateParentRequestInput = z.infer<typeof updateParentRequestSchema>;

export const submitParentRequestSchema = z.strictObject({
  version: z.number().int().min(1),
  consentToShareContact: z.literal(true),
});

export const parentRequestListSchema = z.strictObject({
  status: z.enum(REQUEST_STATUSES).optional(),
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
  status: RequestStatus;
  version: number;
  schedule: z.infer<typeof requestScheduleSchema>;
  createdAt: string;
  updatedAt: string;
}

/** Returned only from an owner-authenticated detail/create/update endpoint. */
export interface OwnParentRequest extends ParentRequestSummary {
  /** Parent-only reference while its published class remains open. */
  publishedClassId: string | null;
  publishedClassCode: string | null;
  /** Agreed VND per session for the current assignment; null before assignment or after revocation. */
  agreedTuitionPerSessionMinor: number | null;
  cancellationReason?: string | null;
  contactPhone: string | null;
  contactAddress: string | null;
  contactConsentAt: string | null;
  contactConsentVersion: string | null;
}
