import { z } from 'zod';
import { DEFAULT_TIMEZONE } from './availability';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './discovery';
import { daysBetween } from '../time';

const date = z.iso.date();
export const reportRangeSchema = z
  .strictObject({
    from: date,
    to: date,
    timeZone: z.literal(DEFAULT_TIMEZONE).default(DEFAULT_TIMEZONE),
  })
  .refine(({ from, to }) => from <= to && daysBetween(from, to) <= 730, {
    path: ['to'],
    message: 'Khoảng báo cáo phải hợp lệ và không quá 731 ngày.',
  });
export type ReportRange = z.infer<typeof reportRangeSchema>;

export const noTutorQuerySchema = z
  .strictObject({
    from: date,
    to: date,
    timeZone: z.literal(DEFAULT_TIMEZONE).default(DEFAULT_TIMEZONE),
    page: z.coerce.number().int().min(1).max(1000).default(1),
    pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
  })
  .refine(({ from, to }) => from <= to && daysBetween(from, to) <= 730, {
    path: ['to'],
    message: 'Khoảng báo cáo phải hợp lệ và không quá 731 ngày.',
  });
export type NoTutorQuery = z.infer<typeof noTutorQuerySchema>;

/** A cohort is defined by the first submitted-request audit event in the chosen local date range. */
export interface ConversionReport {
  range: ReportRange;
  submittedRequests: number;
  publishedClasses: number;
  assignedClasses: number;
  completedClasses: number;
  publishRatePercent: number | null;
  assignRatePercent: number | null;
  completeRatePercent: number | null;
}

export interface NoTutorClass {
  id: string;
  code: string;
  subjectName: string;
  grade: string;
  mode: 'online' | 'offline';
  publicArea: string | null;
  publishedAt: string;
  submittedApplicationCount: number;
}

/** Payment and receipts are not integrated; a fee-option selection is never revenue. */
export interface RevenueReport {
  available: false;
  reason: 'NO_VERIFIED_PAYMENT_SOURCE';
  range: ReportRange;
}

export interface AdminReportOverview {
  range: ReportRange;
  conversion: ConversionReport;
  openClasses: number;
  openWithoutApplications: number;
  activeClasses: number;
  completedClasses: number;
  revenue: RevenueReport;
}

export interface ParentDashboard {
  draftRequests: number;
  submittedRequests: number;
  sourcingRequests: number;
  assignedRequests: number;
  fulfilledRequests: number;
  cancelledRequests: number;
}

export interface TutorDashboard {
  submittedApplications: number;
  selectedApplications: number;
  activeAssignments: number;
  /** "Lớp đã đăng ký nhận": classes with an application that was not withdrawn. */
  registeredClasses: number;
  /** "Lớp đã hoàn tất nhận": classes the centre assigned to the tutor (not revoked). */
  acceptedClasses: number;
}
