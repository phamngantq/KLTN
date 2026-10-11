-- Tutor-origin listings are separate from parent requests and their class assignments.
-- A tutor acknowledges a moderator-published contract before review; publication requires moderation.
CREATE TABLE tutor_student_offers (
  id TEXT PRIMARY KEY NOT NULL,
  tutor_user_id TEXT NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  subject_id TEXT NOT NULL REFERENCES subjects (id) ON DELETE RESTRICT,
  grade TEXT NOT NULL CHECK (length(grade) BETWEEN 2 AND 80),
  mode TEXT NOT NULL CHECK (mode IN ('online', 'offline')),
  area TEXT CHECK (area IS NULL OR length(area) BETWEEN 2 AND 120),
  proposed_tuition_per_session_minor INTEGER NOT NULL
    CHECK (proposed_tuition_per_session_minor BETWEEN 1 AND 100000000),
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'pending', 'published', 'rejected', 'closed')),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  contract_revision_id TEXT REFERENCES content_revisions (id) ON DELETE RESTRICT,
  acknowledged_at TEXT,
  reviewed_by TEXT REFERENCES users (id) ON DELETE RESTRICT,
  reviewed_at TEXT,
  rejection_reason TEXT CHECK (rejection_reason IS NULL OR length(rejection_reason) BETWEEN 5 AND 500),
  published_at TEXT,
  mutation_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (mode <> 'offline' OR area IS NOT NULL),
  CHECK ((status = 'draft' AND contract_revision_id IS NULL AND acknowledged_at IS NULL
      AND reviewed_by IS NULL AND reviewed_at IS NULL AND rejection_reason IS NULL
      AND published_at IS NULL)
    OR (status = 'pending' AND contract_revision_id IS NOT NULL AND acknowledged_at IS NOT NULL
      AND reviewed_by IS NULL AND reviewed_at IS NULL AND rejection_reason IS NULL
      AND published_at IS NULL)
    OR (status = 'published' AND contract_revision_id IS NOT NULL AND acknowledged_at IS NOT NULL
      AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL AND rejection_reason IS NULL
      AND published_at IS NOT NULL)
    OR (status = 'rejected' AND contract_revision_id IS NOT NULL AND acknowledged_at IS NOT NULL
      AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL AND rejection_reason IS NOT NULL
      AND published_at IS NULL)
    OR (status = 'closed' AND contract_revision_id IS NOT NULL AND acknowledged_at IS NOT NULL))
);
CREATE INDEX tutor_student_offers_owner_idx
  ON tutor_student_offers (tutor_user_id, updated_at DESC, id);
CREATE INDEX tutor_student_offers_review_idx
  ON tutor_student_offers (status, updated_at DESC, id);
CREATE INDEX tutor_student_offers_public_idx
  ON tutor_student_offers (status, subject_id, grade, mode, published_at DESC, id);

CREATE TABLE tutor_offer_contract_acks (
  id TEXT PRIMARY KEY NOT NULL,
  offer_id TEXT NOT NULL REFERENCES tutor_student_offers (id) ON DELETE RESTRICT,
  tutor_user_id TEXT NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  offer_version INTEGER NOT NULL CHECK (offer_version >= 1),
  contract_revision_id TEXT NOT NULL REFERENCES content_revisions (id) ON DELETE RESTRICT,
  acknowledged_at TEXT NOT NULL,
  UNIQUE (offer_id, offer_version)
);
CREATE INDEX tutor_offer_contract_acks_offer_idx
  ON tutor_offer_contract_acks (offer_id, acknowledged_at DESC);
