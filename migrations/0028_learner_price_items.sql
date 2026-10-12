-- "Bảng giá chi tiết theo cấp học & môn học": named reference items grouped by school stage,
-- talent (năng khiếu) and foreign languages. Groups beyond the school subject catalogue need
-- free labels, so these rows do not reference subjects. Guidance only; seeded by scripts.
CREATE TABLE learner_price_items (
  id TEXT PRIMARY KEY NOT NULL,
  group_key TEXT NOT NULL
    CHECK (group_key IN ('primary', 'lower_secondary', 'upper_secondary', 'talent', 'language')),
  label TEXT NOT NULL CHECK (length(trim(label)) BETWEEN 1 AND 120),
  min_price_minor INTEGER NOT NULL CHECK (min_price_minor BETWEEN 1 AND 100000000),
  max_price_minor INTEGER NOT NULL CHECK (max_price_minor BETWEEN 1 AND 100000000),
  sort_order INTEGER NOT NULL DEFAULT 0 CHECK (sort_order BETWEEN 0 AND 1000),
  status TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('draft', 'published')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (min_price_minor <= max_price_minor)
);
CREATE UNIQUE INDEX learner_price_items_label_uq ON learner_price_items (group_key, label);
CREATE INDEX learner_price_items_public_idx ON learner_price_items (status, group_key, sort_order);

-- The per-subject guide rows (0027) were sample data only; the grouped items replace them.
DELETE FROM learner_price_guides WHERE dimension = 'subject';
