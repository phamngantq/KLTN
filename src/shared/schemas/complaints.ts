import { z } from 'zod';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './discovery';

export const COMPLAINT_STATUSES = ['submitted', 'in_review', 'resolved'] as const;
export type ComplaintStatus = (typeof COMPLAINT_STATUSES)[number];

export const createComplaintSchema = z.strictObject({
  classId: z.uuid().nullable(),
  title: z.string().trim().min(5).max(120),
  body: z.string().trim().min(10).max(5000),
});
export type CreateComplaintInput = z.infer<typeof createComplaintSchema>;

const pageFields = {
  page: z.coerce.number().int().min(1).max(1000).default(1),
  pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
};
export const ownComplaintListSchema = z.strictObject({
  status: z.enum(COMPLAINT_STATUSES).optional(),
  ...pageFields,
});
export const adminComplaintListSchema = z.strictObject({
  status: z.enum(COMPLAINT_STATUSES).optional(),
  ...pageFields,
});
export type ComplaintListQuery = z.infer<typeof ownComplaintListSchema>;

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
  resolvedAt: string | null;
}

export interface ComplaintDetail extends ComplaintSummary {
  body: string;
  resolution: string | null;
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
}
