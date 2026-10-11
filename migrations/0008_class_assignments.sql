-- Moderator assignment activates a class immediately. No parent contact is copied here.
-- Revocation is a reserved state; no API may enter it until its policy is approved.
ALTER TABLE tutor_applications ADD COLUMN rejection_reason TEXT
  CHECK (rejection_reason IS NULL OR length(rejection_reason) BETWEEN 1 AND 500);

CREATE TABLE class_assignments (
  id TEXT PRIMARY KEY NOT NULL,
  class_id TEXT NOT NULL REFERENCES class_listings (id) ON DELETE RESTRICT,
  application_id TEXT NOT NULL REFERENCES tutor_applications (id) ON DELETE RESTRICT,
  tutor_user_id TEXT NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  assigned_by TEXT NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked')),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  mutation_id TEXT NOT NULL,
  assigned_at TEXT NOT NULL,
  revoked_at TEXT,
  CHECK ((status = 'active' AND revoked_at IS NULL) OR (status = 'revoked' AND revoked_at IS NOT NULL))
);
CREATE UNIQUE INDEX class_assignments_application_uq ON class_assignments (application_id);
CREATE UNIQUE INDEX class_assignments_active_class_uq ON class_assignments (class_id)
  WHERE status = 'active';
CREATE INDEX class_assignments_tutor_status_idx ON class_assignments (tutor_user_id, status, assigned_at DESC);

-- A batch with a stale zero-row update cannot commit an orphan assignment. The
-- source consent, selected application and active class/request must all exist.
CREATE TRIGGER class_assignments_valid_insert BEFORE INSERT ON class_assignments
WHEN NEW.status <> 'active' OR NOT EXISTS (
  SELECT 1 FROM class_listings c
  JOIN parent_requests r ON r.id = c.source_request_id
  JOIN parent_request_private p ON p.request_id = r.id
  JOIN tutor_applications a ON a.id = NEW.application_id
  JOIN tutor_profiles t ON t.user_id = NEW.tutor_user_id
  JOIN users u ON u.id = NEW.tutor_user_id
  JOIN users moderator ON moderator.id = NEW.assigned_by
  WHERE c.id = NEW.class_id AND c.status = 'active'
    AND r.status = 'assigned' AND r.parent_user_id = c.parent_user_id
    AND p.contact_consent_at IS NOT NULL AND p.contact_consent_version IS NOT NULL
    AND a.class_id = c.id AND a.tutor_user_id = NEW.tutor_user_id AND a.status = 'selected'
    AND t.approval_status = 'approved' AND u.status = 'active'
    AND moderator.role = 'admin' AND moderator.status = 'active'
)
BEGIN SELECT RAISE(ABORT, 'ASSIGNMENT_NOT_ELIGIBLE'); END;
