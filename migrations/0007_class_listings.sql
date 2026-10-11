-- Class listings are separate from legacy 30-minute bookings.
-- A listing is sourced from exactly one consented parent request. Only a moderator
-- can choose the broad public area; private contact and free-text request notes
-- never flow into the public class projection.
CREATE TABLE class_listings (
  id TEXT PRIMARY KEY NOT NULL,
  code TEXT NOT NULL CHECK (length(code) = 15 AND substr(code, 1, 3) = 'LH-' AND substr(code, 4) NOT GLOB '*[^A-F0-9]*'),
  source_request_id TEXT NOT NULL REFERENCES parent_requests (id) ON DELETE RESTRICT,
  source_request_version INTEGER NOT NULL CHECK (source_request_version >= 1),
  parent_user_id TEXT NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  subject_id TEXT NOT NULL REFERENCES subjects (id) ON DELETE RESTRICT,
  grade TEXT NOT NULL CHECK (length(grade) BETWEEN 1 AND 40),
  mode TEXT NOT NULL CHECK (mode IN ('online', 'offline')),
  public_area TEXT CHECK (public_area IS NULL OR length(public_area) BETWEEN 1 AND 120),
  expected_budget_minor INTEGER CHECK (expected_budget_minor IS NULL OR expected_budget_minor BETWEEN 0 AND 100000000),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'open', 'active', 'completed', 'cancelled')),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  mutation_id TEXT NOT NULL,
  published_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK ((status = 'draft' AND published_at IS NULL) OR (status <> 'draft' AND published_at IS NOT NULL))
);
CREATE UNIQUE INDEX class_listings_code_uq ON class_listings (code);
CREATE UNIQUE INDEX class_listings_source_request_uq ON class_listings (source_request_id);
CREATE INDEX class_listings_public_idx ON class_listings (status, published_at DESC, id);
CREATE INDEX class_listings_filter_idx ON class_listings (status, subject_id, grade, mode, published_at DESC, id);

-- Reject stale/invalid sourcing even when a caller bypasses the Worker.
CREATE TRIGGER class_listings_valid_source BEFORE INSERT ON class_listings
WHEN NOT EXISTS (
  SELECT 1 FROM parent_requests r JOIN parent_request_private p ON p.request_id = r.id
  WHERE r.id = NEW.source_request_id AND r.parent_user_id = NEW.parent_user_id
    AND r.subject_id = NEW.subject_id AND r.grade = NEW.grade AND r.mode = NEW.mode
    AND r.expected_budget_minor IS NEW.expected_budget_minor
    AND r.status = 'submitted' AND r.version = NEW.source_request_version
    AND p.contact_consent_at IS NOT NULL AND p.contact_consent_version IS NOT NULL
)
BEGIN SELECT RAISE(ABORT, 'CLASS_SOURCE_INVALID'); END;

-- A policy version may be selected only after a separate moderator approval and
-- publish flow exists. This migration creates no option and no assumed fee.
CREATE TABLE fee_option_versions (
  id TEXT PRIMARY KEY NOT NULL,
  option_key TEXT NOT NULL CHECK (option_key IN ('first_lesson_percent', 'lesson_multiplier_with_deposit', 'monthly_percent')),
  version INTEGER NOT NULL CHECK (version >= 1),
  title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 120),
  policy_text TEXT NOT NULL CHECK (length(policy_text) BETWEEN 1 AND 2000),
  rate_basis_points INTEGER NOT NULL CHECK (rate_basis_points BETWEEN 1 AND 100000),
  deposit_basis_points INTEGER CHECK (deposit_basis_points IS NULL OR deposit_basis_points BETWEEN 1 AND 10000),
  scope_subject_id TEXT REFERENCES subjects (id) ON DELETE RESTRICT,
  scope_mode TEXT CHECK (scope_mode IS NULL OR scope_mode IN ('online', 'offline')),
  status TEXT NOT NULL CHECK (status IN ('draft', 'published')),
  effective_from TEXT,
  effective_to TEXT,
  approved_by TEXT REFERENCES users (id) ON DELETE RESTRICT,
  published_at TEXT,
  mutation_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  CHECK ((option_key = 'lesson_multiplier_with_deposit' AND deposit_basis_points IS NOT NULL) OR
         (option_key <> 'lesson_multiplier_with_deposit' AND deposit_basis_points IS NULL AND rate_basis_points <= 10000)),
  CHECK ((status = 'draft' AND published_at IS NULL AND approved_by IS NULL) OR
         (status = 'published' AND published_at IS NOT NULL AND approved_by IS NOT NULL)),
  CHECK (effective_to IS NULL OR effective_from IS NULL OR effective_from < effective_to)
);
CREATE UNIQUE INDEX fee_option_versions_key_version_uq ON fee_option_versions (option_key, version);
CREATE INDEX fee_option_versions_available_idx ON fee_option_versions (status, scope_subject_id, scope_mode, effective_from, effective_to);
CREATE TRIGGER fee_option_versions_published_immutable BEFORE UPDATE ON fee_option_versions
WHEN OLD.status = 'published'
BEGIN SELECT RAISE(ABORT, 'PUBLISHED_FEE_OPTION_IMMUTABLE'); END;
CREATE TRIGGER fee_option_versions_valid_publish BEFORE UPDATE ON fee_option_versions
WHEN NEW.status = 'published' AND NOT EXISTS (
  SELECT 1 FROM users WHERE id = NEW.approved_by AND role = 'admin' AND status = 'active'
)
BEGIN SELECT RAISE(ABORT, 'FEE_APPROVER_INVALID'); END;
CREATE TRIGGER fee_option_versions_no_delete BEFORE DELETE ON fee_option_versions
WHEN OLD.status = 'published'
BEGIN SELECT RAISE(ABORT, 'PUBLISHED_FEE_OPTION_IMMUTABLE'); END;

