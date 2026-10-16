-- Tutor class acceptance ("Nhận lớp"):
-- 1. "Điều khoản trách nhiệm" is accepted with one checkbox per published terms revision; a
--    passed quiz acknowledgement from before stays valid.
-- 2. The placement fee is the published "monthly_percent" option (40% of one month's tuition).
-- 3. Each application carries the tutor's free time for that class (days + one time range).

CREATE TABLE terms_consents (
  tutor_user_id TEXT NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  terms_content_revision_id TEXT NOT NULL REFERENCES content_revisions (id) ON DELETE RESTRICT,
  accepted_at TEXT NOT NULL,
  PRIMARY KEY (tutor_user_id, terms_content_revision_id)
) WITHOUT ROWID;
CREATE TRIGGER terms_consents_no_update BEFORE UPDATE ON terms_consents
BEGIN SELECT RAISE(ABORT, 'terms consent is immutable'); END;
CREATE TRIGGER terms_consents_no_delete BEFORE DELETE ON terms_consents
BEGIN SELECT RAISE(ABORT, 'terms consent history cannot be deleted'); END;
CREATE TRIGGER terms_consents_valid_insert BEFORE INSERT ON terms_consents
WHEN NOT EXISTS (
  SELECT 1 FROM content_revisions c JOIN users u ON u.id = NEW.tutor_user_id
  WHERE c.id = NEW.terms_content_revision_id AND c.status = 'published' AND c.kind = 'terms'
    AND c.slug = 'tutor-responsibility' AND c.audience = 'tutor'
    AND u.role = 'tutor' AND u.status = 'active'
)
BEGIN SELECT RAISE(ABORT, 'TERMS_CONSENT_NOT_ELIGIBLE'); END;

ALTER TABLE tutor_applications ADD COLUMN available_weekdays TEXT
  CHECK (available_weekdays IS NULL OR (length(available_weekdays) BETWEEN 1 AND 13
    AND available_weekdays NOT GLOB '*[^1-7,]*'));
ALTER TABLE tutor_applications ADD COLUMN available_start TEXT
  CHECK (available_start IS NULL OR available_start GLOB '[0-2][0-9]:[0-5][0-9]');
ALTER TABLE tutor_applications ADD COLUMN available_end TEXT
  CHECK (available_end IS NULL OR available_end GLOB '[0-2][0-9]:[0-5][0-9]');

-- Replaces the 0010 gate: terms accepted (checkbox or earlier quiz) and the fee option is
-- the monthly-percent policy. The 0007 trigger still checks that option is the current one.
DROP TRIGGER tutor_applications_terms_fee_gate;
CREATE TRIGGER tutor_applications_terms_fee_gate BEFORE INSERT ON tutor_applications
WHEN NOT (
  EXISTS (
    SELECT 1 FROM terms_consents a
    JOIN content_revisions c ON c.id = a.terms_content_revision_id
    WHERE a.tutor_user_id = NEW.tutor_user_id AND a.accepted_at <= NEW.created_at
      AND c.kind = 'terms' AND c.slug = 'tutor-responsibility' AND c.audience = 'tutor'
      AND c.status = 'published' AND c.published_at <= NEW.created_at
  ) OR EXISTS (
    SELECT 1 FROM terms_acknowledgements a
    JOIN terms_quizzes q ON q.id = a.quiz_id
    JOIN content_revisions c ON c.id = a.terms_content_revision_id
    JOIN terms_quiz_attempts t ON t.id = a.attempt_id
    WHERE a.tutor_user_id = NEW.tutor_user_id AND a.acknowledged_at <= NEW.created_at
      AND q.status = 'published' AND q.terms_content_revision_id = c.id
      AND q.published_at <= NEW.created_at
      AND c.kind = 'terms' AND c.slug = 'tutor-responsibility'
      AND c.audience = 'tutor' AND c.status = 'published' AND c.published_at <= NEW.created_at
      AND t.passed = 1 AND t.tutor_user_id = NEW.tutor_user_id AND t.quiz_id = q.id
  )
) OR NOT EXISTS (
  SELECT 1 FROM fee_option_versions f
  WHERE f.id = NEW.fee_option_version_id AND f.option_key = 'monthly_percent'
)
BEGIN SELECT RAISE(ABORT, 'APPLICATION_POLICY_NOT_READY'); END;
