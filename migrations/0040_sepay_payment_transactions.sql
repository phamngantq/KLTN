-- Placement fee by VietQR transfer, confirmed by the SePay webhook. Every bank transaction SePay
-- reports is kept once (history and reconciliation); a matching, sufficient one records the fee
-- automatically, otherwise a moderator handles it.
CREATE TABLE payment_transactions (
  id TEXT PRIMARY KEY NOT NULL,
  provider TEXT NOT NULL CHECK (provider IN ('sepay')),
  provider_transaction_id TEXT NOT NULL CHECK (length(provider_transaction_id) BETWEEN 1 AND 64),
  gateway TEXT CHECK (gateway IS NULL OR length(gateway) <= 100),
  account_number TEXT CHECK (account_number IS NULL OR length(account_number) <= 40),
  transfer_type TEXT NOT NULL CHECK (transfer_type IN ('in', 'out')),
  amount_minor INTEGER NOT NULL CHECK (amount_minor BETWEEN 0 AND 100000000000),
  content TEXT NOT NULL CHECK (length(content) <= 1000),
  reference_code TEXT CHECK (reference_code IS NULL OR length(reference_code) <= 100),
  transaction_at TEXT NOT NULL CHECK (length(transaction_at) BETWEEN 1 AND 40),
  payment_code TEXT CHECK (payment_code IS NULL OR length(payment_code) <= 60),
  assignment_id TEXT REFERENCES class_assignments (id) ON DELETE RESTRICT,
  expected_amount_minor INTEGER CHECK (expected_amount_minor IS NULL OR expected_amount_minor >= 0),
  -- matched: fee recorded; the others wait for a moderator or are not fee payments at all.
  status TEXT NOT NULL CHECK (status IN (
    'matched', 'underpaid', 'not_ready', 'already_paid', 'unmatched', 'outgoing'
  )),
  received_at TEXT NOT NULL,
  CHECK ((status IN ('matched', 'underpaid', 'not_ready', 'already_paid')) = (assignment_id IS NOT NULL))
);
CREATE UNIQUE INDEX payment_transactions_provider_uq
  ON payment_transactions (provider, provider_transaction_id);
CREATE INDEX payment_transactions_received_idx ON payment_transactions (received_at DESC, id);
CREATE INDEX payment_transactions_assignment_idx ON payment_transactions (assignment_id, received_at DESC);
CREATE TRIGGER payment_transactions_no_delete BEFORE DELETE ON payment_transactions
BEGIN SELECT RAISE(ABORT, 'payment history cannot be deleted'); END;
CREATE TRIGGER payment_transactions_immutable BEFORE UPDATE ON payment_transactions
BEGIN SELECT RAISE(ABORT, 'payment history is immutable'); END;

ALTER TABLE class_assignments ADD COLUMN placement_fee_transaction_id TEXT
  REFERENCES payment_transactions (id) ON DELETE RESTRICT;

-- The fee is recorded once, after hire confirmation and contract acknowledgement, either by an
-- active moderator (offline payment) or by a matched SePay transaction of at least that amount.
DROP TRIGGER class_assignments_placement_fee;
CREATE TRIGGER class_assignments_placement_fee BEFORE UPDATE OF
  placement_fee_paid_at, placement_fee_amount_minor, placement_fee_recorded_by,
  placement_fee_transaction_id ON class_assignments
WHEN OLD.placement_fee_paid_at IS NOT NULL
  OR NEW.placement_fee_paid_at IS NULL OR NEW.placement_fee_amount_minor IS NULL
  OR NEW.status <> 'active' OR NEW.learner_confirmed_at IS NULL
  OR NOT (
    EXISTS (SELECT 1 FROM users WHERE id = NEW.placement_fee_recorded_by
            AND role = 'admin' AND status = 'active')
    OR (NEW.placement_fee_recorded_by IS NULL AND EXISTS (
      SELECT 1 FROM payment_transactions t
      WHERE t.id = NEW.placement_fee_transaction_id AND t.assignment_id = NEW.id
        AND t.status = 'matched' AND t.transfer_type = 'in'
        AND t.amount_minor >= NEW.placement_fee_amount_minor))
  )
  OR NOT EXISTS (SELECT 1 FROM class_contract_records r
                 WHERE r.assignment_id = NEW.id AND r.status = 'acknowledged')
BEGIN SELECT RAISE(ABORT, 'PLACEMENT_FEE_INVALID'); END;
