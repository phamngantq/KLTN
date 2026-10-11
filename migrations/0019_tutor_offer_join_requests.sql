-- Parents request to join a tutor-origin offer. The tutor sees only the
-- consented study details; moderator review and contact release are separate.
CREATE TABLE tutor_offer_join_requests (
  id TEXT PRIMARY KEY NOT NULL,
  offer_id TEXT NOT NULL REFERENCES tutor_student_offers (id) ON DELETE RESTRICT,
  parent_user_id TEXT NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  offer_version INTEGER NOT NULL CHECK (offer_version >= 1),
  student_grade TEXT NOT NULL CHECK (length(student_grade) BETWEEN 2 AND 80),
  learning_needs TEXT NOT NULL CHECK (length(learning_needs) BETWEEN 20 AND 500),
  teaching_area TEXT CHECK (teaching_area IS NULL OR length(teaching_area) BETWEEN 2 AND 120),
  details_consent_version TEXT NOT NULL,
  details_consented_at TEXT NOT NULL,
  contact_consent_version TEXT NOT NULL,
  contact_consented_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'submitted'
    CHECK (status IN ('submitted', 'withdrawn', 'approved', 'rejected', 'completed', 'revoked')),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  reviewed_by TEXT REFERENCES users (id) ON DELETE RESTRICT,
  reviewed_at TEXT,
  rejection_reason TEXT CHECK (rejection_reason IS NULL OR length(rejection_reason) BETWEEN 5 AND 500),
  agreed_tuition_per_session_minor INTEGER
    CHECK (agreed_tuition_per_session_minor IS NULL OR agreed_tuition_per_session_minor BETWEEN 1 AND 100000000),
  parties_agreed_at TEXT,
  terminated_by TEXT REFERENCES users (id) ON DELETE RESTRICT,
  terminated_at TEXT,
  terminal_reason TEXT CHECK (terminal_reason IS NULL OR length(terminal_reason) BETWEEN 5 AND 500),
  withdrawn_at TEXT,
  mutation_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK ((status = 'submitted' AND reviewed_by IS NULL AND reviewed_at IS NULL
      AND rejection_reason IS NULL AND agreed_tuition_per_session_minor IS NULL
      AND parties_agreed_at IS NULL AND withdrawn_at IS NULL
      AND terminated_by IS NULL AND terminated_at IS NULL AND terminal_reason IS NULL)
    OR (status = 'withdrawn' AND reviewed_by IS NULL AND reviewed_at IS NULL
      AND rejection_reason IS NULL AND agreed_tuition_per_session_minor IS NULL
      AND parties_agreed_at IS NULL AND withdrawn_at IS NOT NULL
      AND terminated_by IS NULL AND terminated_at IS NULL AND terminal_reason IS NULL)
    OR (status = 'approved' AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL
      AND rejection_reason IS NULL AND agreed_tuition_per_session_minor IS NOT NULL
      AND parties_agreed_at IS NOT NULL AND withdrawn_at IS NULL
      AND terminated_by IS NULL AND terminated_at IS NULL AND terminal_reason IS NULL)
    OR (status = 'rejected' AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL
      AND rejection_reason IS NOT NULL AND agreed_tuition_per_session_minor IS NULL
      AND parties_agreed_at IS NULL AND withdrawn_at IS NULL
      AND terminated_by IS NULL AND terminated_at IS NULL AND terminal_reason IS NULL)
    OR (status IN ('completed', 'revoked') AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL
      AND rejection_reason IS NULL AND agreed_tuition_per_session_minor IS NOT NULL
      AND parties_agreed_at IS NOT NULL AND withdrawn_at IS NULL
      AND terminated_by IS NOT NULL AND terminated_at IS NOT NULL AND terminal_reason IS NOT NULL))
);
CREATE UNIQUE INDEX tutor_offer_join_requests_live_unique
  ON tutor_offer_join_requests (offer_id, parent_user_id) WHERE status IN ('submitted', 'approved');
CREATE INDEX tutor_offer_join_requests_parent_idx
  ON tutor_offer_join_requests (parent_user_id, created_at DESC, id);
CREATE INDEX tutor_offer_join_requests_offer_idx
  ON tutor_offer_join_requests (offer_id, created_at DESC, id);
CREATE INDEX tutor_offer_join_requests_review_idx
  ON tutor_offer_join_requests (status, created_at DESC, id);

