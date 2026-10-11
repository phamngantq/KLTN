import type { BatchItem } from 'drizzle-orm/batch';
import type { Page } from '../../../shared/schemas/discovery';
import type {
  AdminClass,
  ClassSearchQuery,
  CreateClassInput,
  CreateFeeOptionInput,
  FeeOptionVersion,
  PublicClass,
  TutorApplication,
  ApplyClassInput,
  RefreshClassInput,
} from '../../../shared/schemas/classes';
import type { Db } from '../../db/client';
import { AppError, isUniqueViolation } from '../../lib/errors';
import { assertTutorTermsReady } from '../terms-contracts/service';
import * as repo from './repository';

const classNotFound = () => new AppError(404, 'CLASS_NOT_FOUND', 'Không tìm thấy lớp học.');
const classStale = () => new AppError(409, 'STALE_CLASS', 'Lớp đã thay đổi. Vui lòng tải lại.');
const feeNotFound = () =>
  new AppError(404, 'FEE_OPTION_NOT_FOUND', 'Không tìm thấy phương án phí.');

function rootMessage(error: unknown): string {
  let cause = error;
  while (cause instanceof Error && cause.cause !== undefined) cause = cause.cause;
  return cause instanceof Error ? cause.message : String(cause);
}

export function searchClasses(db: Db, query: ClassSearchQuery): Promise<Page<PublicClass>> {
  return repo.searchPublicClasses(db, query);
}

export async function getPublicClass(db: Db, id: string): Promise<PublicClass> {
  return (await repo.findPublicClass(db, id)) ?? Promise.reject(classNotFound());
}

export async function getAdminClass(db: Db, id: string): Promise<AdminClass> {
  return (await repo.findAdminClass(db, id)) ?? Promise.reject(classNotFound());
}

export function listAdminClasses(
  db: Db,
  query: { status?: AdminClass['status']; page: number; pageSize: number },
) {
  return repo.listAdminClasses(db, query);
}

function classCode(): string {
  return `LH-${crypto.randomUUID().replaceAll('-', '').slice(0, 12).toUpperCase()}`;
}

export async function createClass(
  db: Db,
  moderatorId: string,
  input: CreateClassInput,
  now = new Date(),
): Promise<AdminClass> {
  const source = await repo.sourceRequest(db, input.sourceRequestId);
  if (!source) throw new AppError(404, 'REQUEST_NOT_FOUND', 'Không tìm thấy yêu cầu nguồn.');
  if (
    source.status !== 'submitted' ||
    source.version !== input.requestVersion ||
    !source.contactConsentAt ||
    !source.contactConsentVersion
  ) {
    throw new AppError(
      409,
      'REQUEST_NOT_READY',
      'Yêu cầu đã thay đổi hoặc chưa sẵn sàng xuất bản.',
    );
  }
  for (let attempt = 0; attempt < 3; attempt++) {
    const id = crypto.randomUUID();
    try {
      await repo.insertClass(db, moderatorId, input, source, id, classCode(), now.toISOString());
      return getAdminClass(db, id);
    } catch (error) {
      if (isUniqueViolation(error, 'class_listings.code')) continue;
      if (isUniqueViolation(error, 'class_listings.source_request_id')) {
        throw new AppError(409, 'CLASS_ALREADY_EXISTS', 'Yêu cầu này đã có lớp học.');
      }
      if (rootMessage(error).includes('CLASS_SOURCE_INVALID')) {
        throw new AppError(
          409,
          'REQUEST_NOT_READY',
          'Yêu cầu đã thay đổi hoặc chưa sẵn sàng xuất bản.',
        );
      }
      throw error;
    }
  }
  throw new AppError(409, 'CLASS_CODE_CONFLICT', 'Không thể cấp mã lớp. Vui lòng thử lại.');
}

export async function publishClass(
  db: Db,
  moderatorId: string,
  id: string,
  version: number,
  now = new Date(),
): Promise<AdminClass> {
  const cls = await getAdminClass(db, id);
  if (cls.status !== 'draft' || cls.version !== version) throw classStale();
  if (
    !(await repo.publishClass(
      db,
      moderatorId,
      id,
      version,
      cls.sourceRequestId,
      cls.sourceRequestVersion,
      now.toISOString(),
    ))
  )
    throw classStale();
  return getAdminClass(db, id);
}

