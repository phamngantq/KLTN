-- Development-only seed. Run ONLY via `npm run db:seed:local` (hard-coded `--local`).
-- Never execute against staging/production. Subjects are local placeholders,
-- not a verified product catalogue. Idempotent: safe to rerun.
INSERT OR IGNORE INTO subjects (id, slug, name) VALUES
  ('subj_math', 'toan', 'Toán'),
  ('subj_literature', 'ngu-van', 'Ngữ văn'),
  ('subj_english', 'tieng-anh', 'Tiếng Anh'),
  ('subj_physics', 'vat-ly', 'Vật lý'),
  ('subj_chemistry', 'hoa-hoc', 'Hóa học');
