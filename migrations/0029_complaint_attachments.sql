-- Evidence ("đính kèm minh chứng") for complaints, stored in D1 so no extra storage service is
-- needed. Files are attached while the complaint is an unsent draft and become read-only once
-- sent. The Worker checks file signatures; D1 bounds type, size and count.
CREATE TABLE complaint_attachments (
  id TEXT PRIMARY KEY NOT NULL,
  complaint_id TEXT NOT NULL REFERENCES complaints (id) ON DELETE CASCADE,
  file_name TEXT NOT NULL CHECK (length(file_name) BETWEEN 1 AND 120),
  content_type TEXT NOT NULL
    CHECK (content_type IN ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')),
  size_bytes INTEGER NOT NULL CHECK (size_bytes BETWEEN 1 AND 1572864),
  data BLOB NOT NULL,
  created_at TEXT NOT NULL,
  CHECK (length(data) = size_bytes)
);
CREATE INDEX complaint_attachments_complaint_idx ON complaint_attachments (complaint_id, created_at);

CREATE TRIGGER complaint_attachments_draft_only BEFORE INSERT ON complaint_attachments
WHEN NOT EXISTS (SELECT 1 FROM complaints WHERE id = NEW.complaint_id AND status = 'draft')
  OR (SELECT count(*) FROM complaint_attachments WHERE complaint_id = NEW.complaint_id) >= 3
BEGIN SELECT RAISE(ABORT, 'COMPLAINT_ATTACHMENT_INVALID'); END;
CREATE TRIGGER complaint_attachments_immutable BEFORE UPDATE ON complaint_attachments
BEGIN SELECT RAISE(ABORT, 'COMPLAINT_ATTACHMENT_IMMUTABLE'); END;
