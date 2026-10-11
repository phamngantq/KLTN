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
import { AppError } from '../../lib/errors';
import * as repo from './repository';

const notFound = () => new AppError(404, 'CONTENT_NOT_FOUND', 'Không tìm thấy nội dung.');
const stale = () => new AppError(409, 'CONTENT_STALE', 'Nội dung đã thay đổi. Vui lòng tải lại.');
const draftExists = () => new AppError(409, 'CONTENT_DRAFT_EXISTS', 'Nội dung này đã có bản nháp.');

function isUniqueConflict(error: unknown): boolean {
  let cause = error;
  while (cause instanceof Error && cause.cause !== undefined) cause = cause.cause;
  return cause instanceof Error && /UNIQUE constraint failed/.test(cause.message);
}

export function listPublished(
  db: D1Database,
  query: PublicContentListQuery,
): Promise<Page<PublishedContent>> {
  return repo.listPublishedContent(db, query);
}

export async function getPublished(
  db: D1Database,
  kind: ContentKind,
  slug: string,
  audience: ContentAudience,
): Promise<PublishedContent> {
  return (await repo.findCurrentPublished(db, kind, slug, audience)) ?? Promise.reject(notFound());
}

export function listAdmin(
  db: D1Database,
  query: AdminContentListQuery,
): Promise<Page<AdminContent>> {
  return repo.listAdminContent(db, query);
}

export async function getAdmin(db: D1Database, id: string): Promise<AdminContent> {
  return (await repo.findAdminContent(db, id)) ?? Promise.reject(notFound());
}

export async function createDraft(
  db: D1Database,
  actorId: string,
  input: CreateContentInput,
): Promise<AdminContent> {
  if (await repo.findDraftForKey(db, input.kind, input.slug, input.audience)) throw draftExists();
  if (await repo.findCurrentPublished(db, input.kind, input.slug, input.audience)) {
    throw new AppError(
      409,
      'CONTENT_REVISION_REQUIRED',
      'Nội dung đã công bố. Hãy tạo bản nháp từ phiên bản hiện tại.',
    );
  }
  try {
    return await repo.insertDraft(
      db,
      actorId,
      input,
      new Date().toISOString(),
      crypto.randomUUID(),
    );
  } catch (error) {
    if (isUniqueConflict(error)) throw draftExists();
    throw error;
  }
}

export async function revise(
  db: D1Database,
  actorId: string,
  id: string,
  editVersion: number,
): Promise<AdminContent> {
  const published = await getAdmin(db, id);
  if (published.status !== 'published' || published.editVersion !== editVersion) throw stale();
  if (await repo.findDraftForKey(db, published.kind, published.slug, published.audience)) {
    throw draftExists();
  }
  try {
    const draft = await repo.revisePublished(
      db,
      actorId,
      published,
      editVersion,
      new Date().toISOString(),
      crypto.randomUUID(),
    );
    if (!draft) throw stale();
    return draft;
  } catch (error) {
    if (isUniqueConflict(error)) throw draftExists();
    throw error;
  }
}

export async function editDraft(
  db: D1Database,
  actorId: string,
  id: string,
  input: EditContentInput,
): Promise<AdminContent> {
  const current = await getAdmin(db, id);
  if (current.status !== 'draft' || current.editVersion !== input.editVersion) throw stale();
  return (
    (await repo.updateDraft(db, actorId, id, input, new Date().toISOString())) ??
    Promise.reject(stale())
  );
}

export async function publish(
  db: D1Database,
  actorId: string,
  id: string,
  editVersion: number,
): Promise<AdminContent> {
  const draft = await getAdmin(db, id);
  if (draft.status !== 'draft' || draft.editVersion !== editVersion) throw stale();
  return (
    (await repo.publishDraft(db, actorId, draft, editVersion, new Date().toISOString())) ??
    Promise.reject(stale())
  );
}

export async function retire(
  db: D1Database,
  actorId: string,
  id: string,
  editVersion: number,
): Promise<AdminContent> {
  const published = await getAdmin(db, id);
  if (published.status !== 'published' || published.editVersion !== editVersion) throw stale();
  return (
    (await repo.retirePublished(db, actorId, id, editVersion, new Date().toISOString())) ??
    Promise.reject(stale())
  );
}
