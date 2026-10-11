-- Migration 0004: reason shown to the tutor when an admin rejects or hides a profile.
ALTER TABLE tutor_profiles ADD COLUMN moderation_note TEXT CHECK (moderation_note IS NULL OR length(moderation_note) <= 500);
-- Admin moderation queue: filter by status, newest change first.
CREATE INDEX tutor_profiles_moderation_idx ON tutor_profiles (approval_status, updated_at);
