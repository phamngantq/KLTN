import { z } from 'zod';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './discovery';
import { REQUEST_GRADE_OPTIONS } from './requests';

export const TUTOR_OFFER_STATUSES = [
  'draft',
  'pending',
  'published',
  'rejected',
  'closed',
] as const;
export type TutorOfferStatus = (typeof TUTOR_OFFER_STATUSES)[number];
// v2: same consent, role renamed from "phụ huynh" to "người học".
export const TUTOR_OFFER_CONTACT_CONSENT_VERSION = '2026-10-12-v2';
export const TUTOR_OFFER_CONTACT_CONSENT_TEXT =
  'Tôi đồng ý cho người học có yêu cầu được kiểm duyệt viên duyệt xem số điện thoại của tôi; số này không hiển thị công khai hoặc cho người đang chờ duyệt.';

const broadArea = z
  .string()
  .trim()
  .min(2)
  .max(120)
  .refine(
    (value) => !/@|https?:|\+?[0-9][0-9 .-]{6,}[0-9]|(?:số|đường|ngõ|hẻm|phố|street)/iu.test(value),
    'Khu vực công khai không được chứa địa chỉ hoặc thông tin liên hệ.',
  );

const offerFields = {
  subjectId: z.string().min(1).max(80),
  grade: z.string().refine((grade) => REQUEST_GRADE_OPTIONS.includes(grade)),
  mode: z.enum(['online', 'offline']),
  area: broadArea.nullable(),
  proposedTuitionPerSessionMinor: z.number().int().min(1).max(100_000_000),
  contactPhone: z
    .string()
    .trim()
    .regex(/^\+?[0-9]{8,15}$/),
};

function requireOfflineArea(
  value: { mode: 'online' | 'offline'; area: string | null },
  ctx: z.RefinementCtx,
) {
  if (value.mode === 'offline' && value.area === null) {
    ctx.addIssue({ code: 'custom', path: ['area'], message: 'Lớp tại nhà cần khu vực công khai.' });
  }
}

export const createTutorOfferSchema = z.strictObject(offerFields).superRefine(requireOfflineArea);
export type CreateTutorOfferInput = z.infer<typeof createTutorOfferSchema>;
export const updateTutorOfferSchema = z
  .strictObject({ ...offerFields, version: z.number().int().min(1) })
  .superRefine(requireOfflineArea);
export type UpdateTutorOfferInput = z.infer<typeof updateTutorOfferSchema>;

export const submitTutorOfferSchema = z.strictObject({
  version: z.number().int().min(1),
  contractRevisionId: z.uuid(),
  acknowledged: z.literal(true),
  shareContactAfterApproval: z.literal(true),
});
export const reviewTutorOfferSchema = z.strictObject({ version: z.number().int().min(1) });
export const closeTutorOfferSchema = reviewTutorOfferSchema;
export const rejectTutorOfferSchema = reviewTutorOfferSchema.extend({
  reason: z.string().trim().min(5).max(500),
});

const paging = {
  page: z.coerce.number().int().min(1).max(1000).default(1),
  pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
};
export const ownTutorOfferListSchema = z.strictObject({
  status: z.enum(TUTOR_OFFER_STATUSES).optional(),
  ...paging,
});
export const adminTutorOfferListSchema = ownTutorOfferListSchema;
export const publicTutorOfferListSchema = z.strictObject({
  subjectId: z.string().min(1).max(80).optional(),
  grade: z
    .string()
    .refine((grade) => REQUEST_GRADE_OPTIONS.includes(grade))
    .optional(),
  mode: z.enum(['online', 'offline']).optional(),
  ...paging,
});

export interface TutorOfferContract {
  id: string;
  revision: number;
  title: string;
  bodyText: string;
}

export interface PublicTutorOffer {
  id: string;
  version: number;
  tutorDisplayName: string;
  subjectId: string;
  subjectName: string;
  grade: string;
  mode: 'online' | 'offline';
  area: string | null;
  proposedTuitionPerSessionMinor: number;
  publishedAt: string;
}

export interface TutorOffer extends Omit<PublicTutorOffer, 'publishedAt'> {
  tutorUserId: string;
  contactPhone: string | null;
  contactShareConsentVersion: string | null;
  contactShareConsentAt: string | null;
  status: TutorOfferStatus;
  version: number;
  contractRevisionId: string | null;
  contractRevision: number | null;
  contractTitle: string | null;
  contractBodyText: string | null;
  acknowledgedAt: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  rejectionReason: string | null;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}
