ALTER TABLE tutor_applications
  ADD COLUMN match_snapshot_json TEXT NOT NULL DEFAULT '{}';
