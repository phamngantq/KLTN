-- Migration 0003: optimistic-concurrency version for booking state transitions.
-- Each transition does UPDATE ... WHERE status = ? AND version = ?, then releases claims and writes
-- the audit entry only if the row now carries version + 1 — so side effects happen exactly once.
ALTER TABLE bookings ADD COLUMN version INTEGER NOT NULL DEFAULT 0 CHECK (version >= 0);
