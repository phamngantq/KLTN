-- Published prices are reference catalogues. They do not settle a class or charge a tutor.
-- A published revision is immutable; a newer retired revision hides the logical key.
CREATE TABLE tuition_price_versions (
  id TEXT PRIMARY KEY NOT NULL,
  subject_id TEXT NOT NULL REFERENCES subjects (id) ON DELETE RESTRICT,
  grade_label TEXT NOT NULL CHECK (length(grade_label) BETWEEN 1 AND 40),
  level TEXT NOT NULL CHECK (level IN ('basic', 'advanced', 'intensive')),
  mode TEXT NOT NULL CHECK (mode IN ('online', 'offline')),
  price_per_session_minor INTEGER NOT NULL CHECK (price_per_session_minor BETWEEN 1 AND 100000000),
  version INTEGER NOT NULL CHECK (version >= 1),
  edit_version INTEGER NOT NULL DEFAULT 1 CHECK (edit_version >= 1),
  status TEXT NOT NULL CHECK (status IN ('draft', 'published', 'retired')),
  approved_by TEXT REFERENCES users (id) ON DELETE RESTRICT,
  published_at TEXT,
  mutation_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK ((status = 'draft' AND approved_by IS NULL AND published_at IS NULL) OR
    (status IN ('published', 'retired') AND approved_by IS NOT NULL AND published_at IS NOT NULL))
);
CREATE UNIQUE INDEX tuition_price_versions_key_version_uq ON tuition_price_versions
  (subject_id, grade_label, level, mode, version);
CREATE INDEX tuition_price_versions_public_idx ON tuition_price_versions
  (status, subject_id, grade_label, level, mode, version DESC);
CREATE TRIGGER tuition_price_versions_insert_sequence BEFORE INSERT ON tuition_price_versions
WHEN NEW.status = 'published' OR NEW.version <> 1 + COALESCE((
  SELECT max(version) FROM tuition_price_versions WHERE subject_id = NEW.subject_id
    AND grade_label = NEW.grade_label AND level = NEW.level AND mode = NEW.mode
), 0) OR (NEW.status = 'draft' AND EXISTS (
  SELECT 1 FROM tuition_price_versions WHERE subject_id = NEW.subject_id
    AND grade_label = NEW.grade_label AND level = NEW.level AND mode = NEW.mode
    AND status = 'draft'
))
BEGIN SELECT RAISE(ABORT, 'TUITION_PRICE_SEQUENCE_INVALID'); END;
CREATE TRIGGER tuition_price_versions_key_immutable BEFORE UPDATE ON tuition_price_versions
WHEN NEW.subject_id <> OLD.subject_id OR NEW.grade_label <> OLD.grade_label
  OR NEW.level <> OLD.level OR NEW.mode <> OLD.mode OR NEW.version <> OLD.version
BEGIN SELECT RAISE(ABORT, 'TUITION_PRICE_KEY_IMMUTABLE'); END;
CREATE TRIGGER tuition_price_versions_immutable BEFORE UPDATE ON tuition_price_versions
WHEN OLD.status IN ('published', 'retired')
BEGIN SELECT RAISE(ABORT, 'PUBLISHED_TUITION_PRICE_IMMUTABLE'); END;
CREATE TRIGGER tuition_price_versions_no_delete BEFORE DELETE ON tuition_price_versions
WHEN OLD.status IN ('published', 'retired')
BEGIN SELECT RAISE(ABORT, 'PUBLISHED_TUITION_PRICE_IMMUTABLE'); END;
CREATE TRIGGER tuition_price_versions_valid_transition BEFORE UPDATE ON tuition_price_versions
WHEN OLD.status = 'draft' AND NEW.status NOT IN ('draft', 'published')
BEGIN SELECT RAISE(ABORT, 'TUITION_PRICE_TRANSITION_INVALID'); END;
CREATE TRIGGER tuition_price_versions_valid_approval BEFORE UPDATE ON tuition_price_versions
WHEN NEW.status = 'published' AND NOT EXISTS (
  SELECT 1 FROM users WHERE id = NEW.approved_by AND role = 'admin' AND status = 'active'
)
BEGIN SELECT RAISE(ABORT, 'TUITION_PRICE_APPROVER_INVALID'); END;
CREATE TRIGGER tuition_price_versions_valid_retirement BEFORE INSERT ON tuition_price_versions
WHEN NEW.status = 'retired' AND (
  NOT EXISTS (SELECT 1 FROM users WHERE id = NEW.approved_by AND role = 'admin' AND status = 'active')
  OR NOT EXISTS (
    SELECT 1 FROM tuition_price_versions old WHERE old.subject_id = NEW.subject_id
      AND old.grade_label = NEW.grade_label AND old.level = NEW.level AND old.mode = NEW.mode
      AND old.status = 'published' AND old.version = NEW.version - 1
  )
)
BEGIN SELECT RAISE(ABORT, 'TUITION_PRICE_RETIREMENT_INVALID'); END;

