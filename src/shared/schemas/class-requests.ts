import { z } from 'zod';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './discovery';

/** "Yêu cầu nhận lớp" (tutor): centre proposals, completed acceptances and the intro letter. */
export const classRequestPageSchema = z.strictObject({
  page: z.coerce.number().int().min(1).max(1000).default(1),
  pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
});

/** "Chờ phản hồi", "Đã xác nhận", "Đã từ chối". */
export const PROPOSAL_FILTERS = ['pending', 'accepted', 'declined'] as const;
export type ProposalFilter = (typeof PROPOSAL_FILTERS)[number];
export const proposalListSchema = classRequestPageSchema.extend({
  q: z.string().trim().min(1).max(100).optional(),
  status: z.enum(PROPOSAL_FILTERS).optional(),
});

export const acceptProposalSchema = z.strictObject({
  /** "Tôi xác nhận đã đọc và đồng ý với Điều khoản trách nhiệm của trung tâm." */
  termsAgreed: z.literal(true, 'Cần xác nhận đồng ý với Điều khoản trách nhiệm.'),
});

/** "Tôi đã đọc và đồng ý với các điều khoản trong hợp đồng" + "Tôi đã chuyển khoản". */
export const reportTransferSchema = z.strictObject({
  contractAgreed: z.literal(true, 'Cần đồng ý với các điều khoản trong hợp đồng.'),
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
  tutorRequirements: string | null;
  studentTraits: string | null;
  /** Current monthly-percent policy rate; null when no policy is published. */
  placementRateBasisPoints: number | null;
  /** Rate × học phí/buổi × buổi/tuần × 4; null when the budget or rate is unknown. */
  placementFeeMinor: number | null;
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

/** Bank-transfer payment of the placement fee for a returning tutor. */
export interface PaymentInstructions {
  assignmentId: string;
  classCode: string;
  firstAcceptance: boolean;
  /** Exact fee of this class; null when the budget or the policy rate is unknown. */
  amountMinor: number | null;
  /** ASCII content the centre matches the transfer with. */
  transferContent: string;
  /** Centre account from deployment config; null until configured (then no QR is shown). */
  account: { bankBin: string; bankName: string; accountNumber: string; accountName: string } | null;
  /** VietQR (EMVCo) payload with account, amount and content; null without an account or fee. */
  qrPayload: string | null;
  learnerConfirmed: boolean;
  contract: { id: string; version: number; status: 'issued' | 'acknowledged' } | null;
  /** The tutor's "Tôi đã chuyển khoản"; the centre still has to confirm receipt. */
  reportedAt: string | null;
  /** Set by the centre when the fee is received. */
  paidAt: string | null;
  completed: boolean;
}
