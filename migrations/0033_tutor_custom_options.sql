-- "Đăng ký lớp học phù hợp": options a tutor adds to the subject, grade, mode and area
-- groups ("+ Thêm lựa chọn"). Subject/mode selections live in `selected`; grade/area
-- selections stay in tutor_preference_grades/areas, which matching already reads.
CREATE TABLE tutor_custom_options (
  tutor_id TEXT NOT NULL REFERENCES tutor_profiles (user_id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('subject', 'grade', 'mode', 'area')),
  label_key TEXT NOT NULL CHECK (length(label_key) BETWEEN 1 AND 80),
  label TEXT NOT NULL CHECK (length(label) BETWEEN 1 AND 80),
  selected INTEGER NOT NULL DEFAULT 0 CHECK (selected IN (0, 1)),
  position INTEGER NOT NULL CHECK (position BETWEEN 0 AND 19),
  PRIMARY KEY (tutor_id, kind, label_key)
) WITHOUT ROWID;

CREATE TRIGGER tutor_custom_options_limit_insert
BEFORE INSERT ON tutor_custom_options
WHEN (SELECT count(*) FROM tutor_custom_options
  WHERE tutor_id = NEW.tutor_id AND kind = NEW.kind) >= 20
BEGIN SELECT RAISE(ABORT, 'PROFILE_PREFERENCE_LIMIT'); END;

-- Grades: 15 system options plus 20 custom ones. Areas: provinces plus specific places.
DROP TRIGGER tutor_preference_grades_limit_insert;
CREATE TRIGGER tutor_preference_grades_limit_insert
BEFORE INSERT ON tutor_preference_grades
WHEN (SELECT count(*) FROM tutor_preference_grades WHERE tutor_id = NEW.tutor_id) >= 35
BEGIN SELECT RAISE(ABORT, 'PROFILE_PREFERENCE_LIMIT'); END;

DROP TRIGGER tutor_preference_areas_limit_insert;
CREATE TRIGGER tutor_preference_areas_limit_insert
BEFORE INSERT ON tutor_preference_areas
WHEN (SELECT count(*) FROM tutor_preference_areas WHERE tutor_id = NEW.tutor_id) >= 40
BEGIN SELECT RAISE(ABORT, 'PROFILE_PREFERENCE_LIMIT'); END;