export async function refreshClass(
  db: Db,
  moderatorId: string,
  id: string,
  input: RefreshClassInput,
  now = new Date(),
): Promise<AdminClass> {
  const cls = await getAdminClass(db, id);
  if (cls.status !== 'draft' || cls.version !== input.version) throw classStale();
  const source = await repo.sourceRequest(db, cls.sourceRequestId);
  if (
    !source ||
    source.status !== 'submitted' ||
    source.version !== input.requestVersion ||
    !source.contactConsentAt ||
    !source.contactConsentVersion
  ) {
    throw new AppError(
      409,
      'REQUEST_NOT_READY',
      'Yêu cầu đã thay đổi hoặc chưa sẵn sàng xuất bản.',
    );
  }
  if (!(await repo.refreshClass(db, moderatorId, cls, source, input, now.toISOString()))) {
    throw classStale();
  }
  return getAdminClass(db, id);
}

export async function matchedClasses(
  db: Db,
  tutorId: string,
  query: ClassSearchQuery,
): Promise<Page<PublicClass>> {
  if (!(await repo.tutorEligible(db, tutorId))) {
    throw new AppError(403, 'TUTOR_NOT_APPROVED', 'Hồ sơ gia sư chưa được duyệt.');
  }
  return repo.searchPublicClasses(db, query, tutorId);
}

export function listFeeOptions(db: Db): Promise<FeeOptionVersion[]> {
  return repo.listFeeOptions(db);
}

/** Current, effective public policy revisions, one per key and exact scope. */
export async function listPublishedFeeOptions(
  d1: D1Database,
  now = new Date(),
): Promise<FeeOptionVersion[]> {
  const instant = now.toISOString();
  const rows = await d1
    .prepare(
      `WITH eligible AS (
    SELECT id, option_key, version, title, policy_text, rate_basis_points,
      deposit_basis_points, scope_subject_id, scope_mode, status,
      effective_from, effective_to, published_at,
      row_number() OVER (PARTITION BY option_key, coalesce(scope_subject_id, ''),
        coalesce(scope_mode, '') ORDER BY version DESC) AS rank
    FROM fee_option_versions WHERE status = 'published' AND published_at <= ?
      AND (effective_from IS NULL OR effective_from <= ?)
      AND (effective_to IS NULL OR effective_to > ?)
  ) SELECT * FROM eligible WHERE rank = 1 ORDER BY option_key, scope_subject_id, scope_mode LIMIT 100`,
    )
    .bind(instant, instant, instant)
    .all<{
      id: string;
      option_key: FeeOptionVersion['optionKey'];
      version: number;
      title: string;
      policy_text: string;
      rate_basis_points: number;
      deposit_basis_points: number | null;
      scope_subject_id: string | null;
      scope_mode: FeeOptionVersion['scopeMode'];
      status: 'published';
      effective_from: string | null;
      effective_to: string | null;
      published_at: string;
    }>();
  return rows.results.map((row) => ({
    id: row.id,
    optionKey: row.option_key,
    version: row.version,
    title: row.title,
    policyText: row.policy_text,
    rateBasisPoints: row.rate_basis_points,
    depositBasisPoints: row.deposit_basis_points,
    scopeSubjectId: row.scope_subject_id,
    scopeMode: row.scope_mode,
    status: row.status,
    effectiveFrom: row.effective_from,
    effectiveTo: row.effective_to,
    publishedAt: row.published_at,
  }));
}

export async function createFeeOption(
  db: Db,
  moderatorId: string,
  input: CreateFeeOptionInput,
  now = new Date(),
): Promise<FeeOptionVersion> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const id = crypto.randomUUID();
    const version = await repo.nextFeeVersion(db, input.optionKey);
    try {
      await repo.insertFeeOption(db, moderatorId, input, id, version, now.toISOString());
      return (await repo.getFeeOption(db, id))!;
    } catch (error) {
      if (isUniqueViolation(error, 'fee_option_versions.option_key')) continue;
      throw error;
    }
  }
  throw new AppError(
    409,
    'FEE_VERSION_CONFLICT',
    'Phương án phí vừa được cập nhật. Vui lòng thử lại.',
  );
}

export async function publishFeeOption(
  db: Db,
  moderatorId: string,
  id: string,
  version: number,
  now = new Date(),
): Promise<FeeOptionVersion> {
  const option = await repo.getFeeOption(db, id);
  if (!option) throw feeNotFound();
  if (option.status !== 'draft' || option.version !== version) {
    throw new AppError(409, 'STALE_FEE_OPTION', 'Phương án phí đã được công bố hoặc thay đổi.');
  }
  if (option.effectiveTo && option.effectiveTo <= now.toISOString()) {
    throw new AppError(
      409,
      'FEE_OPTION_EXPIRED',
      'Thời hạn áp dụng của phương án phí đã kết thúc.',
    );
  }
  if (!(await repo.publishFeeOption(db, moderatorId, id, version, now.toISOString()))) {
    throw new AppError(409, 'STALE_FEE_OPTION', 'Phương án phí đã được công bố hoặc thay đổi.');
  }
  return (await repo.getFeeOption(db, id))!;
}

