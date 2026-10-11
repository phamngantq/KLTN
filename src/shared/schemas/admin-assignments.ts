import { z } from 'zod';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './discovery';

export const CLASS_ASSIGNMENT_STATUSES = ['active', 'revoked'] as const;

export const assignClassSchema = z.strictObject({
  applicationId: z.uuid(),
  classVersion: z.number().int().min(1),
  applicationVersion: z.number().int().min(1),
  requestVersion: z.number().int().min(1),
  note: z.string().trim().min(1).max(500).optional(),
});
export type AssignClassInput = z.infer<typeof assignClassSchema>;

export const classLifecycleActionSchema = z.strictObject({
  classVersion: z.number().int().min(1),
  requestVersion: z.number().int().min(1),
  assignmentId: z.uuid(),
  assignmentVersion: z.number().int().min(1),
  reason: z.string().trim().min(3).max(500),
});
export type ClassLifecycleActionInput = z.infer<typeof classLifecycleActionSchema>;

export const cancelClassSchema = z.strictObject({
  classVersion: z.number().int().min(1),
  requestVersion: z.number().int().min(1),
  reason: z.string().trim().min(3).max(450),
});
export type CancelClassInput = z.infer<typeof cancelClassSchema>;

export interface ClassLifecycleEvent {
  id: string;
  classId: string;
  assignmentId: string | null;
  eventType: 'revoked' | 'completed' | 'cancelled';
  actorId: string;
  reason: string;
  createdAt: string;
}

export interface ClassLifecycle {
  classId: string;
  classStatus: 'draft' | 'open' | 'active' | 'completed' | 'cancelled';
  classVersion: number;
  requestStatus: 'draft' | 'submitted' | 'sourcing' | 'assigned' | 'fulfilled' | 'cancelled';
  requestVersion: number;
  assignmentId: string | null;
  assignmentVersion: number | null;
  tutorDisplayName: string | null;
  events: ClassLifecycleEvent[];
}

export interface AdminAssignment {
  id: string;
  classId: string;
  applicationId: string;
  tutorUserId: string;
  status: (typeof CLASS_ASSIGNMENT_STATUSES)[number];
  version: number;
  assignedBy: string;
  assignedAt: string;
}

export const tutorAssignmentListSchema = z.strictObject({
  page: z.coerce.number().int().min(1).max(1000).default(1),
  pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
});
export type TutorAssignmentListQuery = z.infer<typeof tutorAssignmentListSchema>;

/** Own active class reference; parent identity and contact require a second authorized read. */
export interface TutorAssignment {
  id: string;
  classId: string;
  classCode: string;
  applicationId: string;
  subjectName: string;
  grade: string;
  mode: 'online' | 'offline';
  publicArea: string | null;
  status: 'active';
  assignedAt: string;
}

/** Historical outcome only, with no parent identity or contact data. */
export interface TutorAssignmentHistory {
  assignmentId: string;
  classId: string;
  classCode: string;
  subjectName: string;
  grade: string;
  mode: 'online' | 'offline';
  outcome: 'revoked' | 'completed';
  reason: string;
  endedAt: string;
}

/** Returned to only the tutor with an active assignment; never cached publicly. */
export interface AssignedParentContact {
  assignmentId: string;
  classId: string;
  parentDisplayName: string;
  phone: string;
  address: string | null;
}
