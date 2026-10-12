-- "Cẩm nang dành cho người học": articles carry a category and a byline so learners can
-- filter them. Both are part of the published text and stay immutable after publication.
ALTER TABLE content_revisions ADD COLUMN category TEXT CHECK (
  category IS NULL OR
  category IN ('choosing_tutor', 'study_methods', 'motivation', 'exam_prep', 'skills')
);
ALTER TABLE content_revisions ADD COLUMN author_name TEXT CHECK (
  author_name IS NULL OR length(trim(author_name)) BETWEEN 1 AND 80
);

DROP TRIGGER content_revisions_no_published_text_update;
CREATE TRIGGER content_revisions_no_published_text_update
BEFORE UPDATE OF kind, slug, audience, revision, title, summary, body_text, category, author_name,
                 revised_from_id, published_at, created_at
ON content_revisions
WHEN OLD.status IN ('published', 'retired')
BEGIN
  SELECT RAISE(ABORT, 'published content is immutable');
END;

CREATE INDEX content_category_idx
  ON content_revisions (kind, audience, status, category, published_at DESC);
