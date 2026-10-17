-- Tutor class acceptance, second revision:
-- 1. "Điều khoản trách nhiệm" again requires passing the published quiz before the first
--    acceptance (a quiz acknowledgement); a checkbox acceptance alone no longer opens it.
--    terms_consents rows from 0035 are kept as history.
-- 2. The tutor's free time for a class is the weekly matrix, stored as JSON windows
--    [{weekday, startLocal, endLocal}]. Applications from 0035 keep their day/range columns.

ALTER TABLE tutor_applications ADD COLUMN availability_json TEXT
  CHECK (availability_json IS NULL OR (json_valid(availability_json)
    AND json_type(availability_json) = 'array' AND json_array_length(availability_json) BETWEEN 1 AND 49));

DROP TRIGGER tutor_applications_terms_fee_gate;
CREATE TRIGGER tutor_applications_terms_fee_gate BEFORE INSERT ON tutor_applications
WHEN NOT EXISTS (
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
) OR NOT EXISTS (
  SELECT 1 FROM fee_option_versions f
  WHERE f.id = NEW.fee_option_version_id AND f.option_key = 'monthly_percent'
)
BEGIN SELECT RAISE(ABORT, 'APPLICATION_POLICY_NOT_READY'); END;
