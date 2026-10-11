-- Moderator-authored content. Published text is immutable; editing creates a new revision.
-- This migration intentionally contains no unapproved business copy, contact details or imagery.
CREATE TABLE content_revisions (
  id TEXT PRIMARY KEY NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('page', 'service', 'blog', 'faq', 'guide', 'contract', 'terms')),
  slug TEXT NOT NULL CHECK (
    length(slug) BETWEEN 2 AND 100 AND slug NOT GLOB '*[^a-z0-9-]*'
    AND substr(slug, 1, 1) <> '-' AND substr(slug, -1) <> '-'
  ),
  audience TEXT NOT NULL CHECK (audience IN ('public', 'parent', 'tutor')),
  revision INTEGER NOT NULL CHECK (revision >= 1),
  edit_version INTEGER NOT NULL DEFAULT 1 CHECK (edit_version >= 1),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'retired')),
  title TEXT NOT NULL CHECK (length(trim(title)) BETWEEN 2 AND 160),
  summary TEXT NOT NULL DEFAULT '' CHECK (length(summary) <= 500),
  body_text TEXT NOT NULL CHECK (length(trim(body_text)) BETWEEN 1 AND 20000),
  created_by TEXT REFERENCES users (id) ON DELETE SET NULL,
  published_by TEXT REFERENCES users (id) ON DELETE SET NULL,
  revised_from_id TEXT REFERENCES content_revisions (id) ON DELETE RESTRICT,
  published_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_mutation_id TEXT,
  CHECK (
    (status = 'draft' AND published_at IS NULL AND published_by IS NULL)
    OR (status IN ('published', 'retired') AND published_at IS NOT NULL)
  ),
  UNIQUE (kind, slug, audience, revision)
);
CREATE UNIQUE INDEX content_one_draft_uq
  ON content_revisions (kind, slug, audience) WHERE status = 'draft';
CREATE UNIQUE INDEX content_one_published_uq
  ON content_revisions (kind, slug, audience) WHERE status = 'published';
CREATE INDEX content_public_idx
  ON content_revisions (kind, audience, status, published_at DESC);
CREATE INDEX content_history_idx
  ON content_revisions (kind, slug, audience, revision DESC);

CREATE TRIGGER content_revisions_no_published_text_update
BEFORE UPDATE OF kind, slug, audience, revision, title, summary, body_text,
                 revised_from_id, published_at, created_at
ON content_revisions
WHEN OLD.status IN ('published', 'retired')
BEGIN
  SELECT RAISE(ABORT, 'published content is immutable');
END;
CREATE TRIGGER content_revisions_no_illegal_transition
BEFORE UPDATE OF status ON content_revisions
WHEN (OLD.status = 'draft' AND NEW.status NOT IN ('draft', 'published'))
  OR (OLD.status = 'published' AND NEW.status <> 'retired')
  OR OLD.status = 'retired'
BEGIN
  SELECT RAISE(ABORT, 'content status transition is invalid');
END;

CREATE TRIGGER content_revisions_no_key_change
BEFORE UPDATE OF kind, slug, audience, revision, revised_from_id, created_at
ON content_revisions
BEGIN
  SELECT RAISE(ABORT, 'content identity is immutable');
END;

CREATE TRIGGER content_revisions_no_delete
BEFORE DELETE ON content_revisions
BEGIN
  SELECT RAISE(ABORT, 'content history cannot be deleted');
END;
