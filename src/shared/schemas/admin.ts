import type { IdVerificationMethod, TutorDocument } from './tutors';
import { z } from 'zod';
import type { ApprovalStatus, Subject, Visibility } from './tutors';

/** Queue filters: `hidden` = approved but not public (hidden by an admin). */
export const ADMIN_TUTOR_FILTERS = ['pending', 'approved', 'hidden', 'rejected', 'draft'] as const;
export type AdminTutorFilter = (typeof ADMIN_TUTOR_FILTERS)[number];

export const adminTutorListSchema = z.object({
  status: z.enum(ADMIN_TUTOR_FILTERS).default('pending'),
  page: z.coerce.number().int().min(1).max(1000).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});
export type AdminTutorListQuery = z.infer<typeof adminTutorListSchema>;

export const MODERATION_ACTIONS = ['approve', 'reject', 'hide'] as const;
export type ModerationAction = (typeof MODERATION_ACTIONS)[number];

const reason = z.string().trim().min(1, 'Vui lòng nhập lý do.').max(500);

/** Reject/hide must explain why (shown to the tutor); approve may add an internal note. */
export const moderationSchemas = {
  approve: z.strictObject({ reason: reason.optional() }),
  reject: z.strictObject({ reason }),
  hide: z.strictObject({ reason }),
} as const;

export interface AdminTutor {
  userId: string;
  slug: string;
  displayName: string;
  email: string;
  bio: string;
  hourlyRateMinor: number | null;
  teachesOnline: boolean;
  teachesOffline: boolean;
  subjects: Subject[];
  approvalStatus: ApprovalStatus;
  visibility: Visibility;
  moderationNote: string | null;
  updatedAt: string;
}

export const ADMIN_FILTER_LABELS: Record<AdminTutorFilter, string> = {
  pending: 'Chờ duyệt',
  approved: 'Đang công khai',
  hidden: 'Đã ẩn',
  rejected: 'Bị từ chối',
  draft: 'Bản nháp',
};

/** Moderator-only view of a tutor's private facts and uploaded documents. */
export interface TutorVerification {
  phone: string | null;
  dateOfBirth: string | null;
  idNumber: string | null;
  idIssuedOn: string | null;
  idResidence: string | null;
  idVerification: IdVerificationMethod;
  documents: TutorDocument[];
}
