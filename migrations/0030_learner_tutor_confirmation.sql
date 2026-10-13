-- "Đã tìm được gia sư" vs "Đã xác nhận": a moderator assignment proposes a tutor; the learner
-- then confirms hiring that tutor. The confirmation is recorded once on the active assignment.
ALTER TABLE class_assignments ADD COLUMN learner_confirmed_at TEXT;
ALTER TABLE class_assignments ADD COLUMN learner_confirmed_by TEXT REFERENCES users (id) ON DELETE RESTRICT;

CREATE TRIGGER class_assignments_learner_confirmation BEFORE UPDATE OF
  learner_confirmed_at, learner_confirmed_by ON class_assignments
WHEN OLD.learner_confirmed_at IS NOT NULL
  OR NEW.learner_confirmed_at IS NULL OR NEW.learner_confirmed_by IS NULL
  OR NEW.status <> 'active'
  OR NOT EXISTS (
    SELECT 1 FROM class_listings c JOIN parent_requests r ON r.id = c.source_request_id
    WHERE c.id = NEW.class_id AND c.status = 'active' AND r.status = 'assigned'
      AND c.parent_user_id = NEW.learner_confirmed_by
  )
BEGIN SELECT RAISE(ABORT, 'LEARNER_CONFIRMATION_INVALID'); END;

-- Profile facts shown to the learner for a proposed tutor. All optional; existing profiles
-- keep working without them.
ALTER TABLE tutor_profiles ADD COLUMN tutor_type TEXT CHECK (
  tutor_type IS NULL OR tutor_type IN ('university_student', 'pedagogy_student', 'teacher')
);
ALTER TABLE tutor_profiles ADD COLUMN school TEXT CHECK (
  school IS NULL OR length(trim(school)) BETWEEN 1 AND 120
);
ALTER TABLE tutor_profiles ADD COLUMN specialization TEXT CHECK (
  specialization IS NULL OR length(trim(specialization)) BETWEEN 1 AND 160
);
ALTER TABLE tutor_profiles ADD COLUMN experience_years INTEGER CHECK (
  experience_years IS NULL OR experience_years BETWEEN 0 AND 60
);
ALTER TABLE tutor_profiles ADD COLUMN experience_summary TEXT CHECK (
  experience_summary IS NULL OR length(trim(experience_summary)) BETWEEN 1 AND 500
);
