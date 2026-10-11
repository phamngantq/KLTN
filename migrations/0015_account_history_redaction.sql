-- Account deletion may erase free-text reasons after an account tombstone exists.
-- All event identity, actor, status and time columns remain immutable.
DROP TRIGGER class_lifecycle_events_no_update;
CREATE TRIGGER class_lifecycle_events_no_update BEFORE UPDATE ON class_lifecycle_events
WHEN NOT (
  NEW.id IS OLD.id AND NEW.class_id IS OLD.class_id
  AND NEW.assignment_id IS OLD.assignment_id AND NEW.event_type IS OLD.event_type
  AND NEW.actor_id IS OLD.actor_id AND NEW.mutation_id IS OLD.mutation_id
  AND NEW.created_at IS OLD.created_at AND NEW.reason = 'Đã ẩn thông tin'
  AND EXISTS (
    SELECT 1 FROM account_deletions d
    WHERE EXISTS (SELECT 1 FROM class_listings c
      WHERE c.id = OLD.class_id AND c.parent_user_id = d.user_id)
      OR EXISTS (SELECT 1 FROM tutor_applications a
        WHERE a.class_id = OLD.class_id AND a.tutor_user_id = d.user_id)
      OR EXISTS (SELECT 1 FROM class_assignments a
        WHERE a.class_id = OLD.class_id AND a.tutor_user_id = d.user_id)
  )
)
BEGIN SELECT RAISE(ABORT, 'class lifecycle history is immutable'); END;

DROP TRIGGER class_cancellations_no_update;
CREATE TRIGGER class_cancellations_no_update BEFORE UPDATE ON class_cancellations
WHEN NOT (
  NEW.id IS OLD.id AND NEW.class_id IS OLD.class_id
  AND NEW.actor_id IS OLD.actor_id AND NEW.mutation_id IS OLD.mutation_id
  AND NEW.created_at IS OLD.created_at AND NEW.reason = 'Đã ẩn thông tin'
  AND EXISTS (
    SELECT 1 FROM account_deletions d
    WHERE EXISTS (SELECT 1 FROM class_listings c
      WHERE c.id = OLD.class_id AND c.parent_user_id = d.user_id)
      OR EXISTS (SELECT 1 FROM tutor_applications a
        WHERE a.class_id = OLD.class_id AND a.tutor_user_id = d.user_id)
      OR EXISTS (SELECT 1 FROM class_assignments a
        WHERE a.class_id = OLD.class_id AND a.tutor_user_id = d.user_id)
  )
)
BEGIN SELECT RAISE(ABORT, 'class cancellation history is immutable'); END;

-- Backfill accounts deleted before this migration. The view is temporary to
-- the migration and uses the same class relations as deleteOwnAccount().
CREATE VIEW account_deletion_backfill_classes AS
SELECT c.id, c.source_request_id FROM class_listings c
WHERE EXISTS (
  SELECT 1 FROM account_deletions d
  WHERE d.user_id = c.parent_user_id
    OR EXISTS (SELECT 1 FROM tutor_applications a
      WHERE a.class_id = c.id AND a.tutor_user_id = d.user_id)
    OR EXISTS (SELECT 1 FROM class_assignments a
      WHERE a.class_id = c.id AND a.tutor_user_id = d.user_id)
);

UPDATE class_lifecycle_events SET reason = 'Đã ẩn thông tin'
WHERE reason <> 'Đã ẩn thông tin'
  AND class_id IN (SELECT id FROM account_deletion_backfill_classes);
UPDATE class_cancellations SET reason = 'Đã ẩn thông tin'
WHERE reason <> 'Đã ẩn thông tin'
  AND class_id IN (SELECT id FROM account_deletion_backfill_classes);
UPDATE tutor_applications SET rejection_reason = 'Đã ẩn thông tin',
  version = version + 1, mutation_id = lower(hex(randomblob(16))),
  updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE rejection_reason IS NOT NULL AND rejection_reason <> 'Đã ẩn thông tin'
  AND class_id IN (SELECT id FROM account_deletion_backfill_classes);
UPDATE complaints SET title = 'Khiếu nại đã xóa',
  body = 'Nội dung khiếu nại đã được xóa cùng tài khoản.',
  triage_reason = CASE WHEN triage_reason IS NULL THEN NULL ELSE 'Đã ẩn thông tin' END,
  resolution = CASE WHEN resolution IS NULL THEN NULL ELSE 'Đã ẩn thông tin' END,
  version = version + 1, mutation_id = lower(hex(randomblob(16))),
  updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE (creator_user_id IN (SELECT user_id FROM account_deletions)
  OR class_id IN (SELECT id FROM account_deletion_backfill_classes))
  AND (title <> 'Khiếu nại đã xóa'
    OR body <> 'Nội dung khiếu nại đã được xóa cùng tài khoản.'
    OR (triage_reason IS NOT NULL AND triage_reason <> 'Đã ẩn thông tin')
    OR (resolution IS NOT NULL AND resolution <> 'Đã ẩn thông tin'));
UPDATE audit_logs SET metadata = '{"redactedOnAccountDeletion":true}'
WHERE metadata <> '{"redactedOnAccountDeletion":true}'
  AND (
    actor_id IN (SELECT user_id FROM account_deletions)
    OR target_id IN (SELECT user_id FROM account_deletions)
    OR (target_type = 'parent_request' AND target_id IN (
      SELECT id FROM parent_requests
      WHERE parent_user_id IN (SELECT user_id FROM account_deletions)
      UNION SELECT source_request_id FROM account_deletion_backfill_classes))
    OR (target_type = 'class_listing' AND target_id IN (
      SELECT id FROM account_deletion_backfill_classes))
    OR (target_type = 'tutor_application' AND target_id IN (
      SELECT id FROM tutor_applications
      WHERE class_id IN (SELECT id FROM account_deletion_backfill_classes)))
    OR (target_type = 'class_assignment' AND target_id IN (
      SELECT id FROM class_assignments
      WHERE class_id IN (SELECT id FROM account_deletion_backfill_classes)))
    OR (target_type = 'complaint' AND target_id IN (
      SELECT id FROM complaints
      WHERE creator_user_id IN (SELECT user_id FROM account_deletions)
        OR class_id IN (SELECT id FROM account_deletion_backfill_classes)))
    OR (target_type = 'booking' AND target_id IN (
      SELECT id FROM bookings
      WHERE student_id IN (SELECT user_id FROM account_deletions)
        OR tutor_id IN (SELECT user_id FROM account_deletions)))
  );
DROP VIEW account_deletion_backfill_classes;