export async function availableFeeOptions(
  db: Db,
  tutorId: string,
  classId: string,
  now = new Date(),
): Promise<FeeOptionVersion[]> {
  if (!(await repo.tutorEligible(db, tutorId))) {
    throw new AppError(403, 'TUTOR_NOT_APPROVED', 'Hồ sơ gia sư chưa được duyệt.');
  }
  await getPublicClass(db, classId);
  return repo.availableFeeOptions(db, classId, now.toISOString());
}

export async function applyToClass(
  db: Db,
  d1: D1Database,
  tutorId: string,
  classId: string,
  input: ApplyClassInput,
  now = new Date(),
  extraStatements: (id: string) => {
    before: BatchItem<'sqlite'>[];
    after: BatchItem<'sqlite'>[];
  } = () => ({ before: [], after: [] }),
): Promise<TutorApplication> {
  if (!(await repo.tutorEligible(db, tutorId))) {
    throw new AppError(403, 'TUTOR_NOT_APPROVED', 'Hồ sơ gia sư chưa được duyệt.');
  }
  const cls = await getPublicClass(db, classId);
  if (cls.version !== input.classVersion) throw classStale();
  if (!(await repo.tutorMatchesClass(db, tutorId, classId))) {
    throw new AppError(
      403,
      'CLASS_NOT_ELIGIBLE',
      'Chuyên môn hoặc hình thức dạy không phù hợp với lớp.',
    );
  }
  const options = await repo.availableFeeOptions(db, classId, now.toISOString());
  if (options.length < 3) {
    throw new AppError(
      409,
      'FEE_OPTIONS_UNAVAILABLE',
      'Cần công bố đủ ba phương án phí áp dụng cho lớp này.',
    );
  }
  if (!options.some((option) => option.id === input.feeOptionVersionId)) {
    throw new AppError(
      409,
      'FEE_OPTION_UNAVAILABLE',
      'Phương án phí đã thay đổi hoặc không phù hợp.',
    );
  }
  await assertTutorTermsReady(d1, tutorId);
  const id = crypto.randomUUID();
  try {
    await repo.insertApplication(
      db,
      tutorId,
      classId,
      input.feeOptionVersionId,
      id,
      input.classVersion,
      now.toISOString(),
      extraStatements(id),
    );
  } catch (error) {
    if (isUniqueViolation(error, 'tutor_applications.class_id')) {
      throw new AppError(409, 'APPLICATION_EXISTS', 'Bạn đã ứng tuyển lớp này.');
    }
    if (rootMessage(error).includes('APPLICATION_NOT_ELIGIBLE')) {
      throw new AppError(
        409,
        'APPLICATION_NOT_ELIGIBLE',
        'Lớp hoặc phương án phí đã thay đổi. Vui lòng tải lại.',
      );
    }
    if (rootMessage(error).includes('APPLICATION_POLICY_NOT_READY')) {
      throw new AppError(
        409,
        'APPLICATION_POLICY_NOT_READY',
        'Điều khoản hoặc ba phương án phí đã thay đổi. Vui lòng tải lại.',
      );
    }
    if (
      rootMessage(error).includes('CHECK constraint failed') &&
      rootMessage(error).includes('tutor_applications')
    ) {
      throw classStale();
    }
    throw error;
  }
  return getOwnApplication(db, tutorId, id);
}

export async function getOwnApplication(
  db: Db,
  tutorId: string,
  id: string,
): Promise<TutorApplication> {
  return (
    (await repo.findOwnApplication(db, tutorId, id)) ??
    Promise.reject(new AppError(404, 'APPLICATION_NOT_FOUND', 'Không tìm thấy ứng tuyển.'))
  );
}

export function listOwnApplications(
  db: Db,
  tutorId: string,
  query: {
    status?: TutorApplication['status'];
    page: number;
    pageSize: number;
  },
): Promise<Page<TutorApplication>> {
  return repo.listOwnApplications(db, tutorId, query);
}

export async function withdrawApplication(
  db: Db,
  tutorId: string,
  id: string,
  version: number,
  now = new Date(),
): Promise<TutorApplication> {
  const application = await getOwnApplication(db, tutorId, id);
  if (application.status !== 'submitted' || application.version !== version) {
    throw new AppError(409, 'STALE_APPLICATION', 'Ứng tuyển đã thay đổi. Vui lòng tải lại.');
  }
  if (!(await repo.withdrawApplication(db, tutorId, id, version, now.toISOString()))) {
    throw new AppError(409, 'STALE_APPLICATION', 'Ứng tuyển đã thay đổi. Vui lòng tải lại.');
  }
  return getOwnApplication(db, tutorId, id);
}
