-- "Hợp đồng đã ký": the tutor signs the contract on paper at the centre (Điều 1.1: once, for
-- every class); a moderator uploads the scan. One file per tutor, replaced on re-upload.
CREATE TABLE tutor_signed_contracts (
  tutor_id TEXT PRIMARY KEY NOT NULL REFERENCES tutor_profiles (user_id) ON DELETE CASCADE,
  contract_number TEXT CHECK (
    contract_number IS NULL OR length(trim(contract_number)) BETWEEN 1 AND 40
  ),
  signed_on TEXT NOT NULL CHECK (length(signed_on) = 10),
  file_name TEXT NOT NULL CHECK (length(file_name) BETWEEN 1 AND 120),
  content_type TEXT NOT NULL
    CHECK (content_type IN ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')),
  size_bytes INTEGER NOT NULL CHECK (size_bytes BETWEEN 1 AND 1572864),
  data BLOB NOT NULL,
  uploaded_by TEXT NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  uploaded_at TEXT NOT NULL
);

-- Only an active moderator stores or replaces the scan.
CREATE TRIGGER tutor_signed_contracts_moderator_insert BEFORE INSERT ON tutor_signed_contracts
WHEN NOT EXISTS (SELECT 1 FROM users WHERE id = NEW.uploaded_by AND role = 'admin' AND status = 'active')
BEGIN SELECT RAISE(ABORT, 'SIGNED_CONTRACT_UPLOADER_INVALID'); END;
CREATE TRIGGER tutor_signed_contracts_moderator_update BEFORE UPDATE ON tutor_signed_contracts
WHEN NOT EXISTS (SELECT 1 FROM users WHERE id = NEW.uploaded_by AND role = 'admin' AND status = 'active')
BEGIN SELECT RAISE(ABORT, 'SIGNED_CONTRACT_UPLOADER_INVALID'); END;
