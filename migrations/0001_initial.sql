-- Migration 0001: core relational model for Tutor Matching Platform.
-- Conventions:
--   * ids are server-generated TEXT (UUID).
--   * instants are canonical UTC ISO-8601 strings produced by Date#toISOString()
--     ('YYYY-MM-DDTHH:MM:SS.sssZ'); recurring hours are local 'HH:MM' + IANA timezone.
--   * format CHECKs use strftime()/date() round-trips: D1 rejects long GLOB patterns.
--   * money is INTEGER minor units (VND has no fractional unit).
--   * D1 enforces FOREIGN KEY constraints.

CREATE TABLE users (
  id TEXT PRIMARY KEY NOT NULL,
  email TEXT NOT NULL CHECK (length(email) BETWEEN 3 AND 254),
  email_normalized TEXT NOT NULL CHECK (email_normalized = lower(trim(email_normalized))),
  display_name TEXT NOT NULL CHECK (length(display_name) BETWEEN 1 AND 100),
  role TEXT NOT NULL CHECK (role IN ('student', 'tutor', 'admin')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX users_email_normalized_uq ON users (email_normalized);

CREATE TABLE auth_credentials (
  user_id TEXT PRIMARY KEY NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  -- Self-describing encoded hash: algorithm, version/cost parameters, salt and digest.
  password_hash TEXT NOT NULL CHECK (length(password_hash) BETWEEN 20 AND 512),
  updated_at TEXT NOT NULL
);

CREATE TABLE auth_sessions (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  -- SHA-256 hex of the random session token; the raw token is never stored.
  token_hash TEXT NOT NULL CHECK (length(token_hash) = 64),
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  revoked_at TEXT
);
CREATE UNIQUE INDEX auth_sessions_token_hash_uq ON auth_sessions (token_hash);
CREATE INDEX auth_sessions_user_expires_idx ON auth_sessions (user_id, expires_at);

CREATE TABLE tutor_profiles (
  user_id TEXT PRIMARY KEY NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  slug TEXT NOT NULL CHECK (length(slug) BETWEEN 3 AND 80 AND slug NOT GLOB '*[^a-z0-9-]*'),
  bio TEXT NOT NULL DEFAULT '' CHECK (length(bio) <= 5000),
  hourly_rate_minor INTEGER CHECK (hourly_rate_minor IS NULL OR hourly_rate_minor >= 0),
  currency TEXT NOT NULL DEFAULT 'VND' CHECK (currency IN ('VND')),
  teaches_online INTEGER NOT NULL DEFAULT 0 CHECK (teaches_online IN (0, 1)),
  teaches_offline INTEGER NOT NULL DEFAULT 0 CHECK (teaches_offline IN (0, 1)),
  approval_status TEXT NOT NULL DEFAULT 'draft'
    CHECK (approval_status IN ('draft', 'pending', 'approved', 'rejected')),
  visibility TEXT NOT NULL DEFAULT 'private' CHECK (visibility IN ('private', 'public')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX tutor_profiles_slug_uq ON tutor_profiles (slug);
CREATE INDEX tutor_profiles_public_rate_idx
  ON tutor_profiles (approval_status, visibility, hourly_rate_minor);

CREATE TABLE subjects (
  id TEXT PRIMARY KEY NOT NULL,
  slug TEXT NOT NULL CHECK (length(slug) BETWEEN 1 AND 80 AND slug NOT GLOB '*[^a-z0-9-]*'),
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 100)
);
CREATE UNIQUE INDEX subjects_slug_uq ON subjects (slug);

CREATE TABLE tutor_subjects (
  tutor_id TEXT NOT NULL REFERENCES tutor_profiles (user_id) ON DELETE CASCADE,
  subject_id TEXT NOT NULL REFERENCES subjects (id) ON DELETE RESTRICT,
  PRIMARY KEY (tutor_id, subject_id)
) WITHOUT ROWID;
CREATE INDEX tutor_subjects_subject_idx ON tutor_subjects (subject_id, tutor_id);

CREATE TABLE availability_rules (
  id TEXT PRIMARY KEY NOT NULL,
  tutor_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  weekday INTEGER NOT NULL CHECK (weekday BETWEEN 1 AND 7), -- 1 = Monday .. 7 = Sunday
  start_local TEXT NOT NULL CHECK (start_local GLOB '[0-2][0-9]:[03]0' AND start_local <= '23:30'),
  end_local TEXT NOT NULL CHECK (end_local GLOB '[0-2][0-9]:[03]0' AND end_local <= '24:00'),
  timezone TEXT NOT NULL DEFAULT 'Asia/Ho_Chi_Minh' CHECK (length(timezone) BETWEEN 1 AND 64),
  effective_from TEXT CHECK (effective_from IS NULL OR effective_from = date(effective_from)),
  effective_to TEXT CHECK (effective_to IS NULL OR effective_to = date(effective_to)),
  created_at TEXT NOT NULL,
  CHECK (start_local < end_local),
  CHECK (effective_from IS NULL OR effective_to IS NULL OR effective_from <= effective_to)
);
CREATE INDEX availability_rules_tutor_weekday_idx ON availability_rules (tutor_id, weekday);

CREATE TABLE availability_exceptions (
  id TEXT PRIMARY KEY NOT NULL,
  tutor_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  date_local TEXT NOT NULL CHECK (date_local = date(date_local)),
  kind TEXT NOT NULL CHECK (kind IN ('closed', 'extra')),
  -- NULL start/end on a 'closed' exception means the whole local day is closed.
  start_local TEXT CHECK (start_local IS NULL OR (start_local GLOB '[0-2][0-9]:[03]0' AND start_local <= '23:30')),
  end_local TEXT CHECK (end_local IS NULL OR (end_local GLOB '[0-2][0-9]:[03]0' AND end_local <= '24:00')),
  timezone TEXT NOT NULL DEFAULT 'Asia/Ho_Chi_Minh' CHECK (length(timezone) BETWEEN 1 AND 64),
  created_at TEXT NOT NULL,
  CHECK (
    (start_local IS NULL AND end_local IS NULL AND kind = 'closed')
    OR (start_local IS NOT NULL AND end_local IS NOT NULL AND start_local < end_local)
  )
);
CREATE INDEX availability_exceptions_tutor_date_idx ON availability_exceptions (tutor_id, date_local);

CREATE TABLE bookings (
  id TEXT PRIMARY KEY NOT NULL,
  tutor_id TEXT NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  student_id TEXT NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  starts_at_utc TEXT NOT NULL CHECK (starts_at_utc = strftime('%Y-%m-%dT%H:%M:%fZ', starts_at_utc) AND substr(starts_at_utc, 15) IN ('00:00.000Z', '30:00.000Z')),
  ends_at_utc TEXT NOT NULL CHECK (ends_at_utc = strftime('%Y-%m-%dT%H:%M:%fZ', ends_at_utc) AND substr(ends_at_utc, 15) IN ('00:00.000Z', '30:00.000Z')),
  duration_minutes INTEGER NOT NULL CHECK (duration_minutes IN (30, 60, 90, 120)),
  status TEXT NOT NULL CHECK (status IN ('PENDING', 'CONFIRMED', 'COMPLETED', 'REJECTED', 'CANCELLED', 'EXPIRED')),
  -- Server-derived snapshot of the tutor's hourly rate and the computed total.
  hourly_rate_minor INTEGER NOT NULL CHECK (hourly_rate_minor >= 0),
  price_minor INTEGER NOT NULL CHECK (price_minor >= 0),
  currency TEXT NOT NULL DEFAULT 'VND' CHECK (currency IN ('VND')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (tutor_id <> student_id),
  CHECK (starts_at_utc < ends_at_utc)
);
CREATE INDEX bookings_tutor_starts_idx ON bookings (tutor_id, starts_at_utc);
CREATE INDEX bookings_student_starts_idx ON bookings (student_id, starts_at_utc);

-- One row per occupied 30-minute slot. The primary key is the double-booking guard.
CREATE TABLE booking_slot_claims (
  tutor_id TEXT NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  slot_start_utc TEXT NOT NULL CHECK (slot_start_utc = strftime('%Y-%m-%dT%H:%M:%fZ', slot_start_utc) AND substr(slot_start_utc, 15) IN ('00:00.000Z', '30:00.000Z')),
  booking_id TEXT NOT NULL REFERENCES bookings (id) ON DELETE CASCADE,
  PRIMARY KEY (tutor_id, slot_start_utc)
) WITHOUT ROWID;
CREATE INDEX booking_slot_claims_booking_idx ON booking_slot_claims (booking_id);

CREATE TABLE idempotency_keys (
  actor_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL CHECK (length(endpoint) BETWEEN 1 AND 100),
  idempotency_key TEXT NOT NULL CHECK (length(idempotency_key) BETWEEN 1 AND 255),
  request_hash TEXT NOT NULL CHECK (length(request_hash) = 64),
  status TEXT NOT NULL CHECK (status IN ('processing', 'completed')),
  response_status INTEGER,
  result_ref TEXT,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  PRIMARY KEY (actor_id, endpoint, idempotency_key)
) WITHOUT ROWID;
CREATE INDEX idempotency_keys_expires_idx ON idempotency_keys (expires_at);

CREATE TABLE audit_logs (
  id TEXT PRIMARY KEY NOT NULL,
  actor_id TEXT REFERENCES users (id) ON DELETE SET NULL,
  action TEXT NOT NULL CHECK (length(action) BETWEEN 1 AND 100),
  target_type TEXT NOT NULL CHECK (length(target_type) BETWEEN 1 AND 50),
  target_id TEXT NOT NULL,
  metadata TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(metadata)),
  created_at TEXT NOT NULL
);
CREATE INDEX audit_logs_target_idx ON audit_logs (target_type, target_id, created_at);
CREATE INDEX audit_logs_actor_idx ON audit_logs (actor_id, created_at);
