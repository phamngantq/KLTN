-- Learner contact for an assigned tutor opens only after, in order: the learner confirms the
-- hire (0030), the tutor acknowledges the class contract, and a moderator records that the
-- placement fee ("phí môi giới") was received. No payment gateway: the record is the
-- moderator's attestation of an offline payment, made once.
ALTER TABLE class_assignments ADD COLUMN placement_fee_paid_at TEXT;
ALTER TABLE class_assignments ADD COLUMN placement_fee_amount_minor INTEGER CHECK (
  placement_fee_amount_minor IS NULL OR placement_fee_amount_minor BETWEEN 0 AND 100000000
);
ALTER TABLE class_assignments ADD COLUMN placement_fee_recorded_by TEXT
  REFERENCES users (id) ON DELETE RESTRICT;

CREATE TRIGGER class_assignments_placement_fee BEFORE UPDATE OF
  placement_fee_paid_at, placement_fee_amount_minor, placement_fee_recorded_by ON class_assignments
WHEN OLD.placement_fee_paid_at IS NOT NULL
  OR NEW.placement_fee_paid_at IS NULL OR NEW.placement_fee_amount_minor IS NULL
  OR NEW.status <> 'active' OR NEW.learner_confirmed_at IS NULL
  OR NOT EXISTS (SELECT 1 FROM users WHERE id = NEW.placement_fee_recorded_by
                 AND role = 'admin' AND status = 'active')
  OR NOT EXISTS (SELECT 1 FROM class_contract_records r
                 WHERE r.assignment_id = NEW.id AND r.status = 'acknowledged')
BEGIN SELECT RAISE(ABORT, 'PLACEMENT_FEE_INVALID'); END;

-- One profile photo per user (tutor avatars today), stored in D1 like complaint evidence.
CREATE TABLE profile_photos (
  user_id TEXT PRIMARY KEY NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  content_type TEXT NOT NULL CHECK (content_type IN ('image/jpeg', 'image/png', 'image/webp')),
  size_bytes INTEGER NOT NULL CHECK (size_bytes BETWEEN 1 AND 1048576),
  data BLOB NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (length(data) = size_bytes)
);
