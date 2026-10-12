-- Figma "Tạo yêu cầu tìm gia sư" fields. All columns are nullable or defaulted so
-- legacy requests remain valid; the Worker requires the student name on submit.
-- Education level and session count are request facts visible to the parent and moderator.
ALTER TABLE parent_requests ADD COLUMN education_level TEXT CHECK (
  education_level IS NULL OR
  education_level IN ('primary', 'lower_secondary', 'upper_secondary', 'university_prep')
);
ALTER TABLE parent_requests ADD COLUMN sessions_per_week INTEGER CHECK (
  sessions_per_week IS NULL OR sessions_per_week BETWEEN 1 AND 14
);
ALTER TABLE parent_requests ADD COLUMN tutor_requirements TEXT NOT NULL DEFAULT '' CHECK (
  length(tutor_requirements) <= 500
);
ALTER TABLE parent_requests ADD COLUMN student_traits TEXT NOT NULL DEFAULT '' CHECK (
  length(student_traits) <= 500
);

-- The student's name is personal data: it lives with the private contact row,
-- which account deletion already purges.
ALTER TABLE parent_request_private ADD COLUMN student_name TEXT CHECK (
  student_name IS NULL OR length(student_name) BETWEEN 1 AND 100
);

-- Existing rows get the level implied by their school grade.
UPDATE parent_requests SET education_level = CASE
  WHEN grade IN ('Lớp 1', 'Lớp 2', 'Lớp 3', 'Lớp 4', 'Lớp 5') THEN 'primary'
  WHEN grade IN ('Lớp 6', 'Lớp 7', 'Lớp 8', 'Lớp 9') THEN 'lower_secondary'
  WHEN grade IN ('Lớp 10', 'Lớp 11', 'Lớp 12') THEN 'upper_secondary'
  WHEN grade = 'Ôn thi đại học' THEN 'university_prep'
  ELSE NULL
END
WHERE education_level IS NULL
  AND NOT EXISTS (SELECT 1 FROM account_deletions WHERE user_id = parent_requests.parent_user_id);
