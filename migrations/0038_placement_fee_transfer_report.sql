-- "Hoàn tất nhận lớp" for a returning tutor: after confirming the contract the tutor pays the
-- placement fee by bank transfer (VietQR) and reports it here. This is only the tutor's claim;
-- learner contact still opens only when a moderator records the fee as received (0031).
ALTER TABLE class_assignments ADD COLUMN placement_fee_reported_at TEXT;

CREATE TRIGGER class_assignments_fee_transfer_report BEFORE UPDATE OF placement_fee_reported_at
ON class_assignments
WHEN OLD.placement_fee_reported_at IS NOT NULL OR NEW.placement_fee_reported_at IS NULL
  OR NEW.status <> 'active' OR NEW.learner_confirmed_at IS NULL
  OR NOT EXISTS (SELECT 1 FROM class_contract_records r
                 WHERE r.assignment_id = NEW.id AND r.status = 'acknowledged')
BEGIN SELECT RAISE(ABORT, 'FEE_TRANSFER_REPORT_INVALID'); END;
