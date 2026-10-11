import { z } from 'zod';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './discovery';
import { REQUEST_GRADE_OPTIONS } from './requests';

export const TUTOR_OFFER_JOIN_STATUSES = [
  'submitted',
  'withdrawn',
  'approved',
  'rejected',
  'completed',
  'revoked',
] as const;
export type TutorOfferJoinStatus = (typeof TUTOR_OFFER_JOIN_STATUSES)[number];

/** Consent is limited to study details visible to the offer's tutor before review. */
export const TUTOR_OFFER_JOIN_DETAILS_CONSENT_VERSION = '2026-10-12-v1';
export const TUTOR_OFFER_JOIN_DETAILS_CONSENT_TEXT =
  'Tôi đồng ý chia sẻ lớp học, nhu cầu học tập, khu vực chung và trạng thái yêu cầu với gia sư đăng lớp để xem xét. Không chia sẻ số điện thoại hoặc địa chỉ liên hệ ở bước này.';
export const TUTOR_OFFER_JOIN_CONTACT_CONSENT_VERSION = '2026-10-12-v1';
export const TUTOR_OFFER_JOIN_CONTACT_CONSENT_TEXT =
  'Tôi đồng ý chia sẻ số điện thoại của tôi với gia sư đăng lớp chỉ sau khi kiểm duyệt viên duyệt yêu cầu tham gia lớp và xác nhận học phí.';

const noContact = (value: string) =>
  !/@|https?:|www\.|facebook|zalo|\+?[0-9][0-9 .-]{6,}[0-9]|(?:số\s*(?:nhà)?|đường|ngõ|hẻm|phố|street)\s*\d/iu.test(
    value,
  );
const addressDetail =
  /(?:^|[\s,;])(?:số\s+nhà|đường|ngõ|ngách|hẻm|(?<!thành\s)phố|phường|xã|thôn|ấp|tổ|khu\s+phố|tòa|chung\s+cư|street|road|alley|apartment)(?:\s|$)/iu;
// A street number can precede its name without words such as "đường" or "phố".
// Allow numbers used for grades and lesson frequency in study descriptions.
const numberedStreet =
  /(?:^|[\s,;])\d{1,5}(?:[/-]\d{1,5})*[a-z]?\s+(\p{L}{2,})(?:\s+\p{L}{2,}){1,4}(?=\s*[,;.]|\s*$)/giu;
const precedingBroadNumber = /(?:lớp|khối|quận|huyện|năm)\s*$/iu;
const studyUnit = /^(?:buổi|tiết|giờ|ngày|tháng|tuần|điểm|phút|km)$/iu;

function hasNumberedStreet(value: string): boolean {
  for (const match of value.matchAll(numberedStreet)) {
    const before = value.slice(0, match.index).trimEnd();
    if (precedingBroadNumber.test(before) || studyUnit.test(match[1]!)) continue;
    return true;
  }
  return false;
}

const noPrivateAddressOrContact = (value: string) =>
  noContact(value) && !addressDetail.test(value) && !hasNumberedStreet(value);
const grade = z
  .string()
  .refine((value) => REQUEST_GRADE_OPTIONS.includes(value), 'Lớp học không hợp lệ.');
const broadArea = z
  .string()
  .trim()
  .min(2)
  .max(120)
  .refine(
    noPrivateAddressOrContact,
    'Chỉ nhập quận/huyện và tỉnh/thành; không nhập địa chỉ hoặc liên hệ.',
  );
const learningNeeds = z
  .string()
  .trim()
  .min(20)
  .max(500)
  .refine(noPrivateAddressOrContact, 'Nhu cầu học tập không được chứa địa chỉ hoặc liên hệ.');

export const createTutorOfferJoinSchema = z.strictObject({
  offerVersion: z.number().int().min(1),
  studentGrade: grade,
  learningNeeds,
  teachingArea: broadArea.nullable(),
  contactPhone: z
    .string()
    .trim()
    .regex(/^\+?[0-9]{8,15}$/, 'Số điện thoại không hợp lệ.'),
  shareApplicationDetailsConsent: z.literal(true),
  shareContactAfterApprovalConsent: z.literal(true),
});
export type CreateTutorOfferJoinInput = z.infer<typeof createTutorOfferJoinSchema>;
export const withdrawTutorOfferJoinSchema = z.strictObject({ version: z.number().int().min(1) });
export const reviewTutorOfferJoinSchema = withdrawTutorOfferJoinSchema;
export const approveTutorOfferJoinSchema = reviewTutorOfferJoinSchema.extend({
  agreedTuitionPerSessionMinor: z.number().int().min(1).max(100_000_000),
  partiesAgreed: z.literal(true),
});
export const rejectTutorOfferJoinSchema = reviewTutorOfferJoinSchema.extend({
  reason: z.string().trim().min(5).max(500).refine(noContact),
});
export const terminateTutorOfferJoinSchema = rejectTutorOfferJoinSchema;
const paging = {
  page: z.coerce.number().int().min(1).max(1000).default(1),
  pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
};
export const tutorOfferJoinListSchema = z.strictObject({
  status: z.enum(TUTOR_OFFER_JOIN_STATUSES).optional(),
  offerId: z.uuid().optional(),
  ...paging,
});
export const tutorOfferJoinTutorListSchema = z.strictObject(paging);
export type TutorOfferJoinListQuery = z.infer<typeof tutorOfferJoinListSchema>;

/** Parent-owned view. No tutor contact or parent private profile is copied. */
export interface ParentTutorOfferJoin {
  id: string;
  offerId: string;
  offerStatus: string;
  subjectName: string;
  offerGrade: string;
  offerMode: 'online' | 'offline';
  proposedTuitionPerSessionMinor: number;
  studentGrade: string;
  learningNeeds: string;
  teachingArea: string | null;
  status: TutorOfferJoinStatus;
  version: number;
  detailsConsentVersion: string;
  detailsConsentedAt: string;
  contactConsentVersion: string;
  contactConsentedAt: string;
  reviewedAt: string | null;
  rejectionReason: string | null;
  agreedTuitionPerSessionMinor: number | null;
  terminatedAt: string | null;
  terminalReason: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Tutor sees only the parent's consented study details and request state. */
export interface TutorOfferJoinForTutor {
  id: string;
  status: TutorOfferJoinStatus;
  studentGrade: string;
  learningNeeds: string;
  teachingArea: string | null;
  agreedTuitionPerSessionMinor: number | null;
  createdAt: string;
}

/** Moderator may identify the parties but has no contact fields in this projection. */
export interface AdminTutorOfferJoin extends ParentTutorOfferJoin {
  parentUserId: string;
  parentDisplayName: string;
  tutorUserId: string;
  reviewedBy: string | null;
  terminatedBy: string | null;
}

/** Only moderator detail discloses contact numbers, with a read audit. */
export interface AdminTutorOfferJoinDetail extends AdminTutorOfferJoin {
  parentContactPhone: string | null;
  tutorContactPhone: string | null;
}

export interface TutorOfferJoinContact {
  phone: string;
}
