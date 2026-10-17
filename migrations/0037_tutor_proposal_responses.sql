-- "Lớp được đề xuất": the tutor answers a centre proposal once — confirms taking the class or
-- declines with a reason. A declined proposal is hidden from the learner and cannot be selected.
ALTER TABLE request_tutor_proposals ADD COLUMN tutor_response TEXT CHECK (
  tutor_response IS NULL OR tutor_response IN ('accepted', 'declined')
);
ALTER TABLE request_tutor_proposals ADD COLUMN tutor_responded_at TEXT;
ALTER TABLE request_tutor_proposals ADD COLUMN tutor_decline_reason TEXT CHECK (
  tutor_decline_reason IS NULL OR length(trim(tutor_decline_reason)) BETWEEN 1 AND 500
);
CREATE INDEX request_tutor_proposals_tutor_idx
  ON request_tutor_proposals (tutor_user_id, created_at DESC, id);

-- One answer per proposal, while it is still open; a reason exactly when declining.
CREATE TRIGGER request_tutor_proposals_tutor_response BEFORE UPDATE OF
  tutor_response, tutor_responded_at, tutor_decline_reason ON request_tutor_proposals
WHEN OLD.tutor_response IS NOT NULL OR OLD.status <> 'proposed'
  OR NEW.tutor_response IS NULL OR NEW.tutor_responded_at IS NULL
  OR (NEW.tutor_response = 'declined') <> (NEW.tutor_decline_reason IS NOT NULL)
BEGIN SELECT RAISE(ABORT, 'PROPOSAL_RESPONSE_INVALID'); END;

-- The learner cannot hire a tutor who declined the proposal.
CREATE TRIGGER request_tutor_proposals_no_select_declined BEFORE UPDATE OF status
ON request_tutor_proposals
WHEN NEW.status = 'selected' AND OLD.tutor_response = 'declined'
BEGIN SELECT RAISE(ABORT, 'PROPOSAL_DECLINED_BY_TUTOR'); END;
