-- New parent request domain; legacy bookings and their slot claims remain untouched.
-- Draft/submitted requests are private. Publication and tutor contact access are later gates.
CREATE TABLE parent_requests (
  id TEXT PRIMARY KEY NOT NULL,
  code TEXT NOT NULL CHECK (
    length(code) = 15 AND substr(code, 1, 3) = 'YC-' AND
    substr(code, 4) NOT GLOB '*[^A-F0-9]*'
  ),
  parent_user_id TEXT NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  subject_id TEXT NOT NULL REFERENCES subjects (id) ON DELETE RESTRICT,
  grade TEXT NOT NULL CHECK (length(grade) BETWEEN 1 AND 40),
  mode TEXT NOT NULL CHECK (mode IN ('online', 'offline')),
  area TEXT CHECK (area IS NULL OR length(area) BETWEEN 1 AND 120),
  expected_budget_minor INTEGER CHECK (expected_budget_minor IS NULL OR expected_budget_minor BETWEEN 0 AND 100000000),
  description TEXT NOT NULL CHECK (length(description) <= 1000),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'submitted', 'sourcing', 'assigned', 'fulfilled', 'cancelled')),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  mutation_id TEXT NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'Asia/Ho_Chi_Minh' CHECK (length(timezone) BETWEEN 1 AND 64),
  discuss_later INTEGER NOT NULL CHECK (discuss_later IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (mode = 'online' OR area IS NOT NULL)
);
CREATE UNIQUE INDEX parent_requests_code_uq ON parent_requests (code);
CREATE INDEX parent_requests_owner_created_idx ON parent_requests (parent_user_id, created_at DESC, id);
CREATE INDEX parent_requests_status_updated_idx ON parent_requests (status, updated_at DESC, id);

-- A DB trigger, rather than a read-then-write count in the Worker, closes concurrent quota races.
CREATE TRIGGER parent_requests_open_quota BEFORE INSERT ON parent_requests
WHEN NEW.status IN ('draft', 'submitted', 'sourcing') AND
  (SELECT count(*) FROM parent_requests
   WHERE parent_user_id = NEW.parent_user_id AND status IN ('draft', 'submitted', 'sourcing')) >= 20
BEGIN
  SELECT RAISE(ABORT, 'REQUEST_QUOTA_EXCEEDED');
END;

-- Account deletion must explicitly purge private contact, reconcile legacy booking FKs,
-- and retain/reassign non-private request history before deleting the user.
CREATE TABLE parent_request_private (
  request_id TEXT PRIMARY KEY NOT NULL REFERENCES parent_requests (id) ON DELETE CASCADE,
  contact_phone TEXT CHECK (
    contact_phone IS NULL OR
    (length(contact_phone) BETWEEN 8 AND 16 AND contact_phone NOT GLOB '*[^0-9+]*')
  ),
  contact_address TEXT CHECK (contact_address IS NULL OR length(contact_address) BETWEEN 1 AND 200),
  contact_consent_at TEXT,
  contact_consent_version TEXT,
  CHECK ((contact_consent_at IS NULL) = (contact_consent_version IS NULL))
);

CREATE TABLE request_schedule_windows (
  request_id TEXT NOT NULL REFERENCES parent_requests (id) ON DELETE CASCADE,
  weekday INTEGER NOT NULL CHECK (weekday BETWEEN 1 AND 7),
  start_local TEXT NOT NULL CHECK (start_local GLOB '[0-2][0-9]:[0-5][0-9]' AND start_local < '24:00'),
  end_local TEXT NOT NULL CHECK (end_local GLOB '[0-2][0-9]:[0-5][0-9]' AND end_local < '24:00'),
  timezone TEXT NOT NULL CHECK (length(timezone) BETWEEN 1 AND 64),
  PRIMARY KEY (request_id, weekday, start_local),
  CHECK (start_local < end_local)
);
CREATE INDEX request_schedule_windows_request_weekday_idx ON request_schedule_windows (request_id, weekday);
CREATE TRIGGER request_schedule_windows_valid BEFORE INSERT ON request_schedule_windows
WHEN (SELECT count(*) FROM request_schedule_windows WHERE request_id = NEW.request_id) >= 14 OR
  EXISTS (SELECT 1 FROM request_schedule_windows
          WHERE request_id = NEW.request_id AND weekday = NEW.weekday
            AND start_local < NEW.end_local AND end_local > NEW.start_local)
BEGIN
  SELECT RAISE(ABORT, 'REQUEST_WINDOWS_INVALID');
END;
