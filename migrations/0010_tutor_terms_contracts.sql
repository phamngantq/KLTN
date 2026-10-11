-- Terms/quiz policy is published by a moderator. No quiz answers or legal copy are seeded.
CREATE TABLE terms_quizzes (
  id TEXT PRIMARY KEY NOT NULL,
  terms_content_revision_id TEXT NOT NULL UNIQUE REFERENCES content_revisions (id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  edit_version INTEGER NOT NULL DEFAULT 1 CHECK (edit_version >= 1),
  questions_json TEXT NOT NULL CHECK (json_valid(questions_json)),
  minimum_correct INTEGER NOT NULL CHECK (minimum_correct BETWEEN 1 AND 20),
  mutation_id TEXT NOT NULL,
  created_by TEXT NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  published_by TEXT REFERENCES users (id) ON DELETE RESTRICT,
  published_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK ((status = 'draft' AND published_by IS NULL AND published_at IS NULL)
    OR (status = 'published' AND published_by IS NOT NULL AND published_at IS NOT NULL))
);
CREATE INDEX terms_quizzes_status_idx ON terms_quizzes (status, published_at DESC);

CREATE TRIGGER terms_quizzes_immutable_published BEFORE UPDATE ON terms_quizzes
WHEN OLD.status = 'published'
BEGIN SELECT RAISE(ABORT, 'published quiz is immutable'); END;
CREATE TRIGGER terms_quizzes_no_delete BEFORE DELETE ON terms_quizzes
BEGIN SELECT RAISE(ABORT, 'quiz history cannot be deleted'); END;
CREATE TRIGGER terms_quizzes_valid_publish BEFORE UPDATE OF status ON terms_quizzes
WHEN NEW.status = 'published' AND NOT EXISTS (
  SELECT 1 FROM content_revisions c JOIN users moderator ON moderator.id = NEW.published_by
  WHERE c.id = NEW.terms_content_revision_id AND c.kind = 'terms'
    AND c.slug = 'tutor-responsibility' AND c.audience = 'tutor'
    AND c.status = 'published' AND moderator.role = 'admin' AND moderator.status = 'active'
)
BEGIN SELECT RAISE(ABORT, 'TERMS_QUIZ_NOT_READY'); END;

CREATE TABLE terms_quiz_attempts (
  id TEXT PRIMARY KEY NOT NULL,
  tutor_user_id TEXT NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  quiz_id TEXT NOT NULL REFERENCES terms_quizzes (id) ON DELETE RESTRICT,
  answers_json TEXT NOT NULL CHECK (json_valid(answers_json)),
  correct_count INTEGER NOT NULL CHECK (correct_count BETWEEN 0 AND 20),
  passed INTEGER NOT NULL CHECK (passed IN (0, 1)),
  created_at TEXT NOT NULL
);
CREATE INDEX terms_quiz_attempts_tutor_quiz_idx
  ON terms_quiz_attempts (tutor_user_id, quiz_id, created_at DESC);
CREATE TRIGGER terms_quiz_attempts_no_update BEFORE UPDATE ON terms_quiz_attempts
BEGIN SELECT RAISE(ABORT, 'quiz attempt is immutable'); END;
CREATE TRIGGER terms_quiz_attempts_no_delete BEFORE DELETE ON terms_quiz_attempts
BEGIN SELECT RAISE(ABORT, 'quiz attempt history cannot be deleted'); END;
CREATE TRIGGER terms_quiz_attempts_valid_insert BEFORE INSERT ON terms_quiz_attempts
WHEN NOT EXISTS (
  SELECT 1 FROM terms_quizzes q JOIN content_revisions c ON c.id = q.terms_content_revision_id
  JOIN users u ON u.id = NEW.tutor_user_id
  WHERE q.id = NEW.quiz_id AND q.status = 'published'
    AND c.status = 'published' AND c.kind = 'terms'
    AND c.slug = 'tutor-responsibility' AND c.audience = 'tutor'
    AND u.role = 'tutor' AND u.status = 'active'
)
BEGIN SELECT RAISE(ABORT, 'TERMS_QUIZ_NOT_CURRENT'); END;
CREATE TRIGGER terms_quiz_attempts_valid_grade BEFORE INSERT ON terms_quiz_attempts
WHEN NOT EXISTS (
  SELECT 1 FROM terms_quizzes q WHERE q.id = NEW.quiz_id
    AND json_type(NEW.answers_json) = 'array'
    AND json_array_length(NEW.answers_json) = json_array_length(q.questions_json)
    AND (SELECT count(DISTINCT json_extract(value, '$.questionId'))
         FROM json_each(NEW.answers_json)) = json_array_length(q.questions_json)
    AND (SELECT count(*) FROM json_each(NEW.answers_json) answer
         JOIN json_each(q.questions_json) question
           ON json_extract(answer.value, '$.questionId') = json_extract(question.value, '$.id')
         JOIN json_each(json_extract(question.value, '$.choices')) choice
           ON json_extract(answer.value, '$.choiceId') = json_extract(choice.value, '$.id'))
        = json_array_length(q.questions_json)
    AND NEW.correct_count = (SELECT count(*) FROM json_each(NEW.answers_json) answer
         JOIN json_each(q.questions_json) question
           ON json_extract(answer.value, '$.questionId') = json_extract(question.value, '$.id')
         WHERE json_extract(answer.value, '$.choiceId') =
           json_extract(question.value, '$.correctChoiceId'))
    AND NEW.passed = CASE WHEN NEW.correct_count >= q.minimum_correct THEN 1 ELSE 0 END
)
BEGIN SELECT RAISE(ABORT, 'TERMS_GRADE_INVALID'); END;
CREATE TRIGGER terms_quiz_attempts_quota BEFORE INSERT ON terms_quiz_attempts
WHEN (SELECT count(*) FROM terms_quiz_attempts
      WHERE tutor_user_id = NEW.tutor_user_id AND quiz_id = NEW.quiz_id
        AND created_at >= strftime('%Y-%m-%dT%H:%M:%fZ', NEW.created_at, '-1 day')) >= 5
BEGIN SELECT RAISE(ABORT, 'TERMS_ATTEMPT_LIMIT'); END;

CREATE TABLE terms_acknowledgements (
  tutor_user_id TEXT NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  quiz_id TEXT NOT NULL REFERENCES terms_quizzes (id) ON DELETE RESTRICT,
  attempt_id TEXT NOT NULL UNIQUE REFERENCES terms_quiz_attempts (id) ON DELETE RESTRICT,
  terms_content_revision_id TEXT NOT NULL REFERENCES content_revisions (id) ON DELETE RESTRICT,
  acknowledged_at TEXT NOT NULL,
  PRIMARY KEY (tutor_user_id, quiz_id)
);
CREATE TRIGGER terms_acknowledgements_no_update BEFORE UPDATE ON terms_acknowledgements
BEGIN SELECT RAISE(ABORT, 'terms acknowledgement is immutable'); END;
CREATE TRIGGER terms_acknowledgements_no_delete BEFORE DELETE ON terms_acknowledgements
BEGIN SELECT RAISE(ABORT, 'terms acknowledgement history cannot be deleted'); END;
CREATE TRIGGER terms_acknowledgements_valid_insert BEFORE INSERT ON terms_acknowledgements
WHEN NOT EXISTS (
  SELECT 1 FROM terms_quiz_attempts a
  JOIN terms_quizzes q ON q.id = a.quiz_id
  JOIN content_revisions c ON c.id = q.terms_content_revision_id
  WHERE a.id = NEW.attempt_id AND a.tutor_user_id = NEW.tutor_user_id
    AND a.quiz_id = NEW.quiz_id AND a.passed = 1
    AND q.status = 'published' AND q.terms_content_revision_id = NEW.terms_content_revision_id
    AND c.status = 'published' AND c.kind = 'terms'
    AND c.slug = 'tutor-responsibility' AND c.audience = 'tutor'
)
BEGIN SELECT RAISE(ABORT, 'TERMS_ACK_NOT_ELIGIBLE'); END;

-- This additional trigger closes races and direct D1 writes around the application gate.
CREATE TRIGGER tutor_applications_terms_fee_gate BEFORE INSERT ON tutor_applications
WHEN NOT EXISTS (
  SELECT 1 FROM terms_acknowledgements a
  JOIN terms_quizzes q ON q.id = a.quiz_id
  JOIN content_revisions c ON c.id = a.terms_content_revision_id
  JOIN terms_quiz_attempts t ON t.id = a.attempt_id
  WHERE a.tutor_user_id = NEW.tutor_user_id AND a.acknowledged_at <= NEW.created_at
    AND q.status = 'published' AND q.id = a.quiz_id
    AND q.terms_content_revision_id = c.id AND q.published_at <= NEW.created_at
    AND c.kind = 'terms' AND c.slug = 'tutor-responsibility'
    AND c.audience = 'tutor' AND c.status = 'published' AND c.published_at <= NEW.created_at
    AND t.passed = 1 AND t.tutor_user_id = NEW.tutor_user_id AND t.quiz_id = q.id
) OR (
  SELECT count(DISTINCT f.option_key) FROM fee_option_versions f
  JOIN class_listings c ON c.id = NEW.class_id
  WHERE f.status = 'published' AND f.published_at <= NEW.created_at
    AND (f.effective_from IS NULL OR f.effective_from <= NEW.created_at)
    AND (f.effective_to IS NULL OR NEW.created_at < f.effective_to)
    AND (f.scope_subject_id IS NULL OR f.scope_subject_id = c.subject_id)
    AND (f.scope_mode IS NULL OR f.scope_mode = c.mode)
) <> 3
BEGIN SELECT RAISE(ABORT, 'APPLICATION_POLICY_NOT_READY'); END;

-- A contract record is an acknowledgement record, not a payment or electronic signature.
CREATE TABLE class_contract_records (
  id TEXT PRIMARY KEY NOT NULL,
  assignment_id TEXT NOT NULL UNIQUE REFERENCES class_assignments (id) ON DELETE RESTRICT,
  class_id TEXT NOT NULL REFERENCES class_listings (id) ON DELETE RESTRICT,
  tutor_user_id TEXT NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  fee_option_version_id TEXT NOT NULL REFERENCES fee_option_versions (id) ON DELETE RESTRICT,
  contract_content_revision_id TEXT NOT NULL REFERENCES content_revisions (id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'issued' CHECK (status IN ('issued', 'acknowledged')),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  issued_by TEXT NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  issued_at TEXT NOT NULL,
  acknowledged_at TEXT,
  mutation_id TEXT NOT NULL,
  CHECK ((status = 'issued' AND acknowledged_at IS NULL)
    OR (status = 'acknowledged' AND acknowledged_at IS NOT NULL))
);
CREATE INDEX class_contract_records_tutor_idx
  ON class_contract_records (tutor_user_id, issued_at DESC);
CREATE TRIGGER class_contract_records_no_delete BEFORE DELETE ON class_contract_records
BEGIN SELECT RAISE(ABORT, 'contract history cannot be deleted'); END;
CREATE TRIGGER class_contract_records_valid_insert BEFORE INSERT ON class_contract_records
WHEN NOT EXISTS (
  SELECT 1 FROM class_assignments a
  JOIN tutor_applications t ON t.id = a.application_id
  JOIN content_revisions c ON c.id = NEW.contract_content_revision_id
  JOIN users moderator ON moderator.id = NEW.issued_by
  WHERE a.id = NEW.assignment_id AND a.status = 'active'
    AND a.class_id = NEW.class_id AND a.tutor_user_id = NEW.tutor_user_id
    AND t.fee_option_version_id = NEW.fee_option_version_id
    AND c.kind = 'contract' AND c.slug = 'tutor-class-contract'
    AND c.audience = 'tutor' AND c.status = 'published'
    AND moderator.role = 'admin' AND moderator.status = 'active'
)
BEGIN SELECT RAISE(ABORT, 'CONTRACT_NOT_ELIGIBLE'); END;
CREATE TRIGGER class_contract_records_no_core_update BEFORE UPDATE OF
  assignment_id, class_id, tutor_user_id, fee_option_version_id,
  contract_content_revision_id, issued_by, issued_at
ON class_contract_records
BEGIN SELECT RAISE(ABORT, 'contract snapshot is immutable'); END;
CREATE TRIGGER class_contract_records_valid_ack BEFORE UPDATE OF status ON class_contract_records
WHEN NEW.status <> 'acknowledged' OR OLD.status <> 'issued'
BEGIN SELECT RAISE(ABORT, 'contract status transition is invalid'); END;
