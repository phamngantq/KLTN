-- Reference tuition ranges per session shown on the learner "Bảng giá" page, by tutor type
-- (sinh viên, sinh viên sư phạm, giáo viên) and by subject, per school stage. They are
-- guidance only: they do not settle a class price or create a charge. Rows are seeded
-- by the sample scripts, never by this migration.
CREATE TABLE learner_price_guides (
  id TEXT PRIMARY KEY NOT NULL,
  dimension TEXT NOT NULL CHECK (dimension IN ('tutor_type', 'subject')),
  tutor_type TEXT CHECK (
    tutor_type IS NULL OR tutor_type IN ('university_student', 'pedagogy_student', 'teacher')
  ),
  subject_id TEXT REFERENCES subjects (id) ON DELETE RESTRICT,
  education_level TEXT NOT NULL
    CHECK (education_level IN ('primary', 'lower_secondary', 'upper_secondary', 'university_prep')),
  min_price_minor INTEGER NOT NULL CHECK (min_price_minor BETWEEN 1 AND 100000000),
  max_price_minor INTEGER NOT NULL CHECK (max_price_minor BETWEEN 1 AND 100000000),
  status TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('draft', 'published')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (min_price_minor <= max_price_minor),
  CHECK ((dimension = 'tutor_type' AND tutor_type IS NOT NULL AND subject_id IS NULL)
    OR (dimension = 'subject' AND subject_id IS NOT NULL AND tutor_type IS NULL))
);
CREATE UNIQUE INDEX learner_price_guides_key_uq ON learner_price_guides
  (dimension, COALESCE(tutor_type, ''), COALESCE(subject_id, ''), education_level);
CREATE INDEX learner_price_guides_public_idx ON learner_price_guides (status, dimension);