CREATE TABLE class_fee_guidance_versions (
  id TEXT PRIMARY KEY NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('online', 'offline')),
  min_fee_minor INTEGER NOT NULL CHECK (min_fee_minor BETWEEN 0 AND 100000000),
  max_fee_minor INTEGER NOT NULL CHECK (max_fee_minor BETWEEN 0 AND 100000000),
  description TEXT NOT NULL CHECK (length(description) BETWEEN 10 AND 500),
  version INTEGER NOT NULL CHECK (version >= 1),
  edit_version INTEGER NOT NULL DEFAULT 1 CHECK (edit_version >= 1),
  status TEXT NOT NULL CHECK (status IN ('draft', 'published', 'retired')),
  approved_by TEXT REFERENCES users (id) ON DELETE RESTRICT,
  published_at TEXT,
  mutation_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (min_fee_minor <= max_fee_minor),
  CHECK ((status = 'draft' AND approved_by IS NULL AND published_at IS NULL) OR
    (status IN ('published', 'retired') AND approved_by IS NOT NULL AND published_at IS NOT NULL))
);
CREATE UNIQUE INDEX class_fee_guidance_versions_key_version_uq ON class_fee_guidance_versions
  (mode, version);
CREATE INDEX class_fee_guidance_versions_public_idx ON class_fee_guidance_versions
  (status, mode, version DESC);
CREATE TRIGGER class_fee_guidance_versions_insert_sequence BEFORE INSERT ON class_fee_guidance_versions
WHEN NEW.status = 'published' OR NEW.version <> 1 + COALESCE((
  SELECT max(version) FROM class_fee_guidance_versions WHERE mode = NEW.mode
), 0) OR (NEW.status = 'draft' AND EXISTS (
  SELECT 1 FROM class_fee_guidance_versions WHERE mode = NEW.mode AND status = 'draft'
))
BEGIN SELECT RAISE(ABORT, 'CLASS_FEE_GUIDANCE_SEQUENCE_INVALID'); END;
CREATE TRIGGER class_fee_guidance_versions_key_immutable BEFORE UPDATE ON class_fee_guidance_versions
WHEN NEW.mode <> OLD.mode OR NEW.version <> OLD.version
BEGIN SELECT RAISE(ABORT, 'CLASS_FEE_GUIDANCE_KEY_IMMUTABLE'); END;
CREATE TRIGGER class_fee_guidance_versions_immutable BEFORE UPDATE ON class_fee_guidance_versions
WHEN OLD.status IN ('published', 'retired')
BEGIN SELECT RAISE(ABORT, 'PUBLISHED_CLASS_FEE_GUIDANCE_IMMUTABLE'); END;
CREATE TRIGGER class_fee_guidance_versions_no_delete BEFORE DELETE ON class_fee_guidance_versions
WHEN OLD.status IN ('published', 'retired')
BEGIN SELECT RAISE(ABORT, 'PUBLISHED_CLASS_FEE_GUIDANCE_IMMUTABLE'); END;
CREATE TRIGGER class_fee_guidance_versions_valid_transition BEFORE UPDATE ON class_fee_guidance_versions
WHEN OLD.status = 'draft' AND NEW.status NOT IN ('draft', 'published')
BEGIN SELECT RAISE(ABORT, 'CLASS_FEE_GUIDANCE_TRANSITION_INVALID'); END;
CREATE TRIGGER class_fee_guidance_versions_valid_approval BEFORE UPDATE ON class_fee_guidance_versions
WHEN NEW.status = 'published' AND NOT EXISTS (
  SELECT 1 FROM users WHERE id = NEW.approved_by AND role = 'admin' AND status = 'active'
)
BEGIN SELECT RAISE(ABORT, 'CLASS_FEE_GUIDANCE_APPROVER_INVALID'); END;
CREATE TRIGGER class_fee_guidance_versions_valid_retirement BEFORE INSERT ON class_fee_guidance_versions
WHEN NEW.status = 'retired' AND (
  NOT EXISTS (SELECT 1 FROM users WHERE id = NEW.approved_by AND role = 'admin' AND status = 'active')
  OR NOT EXISTS (
    SELECT 1 FROM class_fee_guidance_versions old WHERE old.mode = NEW.mode
      AND old.status = 'published' AND old.version = NEW.version - 1
  )
)
BEGIN SELECT RAISE(ABORT, 'CLASS_FEE_GUIDANCE_RETIREMENT_INVALID'); END;
