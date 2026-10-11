-- Cancellation applies only to published open classes with no active assignment.
-- Drafts have never been published and retain NULL published_at; they cannot be
-- moved to cancelled under the existing class_listings invariant.
CREATE TABLE class_cancellations (
  id TEXT PRIMARY KEY NOT NULL,
  class_id TEXT NOT NULL REFERENCES class_listings (id) ON DELETE RESTRICT,
  actor_id TEXT NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  reason TEXT NOT NULL CHECK (length(trim(reason)) BETWEEN 3 AND 450),
  mutation_id TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX class_cancellations_class_uq ON class_cancellations (class_id);
CREATE UNIQUE INDEX class_cancellations_mutation_uq ON class_cancellations (mutation_id);
CREATE TRIGGER class_cancellations_no_update BEFORE UPDATE ON class_cancellations
BEGIN SELECT RAISE(ABORT, 'class cancellation history is immutable'); END;
CREATE TRIGGER class_cancellations_no_delete BEFORE DELETE ON class_cancellations
BEGIN SELECT RAISE(ABORT, 'class cancellation history is immutable'); END;
CREATE TRIGGER class_cancellations_valid_insert BEFORE INSERT ON class_cancellations
WHEN NOT EXISTS (
  SELECT 1 FROM class_listings c
  JOIN parent_requests r ON r.id = c.source_request_id
  JOIN users moderator ON moderator.id = NEW.actor_id
  WHERE c.id = NEW.class_id AND c.status = 'cancelled' AND r.status = 'cancelled'
    AND c.mutation_id = NEW.mutation_id AND r.mutation_id = NEW.mutation_id
    AND moderator.role = 'admin' AND moderator.status = 'active'
    AND NOT EXISTS (SELECT 1 FROM class_assignments a
      WHERE a.class_id = c.id AND a.status = 'active')
    AND NOT EXISTS (SELECT 1 FROM tutor_applications a
      WHERE a.class_id = c.id AND a.status = 'submitted')
)
BEGIN SELECT RAISE(ABORT, 'CLASS_CANCELLATION_INCOMPLETE'); END;
