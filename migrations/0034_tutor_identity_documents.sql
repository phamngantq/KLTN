-- "Thông tin cơ bản" of the tutor profile: education facts on the profile, private contact
-- and citizen-ID facts in a separate owner/moderator-only table, and uploaded ID images and
-- credentials as D1 BLOBs. Account deletion and profile deletion purge both tables.
ALTER TABLE tutor_profiles ADD COLUMN major TEXT
  CHECK (major IS NULL OR length(major) BETWEEN 1 AND 120);
ALTER TABLE tutor_profiles ADD COLUMN graduation_year INTEGER
  CHECK (graduation_year IS NULL OR graduation_year BETWEEN 1950 AND 2100);

CREATE TABLE tutor_private_profiles (
  tutor_id TEXT PRIMARY KEY NOT NULL REFERENCES tutor_profiles (user_id) ON DELETE CASCADE,
  phone TEXT CHECK (phone IS NULL OR length(phone) BETWEEN 8 AND 16),
  date_of_birth TEXT CHECK (date_of_birth IS NULL OR length(date_of_birth) = 10),
  id_number TEXT CHECK (id_number IS NULL OR (length(id_number) = 12 AND id_number NOT GLOB '*[^0-9]*')),
  id_issued_on TEXT CHECK (id_issued_on IS NULL OR length(id_issued_on) = 10),
  id_residence TEXT CHECK (id_residence IS NULL OR length(id_residence) BETWEEN 1 AND 200),
  id_verification TEXT NOT NULL DEFAULT 'center' CHECK (id_verification IN ('center', 'upload')),
  updated_at TEXT NOT NULL
);

CREATE TABLE tutor_documents (
  id TEXT PRIMARY KEY NOT NULL,
  tutor_id TEXT NOT NULL REFERENCES tutor_profiles (user_id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('id_front', 'id_back', 'credential')),
  file_name TEXT NOT NULL CHECK (length(file_name) BETWEEN 1 AND 120),
  content_type TEXT NOT NULL
    CHECK (content_type IN ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')),
  size_bytes INTEGER NOT NULL CHECK (size_bytes BETWEEN 1 AND 1572864),
  data BLOB NOT NULL,
  created_at TEXT NOT NULL,
  -- Citizen-ID sides are photos; credentials may also be PDFs.
  CHECK (kind = 'credential' OR content_type <> 'application/pdf')
);
CREATE UNIQUE INDEX tutor_documents_id_side_uq ON tutor_documents (tutor_id, kind)
  WHERE kind <> 'credential';
CREATE INDEX tutor_documents_tutor_idx ON tutor_documents (tutor_id, created_at);

CREATE TRIGGER tutor_documents_credential_limit
BEFORE INSERT ON tutor_documents
WHEN NEW.kind = 'credential' AND (SELECT count(*) FROM tutor_documents
  WHERE tutor_id = NEW.tutor_id AND kind = 'credential') >= 10
BEGIN SELECT RAISE(ABORT, 'TUTOR_DOCUMENT_LIMIT'); END;
