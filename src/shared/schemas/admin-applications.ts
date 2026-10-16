import { z } from 'zod';
import {
  APPLICATION_STATUSES,
  type ApplicationStatus,
  type ClassStatus,
  type FeeOptionKey,
  type ApplicationAvailability,
  type ApplicationMatchSnapshot,
} from './classes';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './discovery';

export const adminApplicationListSchema = z.strictObject({
  classId: z.uuid().optional(),
  status: z.enum(APPLICATION_STATUSES).optional(),
  page: z.coerce.number().int().min(1).max(1000).default(1),
  pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
});
export type AdminApplicationListQuery = z.infer<typeof adminApplicationListSchema>;

export const rejectApplicationSchema = z.strictObject({
  version: z.number().int().min(1),
  reason: z.string().trim().min(1).max(500),
});

/** Moderator queue view; private parent contact is deliberately excluded. */
export interface AdminApplication {
  id: string;
  classId: string;
  classCode: string;
  classStatus: ClassStatus;
  classVersion: number;
  requestVersion: number;
  tutorUserId: string;
  tutorDisplayName: string;
  feeOptionVersionId: string;
  feeOptionKey: FeeOptionKey;
  feeOptionVersion: number;
  feeOptionTitle: string;
  rejectionReason: string | null;
  status: ApplicationStatus;
  version: number;
  createdAt: string;
  updatedAt: string;
  /** Tutor's own per-class adjustment commitment at submission time, not parental agreement. */
  matchSnapshot: ApplicationMatchSnapshot | null;
  /** "Thời gian rảnh có thể đi dạy" the tutor gave for this class. */
  availability: ApplicationAvailability | null;
}