CREATE TRIGGER tutor_offer_contract_acks_no_update BEFORE UPDATE ON tutor_offer_contract_acks
BEGIN SELECT RAISE(ABORT, 'offer contract acknowledgement is immutable'); END;
CREATE TRIGGER tutor_offer_contract_acks_no_delete BEFORE DELETE ON tutor_offer_contract_acks
BEGIN SELECT RAISE(ABORT, 'offer contract acknowledgement history cannot be deleted'); END;
CREATE TRIGGER tutor_offer_contract_acks_valid BEFORE INSERT ON tutor_offer_contract_acks
WHEN NOT EXISTS (
  SELECT 1 FROM tutor_student_offers o
  JOIN tutor_profiles p ON p.user_id = o.tutor_user_id
  JOIN users u ON u.id = o.tutor_user_id
  JOIN tutor_subjects ts ON ts.tutor_id = o.tutor_user_id AND ts.subject_id = o.subject_id
  JOIN content_revisions c ON c.id = NEW.contract_revision_id
  WHERE o.id = NEW.offer_id AND o.tutor_user_id = NEW.tutor_user_id
    AND o.version = NEW.offer_version AND o.status IN ('draft', 'rejected')
    AND p.approval_status = 'approved' AND p.visibility = 'public'
    AND ((o.mode = 'online' AND p.teaches_online = 1)
      OR (o.mode = 'offline' AND p.teaches_offline = 1))
    AND u.role = 'tutor' AND u.status = 'active'
    AND c.kind = 'contract' AND c.slug = 'tutor-student-offer-contract'
    AND c.audience = 'tutor' AND c.status = 'published'
    AND c.published_at <= NEW.acknowledged_at
)
BEGIN SELECT RAISE(ABORT, 'TUTOR_OFFER_CONTRACT_NOT_READY'); END;

CREATE TRIGGER tutor_student_offers_create_gate BEFORE INSERT ON tutor_student_offers
WHEN NOT EXISTS (
  SELECT 1 FROM tutor_profiles p JOIN users u ON u.id = p.user_id
  JOIN tutor_subjects ts ON ts.tutor_id = p.user_id AND ts.subject_id = NEW.subject_id
  WHERE p.user_id = NEW.tutor_user_id AND p.approval_status = 'approved'
    AND ((NEW.mode = 'online' AND p.teaches_online = 1)
      OR (NEW.mode = 'offline' AND p.teaches_offline = 1))
    AND u.role = 'tutor' AND u.status = 'active'
) OR (SELECT count(*) FROM tutor_student_offers
      WHERE tutor_user_id = NEW.tutor_user_id AND status IN ('draft', 'pending', 'published')) >= 10
BEGIN SELECT RAISE(ABORT, 'TUTOR_OFFER_CREATE_NOT_ALLOWED'); END;
CREATE TRIGGER tutor_student_offers_no_delete BEFORE DELETE ON tutor_student_offers
BEGIN SELECT RAISE(ABORT, 'tutor offer history cannot be deleted'); END;
CREATE TRIGGER tutor_student_offers_identity_immutable BEFORE UPDATE OF id, tutor_user_id, created_at
ON tutor_student_offers
BEGIN SELECT RAISE(ABORT, 'tutor offer identity is immutable'); END;
CREATE TRIGGER tutor_student_offers_transition BEFORE UPDATE OF status ON tutor_student_offers
WHEN OLD.status <> NEW.status AND NOT (
  (OLD.status IN ('draft', 'rejected') AND NEW.status = 'pending')
  OR (OLD.status = 'rejected' AND NEW.status = 'draft')
  OR (OLD.status = 'pending' AND NEW.status IN ('published', 'rejected'))
  OR (OLD.status IN ('pending', 'published') AND NEW.status = 'closed')
)
BEGIN SELECT RAISE(ABORT, 'tutor offer status transition is invalid'); END;
CREATE TRIGGER tutor_student_offers_core_immutable BEFORE UPDATE OF
  subject_id, grade, mode, area, proposed_tuition_per_session_minor ON tutor_student_offers
