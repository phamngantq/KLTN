-- "Khiếu nại của tôi": an author may keep a private draft ("Chưa gửi"), edit or delete it,
-- then send it. SQLite cannot widen a CHECK in place, so the table is rebuilt with its
-- indexes and triggers. No other table references complaints.
CREATE TABLE complaints_new (
  id TEXT PRIMARY KEY NOT NULL,
  code TEXT NOT NULL,
  creator_user_id TEXT NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  class_id TEXT REFERENCES class_listings (id) ON DELETE RESTRICT,
  title TEXT NOT NULL CHECK (length(title) BETWEEN 5 AND 120),
  body TEXT NOT NULL CHECK (length(body) BETWEEN 10 AND 5000),
  status TEXT NOT NULL DEFAULT 'submitted'
    CHECK (status IN ('draft', 'submitted', 'in_review', 'resolved')),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  triage_reason TEXT CHECK (triage_reason IS NULL OR length(triage_reason) BETWEEN 4 AND 1000),
  resolution TEXT CHECK (resolution IS NULL OR length(resolution) BETWEEN 4 AND 2000),
  handled_by TEXT REFERENCES users (id) ON DELETE RESTRICT,
  resolved_at TEXT,
  submitted_at TEXT,
  mutation_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK ((status = 'resolved' AND resolution IS NOT NULL AND resolved_at IS NOT NULL)
    OR (status <> 'resolved' AND resolution IS NULL AND resolved_at IS NULL)),
  CHECK ((status = 'draft' AND submitted_at IS NULL AND handled_by IS NULL AND triage_reason IS NULL)
    OR (status <> 'draft' AND submitted_at IS NOT NULL))
);

INSERT INTO complaints_new (
  id, code, creator_user_id, class_id, title, body, status, version, triage_reason,
  resolution, handled_by, resolved_at, submitted_at, mutation_id, created_at, updated_at
)
SELECT id, code, creator_user_id, class_id, title, body, status, version, triage_reason,
  resolution, handled_by, resolved_at, created_at, mutation_id, created_at, updated_at
FROM complaints;

DROP TABLE complaints;
ALTER TABLE complaints_new RENAME TO complaints;

CREATE UNIQUE INDEX complaints_code_uq ON complaints (code);
CREATE INDEX complaints_owner_created_idx ON complaints (creator_user_id, created_at DESC, id);
CREATE INDEX complaints_status_created_idx ON complaints (status, created_at DESC, id);
CREATE INDEX complaints_class_idx ON complaints (class_id, created_at DESC);

-- Open (sent, unresolved) complaints stay capped at 10 whether created sent or sent later.
CREATE TRIGGER complaints_open_quota BEFORE INSERT ON complaints
WHEN NEW.status IN ('submitted', 'in_review') AND (SELECT count(*) FROM complaints
  WHERE creator_user_id = NEW.creator_user_id AND status IN ('submitted', 'in_review')) >= 10
BEGIN SELECT RAISE(ABORT, 'COMPLAINT_QUOTA_EXCEEDED'); END;
CREATE TRIGGER complaints_submit_quota BEFORE UPDATE OF status ON complaints
WHEN OLD.status = 'draft' AND NEW.status = 'submitted' AND (SELECT count(*) FROM complaints
  WHERE creator_user_id = NEW.creator_user_id AND status IN ('submitted', 'in_review')) >= 10
BEGIN SELECT RAISE(ABORT, 'COMPLAINT_QUOTA_EXCEEDED'); END;
CREATE TRIGGER complaints_draft_quota BEFORE INSERT ON complaints
WHEN NEW.status = 'draft' AND (SELECT count(*) FROM complaints
  WHERE creator_user_id = NEW.creator_user_id AND status = 'draft') >= 20
BEGIN SELECT RAISE(ABORT, 'COMPLAINT_DRAFT_QUOTA_EXCEEDED'); END;
-- A draft only moves to "submitted"; sent complaints never return to draft.
CREATE TRIGGER complaints_valid_transition BEFORE UPDATE OF status ON complaints
WHEN (OLD.status = 'draft' AND NEW.status NOT IN ('draft', 'submitted'))
  OR (OLD.status <> 'draft' AND NEW.status = 'draft')
BEGIN SELECT RAISE(ABORT, 'COMPLAINT_TRANSITION_INVALID'); END;
-- Only unsent drafts may be deleted; sent complaints are history.
CREATE TRIGGER complaints_no_delete_sent BEFORE DELETE ON complaints
WHEN OLD.status <> 'draft'
BEGIN SELECT RAISE(ABORT, 'COMPLAINT_DELETE_INVALID'); END;
CREATE TRIGGER account_deleted_complaint_insert BEFORE INSERT ON complaints
WHEN EXISTS (SELECT 1 FROM account_deletions WHERE user_id = NEW.creator_user_id)
BEGIN SELECT RAISE(ABORT, 'ACCOUNT_DELETED'); END;
