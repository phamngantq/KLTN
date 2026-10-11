-- Synthetic, non-login sample profiles for the isolated read-only preview only.
-- Never apply to staging or production. Rates satisfy the legacy directory schema;
-- the preview UI does not present them as approved product fees.
INSERT OR IGNORE INTO users
  (id, email, email_normalized, display_name, role, status, created_at, updated_at)
VALUES
  ('00000000-0000-4000-8000-000000000101', 'preview-tutor-01@example.invalid', 'preview-tutor-01@example.invalid', 'Gia sư mẫu 01', 'tutor', 'active', '2026-10-11T00:00:00.000Z', '2026-10-11T00:00:00.000Z'),
  ('00000000-0000-4000-8000-000000000102', 'preview-tutor-02@example.invalid', 'preview-tutor-02@example.invalid', 'Gia sư mẫu 02', 'tutor', 'active', '2026-10-11T00:00:00.000Z', '2026-10-11T00:00:00.000Z');

INSERT OR IGNORE INTO tutor_profiles
  (user_id, slug, bio, hourly_rate_minor, currency, teaches_online, teaches_offline,
   approval_status, visibility, created_at, updated_at)
VALUES
  ('00000000-0000-4000-8000-000000000101', 'gia-su-mau-01', 'Hồ sơ giả lập để kiểm tra giao diện. Không đại diện cho gia sư thật; học phí chưa được công bố.', 100000, 'VND', 1, 0, 'approved', 'public', '2026-10-11T00:00:00.000Z', '2026-10-11T00:00:00.000Z'),
  ('00000000-0000-4000-8000-000000000102', 'gia-su-mau-02', 'Hồ sơ giả lập để kiểm tra giao diện. Không đại diện cho gia sư thật; học phí chưa được công bố.', 120000, 'VND', 1, 1, 'approved', 'public', '2026-10-11T00:00:00.000Z', '2026-10-11T00:00:00.000Z');

INSERT OR IGNORE INTO tutor_subjects (tutor_id, subject_id) VALUES
  ('00000000-0000-4000-8000-000000000101', 'subj_math'),
  ('00000000-0000-4000-8000-000000000102', 'subj_english');
