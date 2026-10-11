-- User complaints are private to their author and moderators. No attachments are stored.
CREATE TABLE complaints (
  id TEXT PRIMARY KEY NOT NULL,
  code TEXT NOT NULL,
  creator_user_id TEXT NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  class_id TEXT REFERENCES class_listings (id) ON DELETE RESTRICT,
  title TEXT NOT NULL CHECK (length(title) BETWEEN 5 AND 120),
  body TEXT NOT NULL CHECK (length(body) BETWEEN 10 AND 5000),
  status TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted', 'in_review', 'resolved')),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  triage_reason TEXT CHECK (triage_reason IS NULL OR length(triage_reason) BETWEEN 4 AND 1000),
  resolution TEXT CHECK (resolution IS NULL OR length(resolution) BETWEEN 4 AND 2000),
  handled_by TEXT REFERENCES users (id) ON DELETE RESTRICT,
  resolved_at TEXT,
  mutation_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK ((status = 'resolved' AND resolution IS NOT NULL AND resolved_at IS NOT NULL)
    OR (status <> 'resolved' AND resolution IS NULL AND resolved_at IS NULL))
);
CREATE UNIQUE INDEX complaints_code_uq ON complaints (code);
CREATE INDEX complaints_owner_created_idx ON complaints (creator_user_id, created_at DESC, id);
CREATE INDEX complaints_status_created_idx ON complaints (status, created_at DESC, id);
CREATE INDEX complaints_class_idx ON complaints (class_id, created_at DESC);
CREATE TRIGGER complaints_open_quota BEFORE INSERT ON complaints
WHEN (SELECT count(*) FROM complaints WHERE creator_user_id = NEW.creator_user_id
  AND status IN ('submitted', 'in_review')) >= 10
BEGIN SELECT RAISE(ABORT, 'COMPLAINT_QUOTA_EXCEEDED'); END;

-- Keep stable user IDs/FKs for historical bookings, classes and audits while erasing identity.
CREATE TABLE account_deletions (
  user_id TEXT PRIMARY KEY NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  deleted_at TEXT NOT NULL
);

-- An account with an active commitment cannot be deleted until the existing
-- booking/class/request/application workflow resolves it under an approved policy.
CREATE TRIGGER account_deletions_eligible BEFORE INSERT ON account_deletions
WHEN NOT EXISTS (SELECT 1 FROM users WHERE id = NEW.user_id AND role IN ('student', 'tutor') AND status = 'active')
  OR EXISTS (SELECT 1 FROM bookings WHERE (student_id = NEW.user_id OR tutor_id = NEW.user_id)
    AND status IN ('PENDING', 'CONFIRMED'))
  OR EXISTS (SELECT 1 FROM parent_requests WHERE parent_user_id = NEW.user_id
    AND status IN ('submitted', 'sourcing', 'assigned'))
  OR EXISTS (SELECT 1 FROM class_listings WHERE parent_user_id = NEW.user_id
    AND status IN ('draft', 'open', 'active'))
  OR EXISTS (SELECT 1 FROM tutor_applications WHERE tutor_user_id = NEW.user_id
    AND status IN ('submitted', 'selected'))
  OR EXISTS (SELECT 1 FROM class_assignments WHERE tutor_user_id = NEW.user_id
    AND status = 'active')
BEGIN SELECT RAISE(ABORT, 'ACCOUNT_DELETION_BLOCKED'); END;

CREATE TRIGGER account_deleted_parent_request_insert BEFORE INSERT ON parent_requests
WHEN EXISTS (SELECT 1 FROM account_deletions WHERE user_id = NEW.parent_user_id)
BEGIN SELECT RAISE(ABORT, 'ACCOUNT_DELETED'); END;
CREATE TRIGGER account_deleted_parent_request_update BEFORE UPDATE ON parent_requests
WHEN EXISTS (SELECT 1 FROM account_deletions WHERE user_id = OLD.parent_user_id)
BEGIN SELECT RAISE(ABORT, 'ACCOUNT_DELETED'); END;
CREATE TRIGGER account_deleted_application_insert BEFORE INSERT ON tutor_applications
WHEN EXISTS (SELECT 1 FROM account_deletions WHERE user_id = NEW.tutor_user_id)
BEGIN SELECT RAISE(ABORT, 'ACCOUNT_DELETED'); END;
CREATE TRIGGER account_deleted_booking_insert BEFORE INSERT ON bookings
WHEN EXISTS (SELECT 1 FROM account_deletions WHERE user_id = NEW.student_id OR user_id = NEW.tutor_id)
BEGIN SELECT RAISE(ABORT, 'ACCOUNT_DELETED'); END;
CREATE TRIGGER account_deleted_assignment_insert BEFORE INSERT ON class_assignments
WHEN EXISTS (SELECT 1 FROM account_deletions WHERE user_id = NEW.tutor_user_id)
  OR EXISTS (SELECT 1 FROM class_listings c JOIN account_deletions d ON d.user_id = c.parent_user_id
    WHERE c.id = NEW.class_id)
BEGIN SELECT RAISE(ABORT, 'ACCOUNT_DELETED'); END;
CREATE TRIGGER account_deleted_complaint_insert BEFORE INSERT ON complaints
WHEN EXISTS (SELECT 1 FROM account_deletions WHERE user_id = NEW.creator_user_id)
BEGIN SELECT RAISE(ABORT, 'ACCOUNT_DELETED'); END;
CREATE TRIGGER account_deleted_user_reactivate BEFORE UPDATE OF status ON users
WHEN NEW.status = 'active' AND EXISTS (SELECT 1 FROM account_deletions WHERE user_id = NEW.id)
BEGIN SELECT RAISE(ABORT, 'ACCOUNT_DELETED'); END;
