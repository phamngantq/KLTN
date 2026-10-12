import type { BatchItem } from 'drizzle-orm/batch';
import type { Page } from '../../../shared/schemas/discovery';
import type {
  CreateParentRequestInput,
  OwnParentRequest,
  ParentRequestListItem,
  ParentRequestListQuery,
  UpdateParentRequestInput,
} from '../../../shared/schemas/requests';
import {
  CONTACT_SHARING_CONSENT_VERSION,
  educationLevelForGrade,
} from '../../../shared/schemas/requests';
import { isHanoiCatalogArea } from '../../../shared/schemas/hanoi-wards';
import type { Db } from '../../db/client';
import { AppError, isUniqueViolation } from '../../lib/errors';
import * as repo from './requests-repository';

const notFound = () => new AppError(404, 'REQUEST_NOT_FOUND', 'Không tìm thấy yêu cầu.');
const stale = () =>
  new AppError(409, 'STALE_REQUEST', 'Yêu cầu đã được thay đổi. Vui lòng tải lại trước khi lưu.');

function rootErrorMessage(error: unknown): string {
  let cause = error;
  while (cause instanceof Error && cause.cause !== undefined) cause = cause.cause;
  return cause instanceof Error ? cause.message : String(cause);
}

async function requireKnownSubject(db: Db, subjectId: string): Promise<void> {
  if (!(await repo.subjectExists(db, subjectId))) {
    throw new AppError(422, 'UNKNOWN_SUBJECT', 'Môn học không tồn tại.', [{ path: 'subjectId' }]);
  }
}

/** The stage is implied by the grade; clients may omit it. Schema refinement rejects a mismatch. */
function withEducationLevel<T extends CreateParentRequestInput>(input: T): T {
  return { ...input, educationLevel: input.educationLevel ?? educationLevelForGrade(input.grade) };
}

function serverCode(): string {
  return `YC-${crypto.randomUUID().replaceAll('-', '').slice(0, 12).toUpperCase()}`;
}

function classCode(): string {
  return `LH-${crypto.randomUUID().replaceAll('-', '').slice(0, 12).toUpperCase()}`;
}

export async function createDraft(
  db: Db,
  parentId: string,
  input: CreateParentRequestInput,
  now = new Date(),
  extraStatements: (id: string) => {
    before: BatchItem<'sqlite'>[];
    after: BatchItem<'sqlite'>[];
  } = () => ({ before: [], after: [] }),
): Promise<OwnParentRequest> {
  await requireKnownSubject(db, input.subjectId);
  for (let attempt = 0; attempt < 3; attempt++) {
    const id = crypto.randomUUID();
    try {
      await repo.insertRequest(
        db,
        {
          id,
          code: serverCode(),
          parentId,
          mutationId: crypto.randomUUID(),
          now: now.toISOString(),
        },
        withEducationLevel(input),
        extraStatements(id),
      );
      return getOwn(db, parentId, id);
    } catch (error) {
      if (isUniqueViolation(error, 'parent_requests.code')) continue;
      if (rootErrorMessage(error).includes('REQUEST_QUOTA_EXCEEDED')) {
        throw new AppError(409, 'REQUEST_QUOTA_EXCEEDED', 'Bạn đã có quá nhiều yêu cầu đang mở.');
      }
      throw error;
    }
  }
  throw new AppError(409, 'REQUEST_CODE_CONFLICT', 'Không thể cấp mã yêu cầu. Vui lòng thử lại.');
}

export async function getOwn(db: Db, parentId: string, id: string): Promise<OwnParentRequest> {
  const request = await repo.findOwnRequest(db, parentId, id);
  if (!request) throw notFound();
  return request;
}

export function listOwn(
  db: Db,
  parentId: string,
  query: ParentRequestListQuery,
): Promise<Page<ParentRequestListItem>> {
  return repo.listOwnRequests(db, parentId, query);
}

export async function updateOwn(
  db: Db,
  parentId: string,
  id: string,
  input: UpdateParentRequestInput,
  now = new Date(),
): Promise<OwnParentRequest> {
  const current = await getOwn(db, parentId, id);
  if (current.status !== 'draft' && current.status !== 'submitted') throw stale();
  if (current.version !== input.version) throw stale();
  if (current.status === 'submitted' && input.contactPhone === null) {
    throw new AppError(422, 'CONTACT_REQUIRED', 'Yêu cầu đã gửi cần số điện thoại liên hệ.');
  }
  if (input.area !== null && input.area !== current.area && !isHanoiCatalogArea(input.area)) {
    throw new AppError(
      422,
      'VALIDATION_ERROR',
      'Chọn phường/xã thuộc Hà Nội theo danh mục hiện hành.',
      [{ path: 'area', message: 'Chọn phường/xã thuộc Hà Nội theo danh mục hiện hành.' }],
    );
  }
  await requireKnownSubject(db, input.subjectId);
  if (
    !(await repo.updateOwnRequest(db, parentId, id, withEducationLevel(input), now.toISOString()))
  )
    throw stale();
  return getOwn(db, parentId, id);
}

export async function submitOwn(
  db: Db,
  parentId: string,
  id: string,
  version: number,
  now = new Date(),
): Promise<OwnParentRequest> {
  const current = await getOwn(db, parentId, id);
  if (current.status !== 'draft' || current.version !== version) throw stale();
  if (!current.contactPhone) {
    throw new AppError(422, 'CONTACT_REQUIRED', 'Cần số điện thoại liên hệ trước khi gửi yêu cầu.');
  }
  if (!current.studentName) {
    throw new AppError(
      422,
      'STUDENT_NAME_REQUIRED',
      'Cần họ và tên học sinh trước khi gửi yêu cầu.',
      [{ path: 'studentName' }],
    );
  }
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const published = await repo.submitAndPublishOwnRequest(
        db,
        parentId,
        id,
        version,
        current,
        { id: crypto.randomUUID(), code: classCode() },
        now.toISOString(),
        CONTACT_SHARING_CONSENT_VERSION,
      );
      if (!published) throw stale();
      return getOwn(db, parentId, id);
    } catch (error) {
      if (isUniqueViolation(error, 'class_listings.code')) continue;
      if (isUniqueViolation(error, 'class_listings.source_request_id')) throw stale();
      if (rootErrorMessage(error).includes('CLASS_SOURCE_INVALID')) throw stale();
      throw error;
    }
  }
  throw new AppError(409, 'CLASS_CODE_CONFLICT', 'Không thể cấp mã lớp. Vui lòng thử lại.');
}
