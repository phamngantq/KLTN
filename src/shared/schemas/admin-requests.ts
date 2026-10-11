import type { OwnParentRequest, ParentRequestSummary } from './requests';

export const ADMIN_REQUEST_STATUSES = [
  'submitted',
  'sourcing',
  'assigned',
  'fulfilled',
  'cancelled',
] as const;

/** Queue card; intentionally excludes private contact and consent data. */
export type AdminRequestSummary = ParentRequestSummary;

/** Moderator-only detail after the parent submitted a consented request. */
export interface AdminRequestDetail extends OwnParentRequest {
  parentUserId: string;
  parentDisplayName: string;
}
