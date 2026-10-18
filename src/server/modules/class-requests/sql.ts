/**
 * "Hoàn tất nhận lớp", as SQL over an assignment aliased `a` with its class `c`, request `r`
 * and private request row `p`: active, learner-confirmed, contract acknowledged and placement
 * fee recorded. Shared by the completed list, the registered list and the contact/letter gate
 * so a class is never in both tabs or opened early.
 */
export const COMPLETED = `a.status = 'active' AND c.status = 'active' AND r.status = 'assigned'
  AND p.contact_consent_at IS NOT NULL AND p.contact_consent_version IS NOT NULL
  AND a.learner_confirmed_at IS NOT NULL AND a.placement_fee_paid_at IS NOT NULL
  AND EXISTS (SELECT 1 FROM class_contract_records k
    WHERE k.assignment_id = a.id AND k.status = 'acknowledged')`;

/** Completion of the assignment behind `tutor_applications`, for application queries. */
export const APPLICATION_COMPLETED = `EXISTS (SELECT 1 FROM class_assignments a
  JOIN class_listings c ON c.id = a.class_id
  JOIN parent_requests r ON r.id = c.source_request_id
  JOIN parent_request_private p ON p.request_id = r.id
  WHERE a.application_id = tutor_applications.id AND ${COMPLETED})`;
