-- "Danh sách gia sư được đề xuất": the centre proposes several tutors for one request with a
-- fit score snapshot (0-100); the learner selects one. Selection is recorded once, here and,
-- when the selected tutor holds the active assignment, on that assignment's confirmation.
CREATE TABLE request_tutor_proposals (
  id TEXT PRIMARY KEY NOT NULL,
  request_id TEXT NOT NULL REFERENCES parent_requests (id) ON DELETE CASCADE,
  tutor_user_id TEXT NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  fit_score INTEGER NOT NULL CHECK (fit_score BETWEEN 0 AND 100),
  status TEXT NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed', 'selected', 'declined')),
  proposed_by TEXT NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL,
  selected_at TEXT,
  CHECK ((status = 'selected') = (selected_at IS NOT NULL))
);
CREATE UNIQUE INDEX request_tutor_proposals_pair_uq
  ON request_tutor_proposals (request_id, tutor_user_id);
CREATE UNIQUE INDEX request_tutor_proposals_one_selected_uq
  ON request_tutor_proposals (request_id) WHERE status = 'selected';
CREATE INDEX request_tutor_proposals_request_idx
  ON request_tutor_proposals (request_id, fit_score DESC);

-- Proposals come only from a moderator and only for tutor accounts.
CREATE TRIGGER request_tutor_proposals_valid_insert BEFORE INSERT ON request_tutor_proposals
WHEN NOT EXISTS (SELECT 1 FROM users WHERE id = NEW.proposed_by AND role = 'admin' AND status = 'active')
  OR NOT EXISTS (SELECT 1 FROM users WHERE id = NEW.tutor_user_id AND role = 'tutor')
  OR NEW.status <> 'proposed'
BEGIN SELECT RAISE(ABORT, 'PROPOSAL_INVALID'); END;
-- A selection is final: proposed → selected/declined only, never back.
CREATE TRIGGER request_tutor_proposals_valid_transition BEFORE UPDATE OF status ON request_tutor_proposals
WHEN OLD.status <> 'proposed' OR NEW.status NOT IN ('selected', 'declined')
BEGIN SELECT RAISE(ABORT, 'PROPOSAL_TRANSITION_INVALID'); END;
