import { z } from 'zod';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './discovery';

/** "draft" (Chưa gửi) is private to its author and never reaches the moderator queue. */
export const COMPLAINT_STATUSES = ['draft', 'submitted', 'in_review', 'resolved'] as const;
export type ComplaintStatus = (typeof COMPLAINT_STATUSES)[number];
export const SENT_COMPLAINT_STATUSES = ['submitted', 'in_review', 'resolved'] as const;

/** Tabs on "Khiếu nại của tôi"; each status belongs to exactly one group. */
export const COMPLAINT_GROUPS = {
  draft: ['draft'],
  processing: ['submitted', 'in_review'],
  resolved: ['resolved'],
} as const satisfies Record<string, readonly ComplaintStatus[]>;
export type ComplaintGroup = keyof typeof COMPLAINT_GROUPS;
export const COMPLAINT_GROUP_KEYS = Object.keys(COMPLAINT_GROUPS) as [
  ComplaintGroup,
  ...ComplaintGroup[],
];

const complaintFields = {
  classId: z.uuid().nullable(),
  title: z.string().trim().min(5, 'Tiêu đề cần từ 5 ký tự.').max(120),
  body: z.string().trim().min(10, 'Nội dung cần từ 10 ký tự.').max(5000),
};

export const createComplaintSchema = z.strictObject({
  ...complaintFields,
  /** false keeps the complaint as an unsent draft. */
  submit: z.boolean().default(true),
});
export type CreateComplaintInput = z.infer<typeof createComplaintSchema>;

export const updateComplaintDraftSchema = z.strictObject({
  ...complaintFields,
  version: z.number().int().min(1),
});
export type UpdateComplaintDraftInput = z.infer<typeof updateComplaintDraftSchema>;

export const complaintVersionSchema = z.strictObject({ version: z.number().int().min(1) });

const pageFields = {
  page: z.coerce.number().int().min(1).max(1000).default(1),
  pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
};
export const ownComplaintListSchema = z.strictObject({
  status: z.enum(COMPLAINT_STATUSES).optional(),
  group: z.enum(COMPLAINT_GROUP_KEYS).optional(),
  q: z.string().trim().max(100).optional(),
  /** Inclusive local dates (Asia/Ho_Chi_Minh) on the creation time. */
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
  ...pageFields,
});
export type ComplaintListQuery = z.infer<typeof ownComplaintListSchema>;
export const adminComplaintListSchema = z.strictObject({
  status: z.enum(SENT_COMPLAINT_STATUSES).optional(),
  ...pageFields,
});
export type AdminComplaintListQuery = z.infer<typeof adminComplaintListSchema>;

export type ComplaintCounts = Record<ComplaintStatus, number>;

export const triageComplaintSchema = z.strictObject({
  version: z.number().int().min(1),
  reason: z.string().trim().min(4).max(1000),
});
export const resolveComplaintSchema = z.strictObject({
  version: z.number().int().min(1),
  resolution: z.string().trim().min(4).max(2000),
});

export interface ComplaintSummary {
  id: string;
  code: string;
  classId: string | null;
  title: string;
  status: ComplaintStatus;
  version: number;
  createdAt: string;
  updatedAt: string;
  submittedAt: string | null;
  resolvedAt: string | null;
}

/** Author's list row: the body preview shown under the title. */
export interface OwnComplaintSummary extends ComplaintSummary {
  body: string;
}

/** Evidence files: images or PDF, attached while the complaint is a draft. */
export const COMPLAINT_ATTACHMENT_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
] as const;
export type ComplaintAttachmentType = (typeof COMPLAINT_ATTACHMENT_TYPES)[number];
export const COMPLAINT_ATTACHMENT_MAX_BYTES = 1_572_864; // 1.5 MB, within a D1 row.
export const COMPLAINT_ATTACHMENT_MAX_COUNT = 3;

export interface ComplaintAttachment {
  id: string;
  fileName: string;
  contentType: ComplaintAttachmentType;
  sizeBytes: number;
  createdAt: string;
}

export interface ComplaintDetail extends ComplaintSummary {
  body: string;
  resolution: string | null;
  attachments: ComplaintAttachment[];
}

export interface AdminComplaintSummary extends ComplaintSummary {
  creatorUserId: string;
  creatorDisplayName: string;
  creatorRole: 'parent' | 'tutor';
}

export interface AdminComplaintDetail extends AdminComplaintSummary {
  body: string;
  triageReason: string | null;
  resolution: string | null;
  handledBy: string | null;
  attachments: ComplaintAttachment[];
}