CREATE TABLE tutor_applications (
  id TEXT PRIMARY KEY NOT NULL,
  class_id TEXT NOT NULL REFERENCES class_listings (id) ON DELETE RESTRICT,
  tutor_user_id TEXT NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  fee_option_version_id TEXT NOT NULL REFERENCES fee_option_versions (id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted', 'withdrawn', 'rejected', 'selected')),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  mutation_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX tutor_applications_live_uq ON tutor_applications (class_id, tutor_user_id)
  WHERE status IN ('submitted', 'selected');
CREATE INDEX tutor_applications_tutor_created_idx ON tutor_applications (tutor_user_id, created_at DESC, id);
CREATE INDEX tutor_applications_class_status_idx ON tutor_applications (class_id, status, created_at DESC, id);

-- The app verifies the same predicates before inserting; this trigger closes
-- concurrent changes and protects direct D1 writes from bypassing the policy gate.
CREATE TRIGGER tutor_applications_valid_insert BEFORE INSERT ON tutor_applications
WHEN NOT EXISTS (
  SELECT 1 FROM class_listings c
  JOIN tutor_profiles t ON t.user_id = NEW.tutor_user_id
  JOIN users u ON u.id = NEW.tutor_user_id
  JOIN tutor_subjects s ON s.tutor_id = NEW.tutor_user_id AND s.subject_id = c.subject_id
  JOIN fee_option_versions f ON f.id = NEW.fee_option_version_id
  WHERE c.id = NEW.class_id AND c.status = 'open' AND NEW.status = 'submitted'
    AND t.approval_status = 'approved' AND u.status = 'active'
    AND ((c.mode = 'online' AND t.teaches_online = 1) OR
         (c.mode = 'offline' AND t.teaches_offline = 1))
    AND f.status = 'published' AND f.published_at <= NEW.created_at
    AND (f.effective_from IS NULL OR f.effective_from <= NEW.created_at)
    AND (f.effective_to IS NULL OR NEW.created_at < f.effective_to)
    AND (f.scope_subject_id IS NULL OR f.scope_subject_id = c.subject_id)
    AND (f.scope_mode IS NULL OR f.scope_mode = c.mode)
    AND f.id = (
      SELECT f2.id FROM fee_option_versions f2
      WHERE f2.option_key = f.option_key AND f2.status = 'published'
        AND f2.published_at <= NEW.created_at
        AND (f2.effective_from IS NULL OR f2.effective_from <= NEW.created_at)
        AND (f2.effective_to IS NULL OR NEW.created_at < f2.effective_to)
        AND (f2.scope_subject_id IS NULL OR f2.scope_subject_id = c.subject_id)
        AND (f2.scope_mode IS NULL OR f2.scope_mode = c.mode)
      ORDER BY ((f2.scope_subject_id IS NOT NULL) + (f2.scope_mode IS NOT NULL)) DESC,
        f2.version DESC LIMIT 1
    )
)
BEGIN SELECT RAISE(ABORT, 'APPLICATION_NOT_ELIGIBLE'); END;
