-- Preserve users.id and the existing student/tutor/admin role constraint. A student is
-- presented as a parent by the authenticated product API; legacy bookings remain linked.
-- The phone is private account contact data, never a public class-listing field.
CREATE TABLE parent_profiles (
  user_id TEXT PRIMARY KEY NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  phone TEXT CHECK (
    phone IS NULL OR
    (length(phone) BETWEEN 8 AND 16 AND phone NOT GLOB '*[^0-9+]*')
  ),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Class preferences extend the existing tutor profile. Subjects, teaching mode and weekly
-- availability already have dedicated tables/columns; no duplicate matching state is added.
ALTER TABLE tutor_profiles ADD COLUMN negotiable_time INTEGER NOT NULL DEFAULT 0
  CHECK (negotiable_time IN (0, 1));
CREATE TABLE tutor_preference_grades (
  tutor_id TEXT NOT NULL REFERENCES tutor_profiles (user_id) ON DELETE CASCADE,
  grade TEXT NOT NULL CHECK (length(grade) BETWEEN 1 AND 40),
  PRIMARY KEY (tutor_id, grade)
) WITHOUT ROWID;
CREATE TABLE tutor_preference_areas (
  tutor_id TEXT NOT NULL REFERENCES tutor_profiles (user_id) ON DELETE CASCADE,
  area TEXT NOT NULL CHECK (length(area) BETWEEN 1 AND 80),
  PRIMARY KEY (tutor_id, area)
) WITHOUT ROWID;
