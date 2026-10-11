import type { Page } from '../../../shared/schemas/discovery';
import type {
  AdminContent,
  AdminContentListQuery,
  ContentAudience,
  ContentKind,
  CreateContentInput,
  EditContentInput,
  PublishedContent,
  PublicContentListQuery,
} from '../../../shared/schemas/content';

interface ContentRow {
  id: string;
  kind: ContentKind;
  slug: string;
  audience: ContentAudience;
  revision: number;
  edit_version: number;
  status: AdminContent['status'];
  title: string;
  summary: string;
  body_text: string;
  created_by: string | null;
  published_by: string | null;
  revised_from_id: string | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;
}

const SELECT_COLUMNS =
  'id, kind, slug, audience, revision, edit_version, status, title, summary, body_text, ' +
  'created_by, published_by, revised_from_id, published_at, created_at, updated_at';

function adminProjection(row: ContentRow): AdminContent {
  return {
    id: row.id,
    kind: row.kind,
    slug: row.slug,
    audience: row.audience,
    revision: row.revision,
    editVersion: row.edit_version,
    status: row.status,
    title: row.title,
    summary: row.summary,
    bodyText: row.body_text,
    createdBy: row.created_by,
    publishedBy: row.published_by,
    revisedFromId: row.revised_from_id,
    publishedAt: row.published_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function publicProjection(row: ContentRow): PublishedContent {
  return {
    id: row.id,
    kind: row.kind,
    slug: row.slug,
    audience: row.audience,
    revision: row.revision,
    title: row.title,
    summary: row.summary,
    bodyText: row.body_text,
    publishedAt: row.published_at!,
  };
}

export async function findAdminContent(db: D1Database, id: string): Promise<AdminContent | null> {
  const row = await db
    .prepare(`SELECT ${SELECT_COLUMNS} FROM content_revisions WHERE id = ?`)
    .bind(id)
    .first<ContentRow>();
  return row ? adminProjection(row) : null;
}

export async function findCurrentPublished(
  db: D1Database,
  kind: ContentKind,
  slug: string,
  audience: ContentAudience,
): Promise<PublishedContent | null> {
  const row = await db
    .prepare(
      `SELECT ${SELECT_COLUMNS} FROM content_revisions
       WHERE kind = ? AND slug = ? AND audience = ? AND status = 'published'`,
    )
    .bind(kind, slug, audience)
    .first<ContentRow>();
  return row ? publicProjection(row) : null;
}

export async function listPublishedContent(
  db: D1Database,
  query: PublicContentListQuery,
): Promise<Page<PublishedContent>> {
  const where =
    "status = 'published' AND audience = ? AND (? IS NULL OR kind = ?) AND (? IS NULL OR slug LIKE ?)";
  const args = [
    query.audience,
    query.kind ?? null,
    query.kind ?? null,
    query.slugPrefix ?? null,
    query.slugPrefix ? `${query.slugPrefix}%` : null,
  ];
  const [items, total] = await Promise.all([
    db
      .prepare(
        `SELECT ${SELECT_COLUMNS} FROM content_revisions WHERE ${where}
         ORDER BY published_at DESC, id DESC LIMIT ? OFFSET ?`,
      )
      .bind(...args, query.pageSize, (query.page - 1) * query.pageSize)
      .all<ContentRow>(),
    db
      .prepare(`SELECT COUNT(*) AS total FROM content_revisions WHERE ${where}`)
      .bind(...args)
      .first<{ total: number }>(),
  ]);
  return {
    items: items.results.map(publicProjection),
    page: query.page,
    pageSize: query.pageSize,
    total: total?.total ?? 0,
  };
}

export async function listAdminContent(
  db: D1Database,
  query: AdminContentListQuery,
): Promise<Page<AdminContent>> {
  const where =
    '(? IS NULL OR kind = ?) AND (? IS NULL OR audience = ?) AND (? IS NULL OR status = ?)';
  const args = [
    query.kind ?? null,
    query.kind ?? null,
    query.audience ?? null,
    query.audience ?? null,
    query.status ?? null,
    query.status ?? null,
  ];
  const [items, total] = await Promise.all([
    db
      .prepare(
        `SELECT ${SELECT_COLUMNS} FROM content_revisions WHERE ${where}
         ORDER BY updated_at DESC, id DESC LIMIT ? OFFSET ?`,
      )
      .bind(...args, query.pageSize, (query.page - 1) * query.pageSize)
      .all<ContentRow>(),
    db
      .prepare(`SELECT COUNT(*) AS total FROM content_revisions WHERE ${where}`)
      .bind(...args)
      .first<{ total: number }>(),
  ]);
  return {
    items: items.results.map(adminProjection),
    page: query.page,
    pageSize: query.pageSize,
    total: total?.total ?? 0,
  };
}

export async function findDraftForKey(
  db: D1Database,
  kind: ContentKind,
  slug: string,
  audience: ContentAudience,
): Promise<AdminContent | null> {
  const row = await db
    .prepare(
      `SELECT ${SELECT_COLUMNS} FROM content_revisions
       WHERE kind = ? AND slug = ? AND audience = ? AND status = 'draft'`,
    )
    .bind(kind, slug, audience)
    .first<ContentRow>();
  return row ? adminProjection(row) : null;
}

async function nextRevision(
  db: D1Database,
  kind: ContentKind,
  slug: string,
  audience: ContentAudience,
): Promise<number> {
  const row = await db
    .prepare(
      'SELECT COALESCE(MAX(revision), 0) + 1 AS next_revision FROM content_revisions WHERE kind = ? AND slug = ? AND audience = ?',
    )
    .bind(kind, slug, audience)
    .first<{ next_revision: number }>();
  return row?.next_revision ?? 1;
}

function audit(
  db: D1Database,
  actorId: string,
  action: string,
  id: string,
  now: string,
  metadata: Record<string, unknown>,
) {
  return db
    .prepare(
      "INSERT INTO audit_logs (id, actor_id, action, target_type, target_id, metadata, created_at) VALUES (?, ?, ?, 'content_revision', ?, ?, ?)",
    )
    .bind(crypto.randomUUID(), actorId, action, id, JSON.stringify(metadata), now);
}

export async function insertDraft(
  db: D1Database,
  actorId: string,
  input: CreateContentInput,
  now: string,
  id: string,
): Promise<AdminContent> {
  const revision = await nextRevision(db, input.kind, input.slug, input.audience);
  await db.batch([
    db
      .prepare(
        `INSERT INTO content_revisions
         (id, kind, slug, audience, revision, edit_version, status, title, summary,
          body_text, created_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 1, 'draft', ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        id,
        input.kind,
        input.slug,
        input.audience,
        revision,
        input.title,
        input.summary,
        input.bodyText,
        actorId,
        now,
        now,
      ),
    audit(db, actorId, 'content.created', id, now, {
      kind: input.kind,
      slug: input.slug,
      audience: input.audience,
      revision,
    }),
  ]);
  return (await findAdminContent(db, id))!;
}

export async function revisePublished(
  db: D1Database,
  actorId: string,
  published: AdminContent,
  expectedVersion: number,
  now: string,
  id: string,
): Promise<AdminContent | null> {
  const revision = await nextRevision(db, published.kind, published.slug, published.audience);
  const [inserted] = await db.batch([
    db
      .prepare(
        `INSERT INTO content_revisions
         (id, kind, slug, audience, revision, edit_version, status, title, summary,
          body_text, created_by, revised_from_id, created_at, updated_at)
         SELECT ?, kind, slug, audience, ?, 1, 'draft', title, summary, body_text,
                ?, id, ?, ?
         FROM content_revisions
         WHERE id = ? AND status = 'published' AND edit_version = ?`,
      )
      .bind(id, revision, actorId, now, now, published.id, expectedVersion),
    db
      .prepare(
        `INSERT INTO audit_logs (id, actor_id, action, target_type, target_id, metadata, created_at)
         SELECT ?, ?, 'content.revised', 'content_revision', ?, ?, ?
         WHERE EXISTS (SELECT 1 FROM content_revisions WHERE id = ?)`,
      )
      .bind(
        crypto.randomUUID(),
        actorId,
        id,
        JSON.stringify({ revisedFromId: published.id, revision }),
        now,
        id,
      ),
  ]);
  return inserted?.meta.changes ? findAdminContent(db, id) : null;
}

export async function updateDraft(
  db: D1Database,
  actorId: string,
  id: string,
  input: EditContentInput,
  now: string,
): Promise<AdminContent | null> {
  const mutationId = crypto.randomUUID();
  const [updated] = await db.batch([
    db
      .prepare(
        `UPDATE content_revisions
         SET title = ?, summary = ?, body_text = ?, edit_version = edit_version + 1,
             updated_at = ?, last_mutation_id = ?
         WHERE id = ? AND status = 'draft' AND edit_version = ?`,
      )
      .bind(input.title, input.summary, input.bodyText, now, mutationId, id, input.editVersion),
    db
      .prepare(
        `INSERT INTO audit_logs (id, actor_id, action, target_type, target_id, metadata, created_at)
         SELECT ?, ?, 'content.edited', 'content_revision', ?, ?, ?
         WHERE EXISTS (SELECT 1 FROM content_revisions WHERE id = ? AND last_mutation_id = ?)`,
      )
      .bind(
        crypto.randomUUID(),
        actorId,
        id,
        JSON.stringify({ fromVersion: input.editVersion, toVersion: input.editVersion + 1 }),
        now,
        id,
        mutationId,
      ),
  ]);
  return updated?.meta.changes ? findAdminContent(db, id) : null;
}

export async function publishDraft(
  db: D1Database,
  actorId: string,
  draft: AdminContent,
  expectedVersion: number,
  now: string,
): Promise<AdminContent | null> {
  const mutationId = crypto.randomUUID();
  const [, published] = await db.batch([
    db
      .prepare(
        `UPDATE content_revisions
         SET status = 'retired', edit_version = edit_version + 1, updated_at = ?,
             last_mutation_id = ?
         WHERE kind = ? AND slug = ? AND audience = ? AND status = 'published'
           AND EXISTS (
             SELECT 1 FROM content_revisions target
             WHERE target.id = ? AND target.status = 'draft' AND target.edit_version = ?
           )`,
      )
      .bind(now, mutationId, draft.kind, draft.slug, draft.audience, draft.id, expectedVersion),
    db
      .prepare(
        `UPDATE content_revisions
         SET status = 'published', edit_version = edit_version + 1, published_by = ?,
             published_at = ?, updated_at = ?, last_mutation_id = ?
         WHERE id = ? AND status = 'draft' AND edit_version = ?`,
      )
      .bind(actorId, now, now, mutationId, draft.id, expectedVersion),
    db
      .prepare(
        `INSERT INTO audit_logs (id, actor_id, action, target_type, target_id, metadata, created_at)
         SELECT ?, ?, 'content.published', 'content_revision', ?, ?, ?
         WHERE EXISTS (SELECT 1 FROM content_revisions WHERE id = ? AND last_mutation_id = ?)`,
      )
      .bind(
        crypto.randomUUID(),
        actorId,
        draft.id,
        JSON.stringify({
          kind: draft.kind,
          slug: draft.slug,
          audience: draft.audience,
          revision: draft.revision,
        }),
        now,
        draft.id,
        mutationId,
      ),
  ]);
  return published?.meta.changes ? findAdminContent(db, draft.id) : null;
}

export async function retirePublished(
  db: D1Database,
  actorId: string,
  id: string,
  expectedVersion: number,
  now: string,
): Promise<AdminContent | null> {
  const mutationId = crypto.randomUUID();
  const [retired] = await db.batch([
    db
      .prepare(
        `UPDATE content_revisions
         SET status = 'retired', edit_version = edit_version + 1, updated_at = ?,
             last_mutation_id = ?
         WHERE id = ? AND status = 'published' AND edit_version = ?`,
      )
      .bind(now, mutationId, id, expectedVersion),
    db
      .prepare(
        `INSERT INTO audit_logs (id, actor_id, action, target_type, target_id, metadata, created_at)
         SELECT ?, ?, 'content.retired', 'content_revision', ?, ?, ?
         WHERE EXISTS (SELECT 1 FROM content_revisions WHERE id = ? AND last_mutation_id = ?)`,
      )
      .bind(
        crypto.randomUUID(),
        actorId,
        id,
        JSON.stringify({ fromVersion: expectedVersion, toVersion: expectedVersion + 1 }),
        now,
        id,
        mutationId,
      ),
  ]);
  return retired?.meta.changes ? findAdminContent(db, id) : null;
}