CREATE TRIGGER tutor_offer_join_requests_insert_gate BEFORE INSERT ON tutor_offer_join_requests
WHEN NEW.status <> 'submitted' OR NEW.version <> 1 OR NOT EXISTS (
  SELECT 1 FROM tutor_student_offers o
  JOIN tutor_profiles p ON p.user_id = o.tutor_user_id
  JOIN users tutor ON tutor.id = o.tutor_user_id
  JOIN users parent ON parent.id = NEW.parent_user_id
  WHERE o.id = NEW.offer_id AND o.status = 'published' AND o.version = NEW.offer_version
    AND o.grade = NEW.student_grade
    AND p.approval_status = 'approved' AND p.visibility = 'public'
    AND tutor.role = 'tutor' AND tutor.status = 'active'
    AND parent.role = 'student' AND parent.status = 'active'
    AND NOT EXISTS (SELECT 1 FROM account_deletions d WHERE d.user_id = parent.id)
    AND NOT EXISTS (SELECT 1 FROM account_deletions d WHERE d.user_id = tutor.id)
    AND (o.mode = 'online' OR NEW.teaching_area IS NOT NULL)
) OR (SELECT count(*) FROM tutor_offer_join_requests
      WHERE parent_user_id = NEW.parent_user_id AND status = 'submitted') >= 20
BEGIN SELECT RAISE(ABORT, 'TUTOR_OFFER_JOIN_NOT_ALLOWED'); END;
CREATE TRIGGER tutor_offer_join_requests_no_delete BEFORE DELETE ON tutor_offer_join_requests
BEGIN SELECT RAISE(ABORT, 'tutor offer join history cannot be deleted'); END;
CREATE TRIGGER tutor_offer_join_requests_identity_immutable BEFORE UPDATE OF
  id, offer_id, parent_user_id, offer_version, student_grade, details_consent_version,
  details_consented_at, contact_consent_version, contact_consented_at, created_at
  ON tutor_offer_join_requests
BEGIN SELECT RAISE(ABORT, 'tutor offer join identity is immutable'); END;
CREATE TRIGGER tutor_offer_join_requests_agreed_tuition_immutable BEFORE UPDATE OF
  agreed_tuition_per_session_minor, parties_agreed_at ON tutor_offer_join_requests
WHEN NOT (OLD.status = 'submitted' AND NEW.status = 'approved'
  AND OLD.agreed_tuition_per_session_minor IS NULL AND OLD.parties_agreed_at IS NULL
  AND NEW.agreed_tuition_per_session_minor IS NOT NULL AND NEW.parties_agreed_at IS NOT NULL)
BEGIN SELECT RAISE(ABORT, 'agreed tutor offer join tuition is immutable'); END;
CREATE TRIGGER tutor_offer_join_requests_transition BEFORE UPDATE OF status ON tutor_offer_join_requests
WHEN NOT (((OLD.status = 'submitted' AND NEW.status IN ('withdrawn', 'approved', 'rejected'))
  OR (OLD.status = 'approved' AND NEW.status IN ('completed', 'revoked')))
  AND NEW.version = OLD.version + 1 AND NEW.mutation_id <> OLD.mutation_id)
BEGIN SELECT RAISE(ABORT, 'TUTOR_OFFER_JOIN_INVALID_TRANSITION'); END;
CREATE TRIGGER tutor_offer_join_requests_review_gate BEFORE UPDATE OF status ON tutor_offer_join_requests
WHEN NEW.status IN ('approved', 'rejected') AND NOT EXISTS (
  SELECT 1 FROM users u WHERE u.id = NEW.reviewed_by AND u.role = 'admin' AND u.status = 'active'
)
BEGIN SELECT RAISE(ABORT, 'TUTOR_OFFER_JOIN_REVIEW_NOT_ALLOWED'); END;
CREATE TRIGGER tutor_offer_join_requests_terminal_gate BEFORE UPDATE OF status ON tutor_offer_join_requests
WHEN NEW.status IN ('completed', 'revoked') AND NOT EXISTS (
  SELECT 1 FROM users u WHERE u.id = NEW.terminated_by AND u.role = 'admin' AND u.status = 'active'
)
BEGIN SELECT RAISE(ABORT, 'TUTOR_OFFER_JOIN_REVIEW_NOT_ALLOWED'); END;
CREATE TRIGGER tutor_offer_join_requests_account_deletion_gate BEFORE INSERT ON account_deletions
WHEN EXISTS (
  SELECT 1 FROM tutor_offer_join_requests j
  JOIN tutor_student_offers o ON o.id = j.offer_id
  WHERE j.status IN ('submitted', 'approved')
    AND (j.parent_user_id = NEW.user_id OR o.tutor_user_id = NEW.user_id)
)
BEGIN SELECT RAISE(ABORT, 'ACCOUNT_DELETION_BLOCKED'); END;
