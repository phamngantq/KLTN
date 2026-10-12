import type {
  ClassFeeGuidanceVersion,
  CreateClassFeeGuidanceInput,
  CreateTuitionPriceInput,
  TuitionPriceVersion,
  UpdateClassFeeGuidanceInput,
  UpdateTuitionPriceInput,
} from '../../../shared/schemas/pricing';
import { AppError } from '../../lib/errors';
import * as repo from './repository';

const missing = () => new AppError(404, 'PRICING_ITEM_NOT_FOUND', 'Không tìm thấy mục bảng giá.');
const stale = () =>
  new AppError(409, 'PRICING_ITEM_STALE', 'Bảng giá đã thay đổi. Vui lòng tải lại.');
const pending = () => new AppError(409, 'PRICING_DRAFT_EXISTS', 'Đã có bản nháp cho mục giá này.');

function rootMessage(error: unknown): string {
  let cause = error;
  while (cause instanceof Error && cause.cause !== undefined) cause = cause.cause;
  return cause instanceof Error ? cause.message : String(cause);
}

function rethrowConflict(error: unknown): never {
  const message = rootMessage(error);
  if (
    /UNIQUE constraint failed|PRICE_SEQUENCE_INVALID|GUIDANCE_SEQUENCE_INVALID|RETIREMENT_INVALID/.test(
      message,
    )
  ) {
    throw stale();
  }
  throw error;
}

export const listPublicTuition = (db: D1Database) => repo.listTuition(db, true);
export const listAdminTuition = (db: D1Database) => repo.listTuition(db, false);
export const listPublicGuidance = (db: D1Database) => repo.listGuidance(db, true);
export const listLearnerGuides = (db: D1Database) => repo.listLearnerGuides(db);
export const listLearnerItems = (db: D1Database) => repo.listLearnerItems(db);
export const listAdminGuidance = (db: D1Database) => repo.listGuidance(db, false);

export async function createTuition(
  db: D1Database,
  actorId: string,
  input: CreateTuitionPriceInput,
): Promise<TuitionPriceVersion> {
  if (!(await repo.subjectExists(db, input.subjectId))) {
    throw new AppError(422, 'SUBJECT_UNKNOWN', 'Môn học không tồn tại.');
  }
  const previous = await repo.latestTuition(db, input);
  if (previous?.status === 'draft') throw pending();
  const id = crypto.randomUUID();
  try {
    await repo.insertTuition(
      db,
      actorId,
      id,
      (previous?.version ?? 0) + 1,
      input,
      new Date().toISOString(),
    );
  } catch (error) {
    rethrowConflict(error);
  }
  return (await repo.getTuition(db, id))!;
}

export async function createGuidance(
  db: D1Database,
  actorId: string,
  input: CreateClassFeeGuidanceInput,
): Promise<ClassFeeGuidanceVersion> {
  const previous = await repo.latestGuidance(db, input.mode);
  if (previous?.status === 'draft') throw pending();
  const id = crypto.randomUUID();
  try {
    await repo.insertGuidance(
      db,
      actorId,
      id,
      (previous?.version ?? 0) + 1,
      input,
      new Date().toISOString(),
    );
  } catch (error) {
    rethrowConflict(error);
  }
  return (await repo.getGuidance(db, id))!;
}

export async function updateTuition(
  db: D1Database,
  actorId: string,
  id: string,
  input: UpdateTuitionPriceInput,
): Promise<TuitionPriceVersion> {
  const item = await repo.getTuition(db, id);
  if (!item) throw missing();
  if (item.status !== 'draft' || item.editVersion !== input.editVersion) throw stale();
  if (!(await repo.updateTuition(db, actorId, id, input, new Date().toISOString()))) throw stale();
  return (await repo.getTuition(db, id))!;
}

export async function updateGuidance(
  db: D1Database,
  actorId: string,
  id: string,
  input: UpdateClassFeeGuidanceInput,
): Promise<ClassFeeGuidanceVersion> {
  const item = await repo.getGuidance(db, id);
  if (!item) throw missing();
  if (item.status !== 'draft' || item.editVersion !== input.editVersion) throw stale();
  if (!(await repo.updateGuidance(db, actorId, id, input, new Date().toISOString()))) throw stale();
  return (await repo.getGuidance(db, id))!;
}

export async function publishTuition(
  db: D1Database,
  actorId: string,
  id: string,
  editVersion: number,
): Promise<TuitionPriceVersion> {
  const item = await repo.getTuition(db, id);
  if (!item) throw missing();
  if (item.status !== 'draft' || item.editVersion !== editVersion) throw stale();
  if (!(await repo.publishTuition(db, actorId, id, editVersion, new Date().toISOString())))
    throw stale();
  return (await repo.getTuition(db, id))!;
}

export async function publishGuidance(
  db: D1Database,
  actorId: string,
  id: string,
  editVersion: number,
): Promise<ClassFeeGuidanceVersion> {
  const item = await repo.getGuidance(db, id);
  if (!item) throw missing();
  if (item.status !== 'draft' || item.editVersion !== editVersion) throw stale();
  if (!(await repo.publishGuidance(db, actorId, id, editVersion, new Date().toISOString())))
    throw stale();
  return (await repo.getGuidance(db, id))!;
}

export async function retireTuition(
  db: D1Database,
  actorId: string,
  id: string,
  version: number,
): Promise<TuitionPriceVersion> {
  const item = await repo.getTuition(db, id);
  if (!item) throw missing();
  if (item.status !== 'published' || item.version !== version) throw stale();
  const newId = crypto.randomUUID();
  try {
    if (!(await repo.retireTuition(db, actorId, id, version, newId, new Date().toISOString())))
      throw stale();
  } catch (error) {
    rethrowConflict(error);
  }
  return (await repo.getTuition(db, newId))!;
}

export async function retireGuidance(
  db: D1Database,
  actorId: string,
  id: string,
  version: number,
): Promise<ClassFeeGuidanceVersion> {
  const item = await repo.getGuidance(db, id);
  if (!item) throw missing();
  if (item.status !== 'published' || item.version !== version) throw stale();
  const newId = crypto.randomUUID();
  try {
    if (!(await repo.retireGuidance(db, actorId, id, version, newId, new Date().toISOString())))
      throw stale();
  } catch (error) {
    rethrowConflict(error);
  }
  return (await repo.getGuidance(db, newId))!;
}

export async function discardTuition(
  db: D1Database,
  actorId: string,
  id: string,
  editVersion: number,
): Promise<{ discarded: true }> {
  const item = await repo.getTuition(db, id);
  if (!item) throw missing();
  if (item.status !== 'draft' || item.editVersion !== editVersion) throw stale();
  if (!(await repo.discardTuition(db, actorId, id, editVersion, new Date().toISOString())))
    throw stale();
  return { discarded: true };
}

export async function discardGuidance(
  db: D1Database,
  actorId: string,
  id: string,
  editVersion: number,
): Promise<{ discarded: true }> {
  const item = await repo.getGuidance(db, id);
  if (!item) throw missing();
  if (item.status !== 'draft' || item.editVersion !== editVersion) throw stale();
  if (!(await repo.discardGuidance(db, actorId, id, editVersion, new Date().toISOString())))
    throw stale();
  return { discarded: true };
}
