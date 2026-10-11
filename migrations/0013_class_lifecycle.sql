-- A tutor may apply again after a previous assignment was revoked. Historical
-- selected applications and their immutable fee choices remain intact.
DROP INDEX tutor_applications_live_uq;
CREATE UNIQUE INDEX tutor_applications_live_uq ON tutor_applications (class_id, tutor_user_id)
  WHERE status = 'submitted';

-- A terminal action is recorded only after its class, source request and
-- assignment have all moved in the same D1 batch with one mutation ID.
CREATE TABLE class_lifecycle_events (
  id TEXT PRIMARY KEY NOT NULL,
  class_id TEXT NOT NULL REFERENCES class_listings (id) ON DELETE RESTRICT,
  assignment_id TEXT NOT NULL REFERENCES class_assignments (id) ON DELETE RESTRICT,
  event_type TEXT NOT NULL CHECK (event_type IN ('revoked', 'completed')),
  actor_id TEXT NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  reason TEXT NOT NULL CHECK (length(trim(reason)) BETWEEN 3 AND 500),
  mutation_id TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX class_lifecycle_events_assignment_uq ON class_lifecycle_events (assignment_id);
CREATE UNIQUE INDEX class_lifecycle_events_mutation_uq ON class_lifecycle_events (mutation_id);
CREATE INDEX class_lifecycle_events_class_idx ON class_lifecycle_events (class_id, created_at DESC);
CREATE TRIGGER class_lifecycle_events_no_update BEFORE UPDATE ON class_lifecycle_events
BEGIN SELECT RAISE(ABORT, 'class lifecycle history is immutable'); END;
CREATE TRIGGER class_lifecycle_events_no_delete BEFORE DELETE ON class_lifecycle_events
BEGIN SELECT RAISE(ABORT, 'class lifecycle history is immutable'); END;
CREATE TRIGGER class_lifecycle_events_valid_insert BEFORE INSERT ON class_lifecycle_events
WHEN NOT EXISTS (
  SELECT 1 FROM class_assignments a
  JOIN class_listings c ON c.id = a.class_id
  JOIN parent_requests r ON r.id = c.source_request_id
  JOIN users moderator ON moderator.id = NEW.actor_id
  WHERE a.id = NEW.assignment_id AND a.class_id = NEW.class_id
    AND moderator.role = 'admin' AND moderator.status = 'active'
    AND a.mutation_id = NEW.mutation_id AND c.mutation_id = NEW.mutation_id
    AND r.mutation_id = NEW.mutation_id
    AND ((NEW.event_type = 'revoked' AND a.status = 'revoked'
          AND a.revoked_at = NEW.created_at AND c.status = 'open' AND r.status = 'sourcing')
      OR (NEW.event_type = 'completed' AND a.status = 'active'
          AND a.revoked_at IS NULL AND c.status = 'completed' AND r.status = 'fulfilled'))
)
BEGIN SELECT RAISE(ABORT, 'CLASS_LIFECYCLE_INCOMPLETE'); END;

-- A selected application is historical after revocation/completion. Only an
-- application still submitted, or a selected application with an active class
-- commitment, blocks the tutor's deletion request.
DROP TRIGGER account_deletions_eligible;
CREATE TRIGGER account_deletions_eligible BEFORE INSERT ON account_deletions
WHEN NOT EXISTS (SELECT 1 FROM users WHERE id = NEW.user_id AND role IN ('student', 'tutor') AND status = 'active')
  OR EXISTS (SELECT 1 FROM bookings WHERE (student_id = NEW.user_id OR tutor_id = NEW.user_id)
    AND status IN ('PENDING', 'CONFIRMED'))
  OR EXISTS (SELECT 1 FROM parent_requests WHERE parent_user_id = NEW.user_id
    AND status IN ('submitted', 'sourcing', 'assigned'))
  OR EXISTS (SELECT 1 FROM class_listings WHERE parent_user_id = NEW.user_id
    AND status IN ('draft', 'open', 'active'))
  OR EXISTS (SELECT 1 FROM tutor_applications WHERE tutor_user_id = NEW.user_id
    AND status = 'submitted')
  OR EXISTS (SELECT 1 FROM class_assignments a
    JOIN class_listings c ON c.id = a.class_id
    WHERE a.tutor_user_id = NEW.user_id AND a.status = 'active' AND c.status = 'active')
BEGIN SELECT RAISE(ABORT, 'ACCOUNT_DELETION_BLOCKED'); END;

-- Contract actions stop at the same class boundary as contact access.
DROP TRIGGER class_contract_records_valid_insert;
CREATE TRIGGER class_contract_records_valid_insert BEFORE INSERT ON class_contract_records
WHEN NOT EXISTS (
  SELECT 1 FROM class_assignments a
  JOIN class_listings cl ON cl.id = a.class_id
  JOIN tutor_applications t ON t.id = a.application_id
  JOIN content_revisions c ON c.id = NEW.contract_content_revision_id
  JOIN users moderator ON moderator.id = NEW.issued_by
  WHERE a.id = NEW.assignment_id AND a.status = 'active' AND cl.status = 'active'
    AND a.class_id = NEW.class_id AND a.tutor_user_id = NEW.tutor_user_id
    AND t.fee_option_version_id = NEW.fee_option_version_id
    AND c.kind = 'contract' AND c.slug = 'tutor-class-contract'
    AND c.audience = 'tutor' AND c.status = 'published'
    AND moderator.role = 'admin' AND moderator.status = 'active'
)
BEGIN SELECT RAISE(ABORT, 'CONTRACT_NOT_ELIGIBLE'); END;
CREATE TRIGGER class_contract_records_active_ack BEFORE UPDATE OF status ON class_contract_records
WHEN NOT EXISTS (
  SELECT 1 FROM class_assignments a JOIN class_listings c ON c.id = a.class_id
  WHERE a.id = NEW.assignment_id AND a.status = 'active' AND c.status = 'active'
)
BEGIN SELECT RAISE(ABORT, 'CONTRACT_NOT_ELIGIBLE'); END;
