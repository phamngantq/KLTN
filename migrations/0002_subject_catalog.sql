-- Migration 0002: subject catalogue (reference data required in every environment).
-- PROVISIONAL list (FIGMA_GAP_LOG FIG-002): common Vietnamese school subjects. Idempotent.
INSERT OR IGNORE INTO subjects (id, slug, name) VALUES
  ('subj_math', 'toan', 'Toán'),
  ('subj_literature', 'ngu-van', 'Ngữ văn'),
  ('subj_english', 'tieng-anh', 'Tiếng Anh'),
  ('subj_physics', 'vat-ly', 'Vật lý'),
  ('subj_chemistry', 'hoa-hoc', 'Hóa học'),
  ('subj_biology', 'sinh-hoc', 'Sinh học'),
  ('subj_history', 'lich-su', 'Lịch sử'),
  ('subj_geography', 'dia-ly', 'Địa lý'),
  ('subj_informatics', 'tin-hoc', 'Tin học');
