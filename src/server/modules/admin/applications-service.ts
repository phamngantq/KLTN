import { and, asc, count, desc, eq, sql } from 'drizzle-orm';
import type {
  AdminApplication,
  AdminApplicationListQuery,
} from '../../../shared/schemas/admin-applications';
import type { Page } from '../../../shared/schemas/discovery';
import type { Db } from '../../db/client';
import {
  auditLogs,
  classListings,
  feeOptionVersions,
  parentRequests,
  tutorApplications,
  users,
} from '../../db/schema';
import { AppError } from '../../lib/errors';

const columns = {
  id: tutorApplications.id,
  classId: tutorApplications.classId,
  classCode: classListings.code,
  classStatus: classListings.status,
  classVersion: classListings.version,
  requestVersion: parentRequests.version,
  tutorUserId: tutorApplications.tutorUserId,
  tutorDisplayName: users.displayName,
  feeOptionVersionId: tutorApplications.feeOptionVersionId,
  feeOptionKey: feeOptionVersions.optionKey,
  feeOptionVersion: feeOptionVersions.version,
  feeOptionTitle: feeOptionVersions.title,
  rejectionReason: tutorApplications.rejectionReason,
  status: tutorApplications.status,
  version: tutorApplications.version,
  createdAt: tutorApplications.createdAt,
  updatedAt: tutorApplications.updatedAt,
};

const notFound = () => new AppError(404, 'APPLICATION_NOT_FOUND', 'Không tìm thấy đơn ứng tuyển.');
const stale = () =>
  new AppError(409, 'STALE_APPLICATION', 'Đơn ứng tuyển đã thay đổi. Vui lòng tải lại.');

export async function getApplication(db: Db, id: string): Promise<AdminApplication> {
  const row = await db
    .select(columns)
    .from(tutorApplications)
    .innerJoin(classListings, eq(classListings.id, tutorApplications.classId))
    .innerJoin(parentRequests, eq(parentRequests.id, classListings.sourceRequestId))
    .innerJoin(users, eq(users.id, tutorApplications.tutorUserId))
    .innerJoin(feeOptionVersions, eq(feeOptionVersions.id, tutorApplications.feeOptionVersionId))
    .where(eq(tutorApplications.id, id))
    .get();
  if (!row) throw notFound();
  return row;
}

export async function listApplications(
  db: Db,
  query: AdminApplicationListQuery,
): Promise<Page<AdminApplication>> {
  const where = and(
    query.classId ? eq(tutorApplications.classId, query.classId) : undefined,
    query.status ? eq(tutorApplications.status, query.status) : undefined,
  );
  const [rows, totals] = await Promise.all([
    db
      .select(columns)
      .from(tutorApplications)
      .innerJoin(classListings, eq(classListings.id, tutorApplications.classId))
      .innerJoin(parentRequests, eq(parentRequests.id, classListings.sourceRequestId))
      .innerJoin(users, eq(users.id, tutorApplications.tutorUserId))
      .innerJoin(feeOptionVersions, eq(feeOptionVersions.id, tutorApplications.feeOptionVersionId))
      .where(where)
      .orderBy(desc(tutorApplications.createdAt), asc(tutorApplications.id))
      .limit(query.pageSize)
      .offset((query.page - 1) * query.pageSize)
      .all(),
    db.select({ total: count() }).from(tutorApplications).where(where).all(),
  ]);
  return {
    items: rows,
    page: query.page,
    pageSize: query.pageSize,
    total: totals[0]?.total ?? 0,
  };
}

/** Rejects one submitted application with a reason and audit, guarded by version CAS. */
export async function rejectApplication(
  db: Db,
  moderatorId: string,
  id: string,
  version: number,
  reason: string,
  now = new Date(),
): Promise<AdminApplication> {
  const current = await getApplication(db, id);
  if (current.status !== 'submitted' || current.version !== version) throw stale();
  const mutationId = crypto.randomUUID();
  const nowIso = now.toISOString();
  const update = db
    .update(tutorApplications)
    .set({
      status: 'rejected',
      rejectionReason: reason,
      version: sql`${tutorApplications.version} + 1`,
      mutationId,
      updatedAt: nowIso,
    })
    .where(
      and(
        eq(tutorApplications.id, id),
        eq(tutorApplications.status, 'submitted'),
        eq(tutorApplications.version, version),
      ),
    )
    .returning({ id: tutorApplications.id });
  const metadata = JSON.stringify({
    from: 'submitted',
    to: 'rejected',
    classId: current.classId,
    version: version + 1,
    reason,
  });
  const audit = db.insert(auditLogs).select(
    sql`SELECT ${crypto.randomUUID()}, ${moderatorId}, 'application.rejected',
      'tutor_application', ${id}, ${metadata}, ${nowIso}
      WHERE EXISTS (
        SELECT 1 FROM tutor_applications WHERE id = ${id} AND mutation_id = ${mutationId}
      )`,
  );
  const [updated] = await db.batch([update, audit]);
  if (updated.length !== 1) throw stale();
  return getApplication(db, id);
}
