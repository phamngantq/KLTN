import { z } from 'zod';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './discovery';

/** "Yêu cầu nhận lớp" (tutor): centre proposals, completed acceptances and the intro letter. */
export const classRequestPageSchema = z.strictObject({
  page: z.coerce.number().int().min(1).max(1000).default(1),
  pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
});

export const declineProposalSchema = z.strictObject({
  reason: z
    .string()
    .trim()
    .min(1, 'Vui lòng nhập lý do từ chối.')
    .max(500, 'Lý do tối đa 500 ký tự.'),
});
export type DeclineProposalInput = z.infer<typeof declineProposalSchema>;

export interface ScheduleWindow {
  weekday: number;
  startLocal: string;
  endLocal: string;
}

/**
 * A centre proposal seen by the proposed tutor: public request facts only — never the learner's
 * name, phone, address or free-text description.
 */
export interface TutorProposalItem {
  id: string;
  requestCode: string;
  subjectName: string;
  grade: string;
  mode: 'online' | 'offline';
  area: string | null;
  expectedBudgetMinor: number | null;
  sessionsPerWeek: number | null;
  schedule: ScheduleWindow[];
  fitScore: number;
  /** proposed = waiting for the learner; selected = the learner chose this tutor. */
  status: 'proposed' | 'selected' | 'declined';
  tutorResponse: 'accepted' | 'declined' | null;
  tutorRespondedAt: string | null;
  tutorDeclineReason: string | null;
  createdAt: string;
}

/** A class whose acceptance is complete; contact and letter are separate gated reads. */
export interface CompletedAcceptance {
  assignmentId: string;
  classId: string;
  classCode: string;
  subjectName: string;
  grade: string;
  mode: 'online' | 'offline';
  publicArea: string | null;
  agreedTuitionPerSessionMinor: number | null;
  placementFeeAmountMinor: number;
  completedAt: string;
}

/** "Thư giới thiệu": printable; issued only after every acceptance condition is met. */
export interface IntroductionLetter {
  letterNumber: string;
  issuedAt: string;
  tutorDisplayName: string;
  classCode: string;
  subjectName: string;
  grade: string;
  mode: 'online' | 'offline';
  publicArea: string | null;
  sessionsPerWeek: number | null;
  agreedTuitionPerSessionMinor: number | null;
  learnerDisplayName: string;
  learnerPhone: string;
  learnerAddress: string | null;
}