WHEN OLD.status NOT IN ('draft', 'rejected') AND NOT (
  OLD.status = 'closed' AND NEW.subject_id IS OLD.subject_id AND NEW.grade IS OLD.grade
    AND NEW.mode IS OLD.mode
    AND NEW.proposed_tuition_per_session_minor IS OLD.proposed_tuition_per_session_minor
    AND NEW.area IS CASE WHEN OLD.mode = 'offline' THEN 'Đã ẩn khu vực' ELSE NULL END
)
BEGIN SELECT RAISE(ABORT, 'submitted tutor offer is immutable'); END;
CREATE TRIGGER tutor_student_offers_valid_submit BEFORE UPDATE OF status ON tutor_student_offers
WHEN NEW.status = 'pending' AND OLD.status IN ('draft', 'rejected') AND NOT EXISTS (
  SELECT 1 FROM tutor_offer_contract_acks a
  JOIN content_revisions c ON c.id = a.contract_revision_id
  JOIN tutor_profiles p ON p.user_id = NEW.tutor_user_id
  JOIN users u ON u.id = NEW.tutor_user_id
  JOIN tutor_subjects ts ON ts.tutor_id = NEW.tutor_user_id AND ts.subject_id = NEW.subject_id
  WHERE a.offer_id = NEW.id AND a.offer_version = OLD.version
    AND a.tutor_user_id = NEW.tutor_user_id
    AND a.contract_revision_id = NEW.contract_revision_id
    AND a.acknowledged_at = NEW.acknowledged_at
    AND c.kind = 'contract' AND c.slug = 'tutor-student-offer-contract'
    AND c.audience = 'tutor' AND c.status = 'published'
    AND p.approval_status = 'approved' AND p.visibility = 'public'
    AND ((NEW.mode = 'online' AND p.teaches_online = 1)
      OR (NEW.mode = 'offline' AND p.teaches_offline = 1))
    AND u.role = 'tutor' AND u.status = 'active'
)
BEGIN SELECT RAISE(ABORT, 'TUTOR_OFFER_CONTRACT_NOT_READY'); END;
CREATE TRIGGER tutor_student_offers_active_quota BEFORE UPDATE OF status ON tutor_student_offers
WHEN OLD.status = 'rejected' AND NEW.status IN ('draft', 'pending')
  AND (SELECT count(*) FROM tutor_student_offers
    WHERE tutor_user_id = NEW.tutor_user_id AND status IN ('draft', 'pending', 'published')) >= 10
BEGIN SELECT RAISE(ABORT, 'TUTOR_OFFER_CREATE_NOT_ALLOWED'); END;
CREATE TRIGGER tutor_student_offers_valid_review BEFORE UPDATE OF status ON tutor_student_offers
WHEN OLD.status = 'pending' AND NEW.status IN ('published', 'rejected') AND NOT EXISTS (
  SELECT 1 FROM users moderator WHERE moderator.id = NEW.reviewed_by
    AND moderator.role = 'admin' AND moderator.status = 'active'
)
BEGIN SELECT RAISE(ABORT, 'TUTOR_OFFER_REVIEW_NOT_ALLOWED'); END;
CREATE TRIGGER tutor_student_offers_valid_publish BEFORE UPDATE OF status ON tutor_student_offers
WHEN NEW.status = 'published' AND NOT EXISTS (
  SELECT 1 FROM tutor_profiles p JOIN users u ON u.id = p.user_id
  WHERE p.user_id = NEW.tutor_user_id AND p.approval_status = 'approved'
    AND ((NEW.mode = 'online' AND p.teaches_online = 1)
      OR (NEW.mode = 'offline' AND p.teaches_offline = 1))
    AND p.visibility = 'public' AND u.status = 'active' AND u.role = 'tutor'
)
BEGIN SELECT RAISE(ABORT, 'TUTOR_OFFER_TUTOR_NOT_ELIGIBLE'); END;

-- An offer pending moderator review or already public is an active obligation.
CREATE TRIGGER tutor_student_offers_account_deletion_gate BEFORE INSERT ON account_deletions
WHEN EXISTS (SELECT 1 FROM tutor_student_offers
  WHERE tutor_user_id = NEW.user_id AND status IN ('pending', 'published'))
BEGIN SELECT RAISE(ABORT, 'ACCOUNT_DELETION_BLOCKED'); END;
