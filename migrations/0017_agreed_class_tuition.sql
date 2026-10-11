-- Agreed tuition is a per-assignment snapshot. A reopened class can receive a
-- different tutor and amount without rewriting its earlier agreement. Existing
-- assignments/contracts have no verified amount and deliberately remain NULL.
ALTER TABLE class_assignments ADD COLUMN agreed_tuition_per_session_minor INTEGER
  CHECK (agreed_tuition_per_session_minor IS NULL OR agreed_tuition_per_session_minor BETWEEN 1 AND 100000000);
ALTER TABLE class_assignments ADD COLUMN tuition_recorded_by TEXT
  REFERENCES users (id) ON DELETE RESTRICT;
ALTER TABLE class_assignments ADD COLUMN tuition_recorded_at TEXT;

-- Every new assignment must carry the moderator-recorded, attested tuition in
-- the same D1 batch that activates the class and parent request.
CREATE TRIGGER class_assignments_tuition_required BEFORE INSERT ON class_assignments
WHEN NEW.agreed_tuition_per_session_minor IS NULL
  OR NEW.tuition_recorded_by IS NULL OR NEW.tuition_recorded_at IS NULL
  OR NEW.tuition_recorded_by <> NEW.assigned_by
  OR NEW.tuition_recorded_at <> NEW.assigned_at
BEGIN SELECT RAISE(ABORT, 'ASSIGNMENT_TUITION_REQUIRED'); END;

-- Legacy active assignments may receive one verified amount before a contract
-- is issued. All later updates, including edits to the moderator/time, fail.
CREATE TRIGGER class_assignments_tuition_immutable BEFORE UPDATE OF
  agreed_tuition_per_session_minor, tuition_recorded_by, tuition_recorded_at
ON class_assignments WHEN OLD.agreed_tuition_per_session_minor IS NOT NULL
BEGIN SELECT RAISE(ABORT, 'ASSIGNMENT_TUITION_IMMUTABLE'); END;
CREATE TRIGGER class_assignments_tuition_backfill_guard BEFORE UPDATE OF
  agreed_tuition_per_session_minor, tuition_recorded_by, tuition_recorded_at
ON class_assignments
WHEN OLD.agreed_tuition_per_session_minor IS NULL AND (
  NEW.agreed_tuition_per_session_minor IS NULL
  OR NEW.tuition_recorded_by IS NULL OR NEW.tuition_recorded_at IS NULL
  OR NEW.status <> 'active' OR OLD.status <> 'active'
  OR NEW.version <> OLD.version + 1 OR NEW.mutation_id IS OLD.mutation_id
  OR NOT EXISTS (SELECT 1 FROM class_listings c
    WHERE c.id = OLD.class_id AND c.status = 'active')
  OR NOT EXISTS (SELECT 1 FROM users moderator
    WHERE moderator.id = NEW.tuition_recorded_by
      AND moderator.role = 'admin' AND moderator.status = 'active')
  OR EXISTS (SELECT 1 FROM class_contract_records contract
    WHERE contract.assignment_id = OLD.id)
)
BEGIN SELECT RAISE(ABORT, 'ASSIGNMENT_TUITION_BACKFILL_INVALID'); END;

-- A contract copies the immutable amount of its assignment. Old contracts
-- retain NULL because their original amount cannot be reconstructed safely.
ALTER TABLE class_contract_records ADD COLUMN agreed_tuition_per_session_minor INTEGER
  CHECK (agreed_tuition_per_session_minor IS NULL OR agreed_tuition_per_session_minor BETWEEN 1 AND 100000000);
CREATE TRIGGER class_contract_records_tuition_required BEFORE INSERT ON class_contract_records
WHEN NEW.agreed_tuition_per_session_minor IS NULL OR NOT EXISTS (
  SELECT 1 FROM class_assignments a WHERE a.id = NEW.assignment_id
    AND a.agreed_tuition_per_session_minor = NEW.agreed_tuition_per_session_minor
)
BEGIN SELECT RAISE(ABORT, 'CONTRACT_TUITION_INVALID'); END;
CREATE TRIGGER class_contract_records_tuition_immutable BEFORE UPDATE OF
  agreed_tuition_per_session_minor ON class_contract_records
BEGIN SELECT RAISE(ABORT, 'CONTRACT_TUITION_IMMUTABLE'); END;
