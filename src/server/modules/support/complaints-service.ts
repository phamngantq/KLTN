import { and, count, desc, eq, gte, inArray, lt, ne, or, sql } from 'drizzle-orm';
import type { BatchItem } from 'drizzle-orm/batch';
import type { Page } from '../../../shared/schemas/discovery';
import {
  COMPLAINT_GROUPS,
  COMPLAINT_STATUSES,
  type AdminComplaintDetail,
  type AdminComplaintListQuery,
  type AdminComplaintSummary,
  type ComplaintCounts,
  type ComplaintDetail,
  type ComplaintListQuery,
  type ComplaintStatus,
  type CreateComplaintInput,
  type OwnComplaintSummary,
  type UpdateComplaintDraftInput,
} from '../../../shared/schemas/complaints';
import type { Db } from '../../db/client';
import { auditLogs, classListings, complaints, users } from '../../db/schema';
import { AppError, isUniqueViolation } from '../../lib/errors';

const notFound = () => new AppError(404, 'COMPLAINT_NOT_FOUND', 'Không tìm thấy khiếu nại.');
const stale = () =>
  new AppError(409, 'STALE_COMPLAINT', 'Khiếu nại đã thay đổi. Vui lòng tải lại.');
const quotaExceeded = () =>
  new AppError(409, 'COMPLAINT_QUOTA_EXCEEDED', 'Bạn đã có quá nhiều khiếu nại chưa xử lý.');

const summaryColumns = {
  id: complaints.id,
  code: complaints.code,
  classId: complaints.classId,
  title: complaints.title,
  status: complaints.status,
  version: complaints.version,
  createdAt: complaints.createdAt,
  updatedAt: complaints.updatedAt,
  submittedAt: complaints.submittedAt,
  resolvedAt: complaints.resolvedAt,
};

function code(): string {
  return `KN-${crypto.randomUUID().replaceAll('-', '').slice(0, 12).toUpperCase()}`;
}

function rootMessage(error: unknown): string {
  let cause = error;
  while (cause instanceof Error && cause.cause !== undefined) cause = cause.cause;
  return cause instanceof Error ? cause.message : String(cause);
}

/** UTC instant of local midnight in Asia/Ho_Chi_Minh (UTC+7, no DST) for a YYYY-MM-DD date. */
function localDayStartUtc(date: string, addDays = 0): string {
  const start = new Date(`${date}T00:00:00.000+07:00`);
  start.setUTCDate(start.getUTCDate() + addDays);
  return start.toISOString();
}

/** A related class is accepted only when the author belongs to that class workflow. */
async function assertClassParticipant(db: Db, userId: string, classId: string): Promise<void> {
  const row = await db
    .select({ id: classListings.id })
    .from(classListings)
    .where(
      and(
        eq(classListings.id, classId),
        or(
          eq(classListings.parentUserId, userId),
          sql`EXISTS (SELECT 1 FROM tutor_applications a
            WHERE a.class_id = ${classListings.id} AND a.tutor_user_id = ${userId})`,
        ),
      ),
    )
    .get();
  if (!row) throw new AppError(404, 'CLASS_NOT_FOUND', 'Không tìm thấy lớp được phép liên kết.');
}

export async function createComplaint(
  db: Db,
  userId: string,
  input: CreateComplaintInput,
  extraStatements: (id: string) => {
    before: BatchItem<'sqlite'>[];
    after: BatchItem<'sqlite'>[];
  } = () => ({ before: [], after: [] }),
): Promise<ComplaintDetail> {
  if (input.classId) await assertClassParticipant(db, userId, input.classId);
  const now = new Date().toISOString();
  const status = input.submit ? 'submitted' : 'draft';
  for (let attempt = 0; attempt < 3; attempt++) {
    const id = crypto.randomUUID();
    const audit = db.insert(auditLogs).values({
      id: crypto.randomUUID(),
      actorId: userId,
      action: input.submit ? 'complaint.submitted' : 'complaint.draft_created',
      targetType: 'complaint',
      targetId: id,
      metadata: JSON.stringify({ to: status, classId: input.classId }),
      createdAt: now,
    });
    const extra = extraStatements(id);
    try {
      await db.batch([
        ...extra.before,
        db.insert(complaints).values({
          id,
          code: code(),
          creatorUserId: userId,
          classId: input.classId,
          title: input.title,
          body: input.body,
          status,
          version: 1,
          submittedAt: input.submit ? now : null,
          mutationId: crypto.randomUUID(),
          createdAt: now,
          updatedAt: now,
        }),
        audit,
        ...extra.after,
      ] as [BatchItem<'sqlite'>, ...BatchItem<'sqlite'>[]]);
      return getOwnComplaint(db, userId, id);
    } catch (error) {
      if (isUniqueViolation(error, 'complaints.code')) continue;
      const message = rootMessage(error);
      if (message.includes('COMPLAINT_QUOTA_EXCEEDED')) throw quotaExceeded();
      if (message.includes('COMPLAINT_DRAFT_QUOTA_EXCEEDED')) {
        throw new AppError(409, 'COMPLAINT_DRAFT_QUOTA_EXCEEDED', 'Bạn đã có quá nhiều bản nháp.');
      }
      throw error;
    }
  }
  throw new AppError(409, 'COMPLAINT_CODE_CONFLICT', 'Không thể cấp mã khiếu nại.');
}

/** Version-checked draft write and its audit in one D1 transaction. */
async function mutateOwnDraft(
  db: Db,
  userId: string,
  id: string,
  version: number,
  action: 'complaint.draft_edited' | 'complaint.submitted',
  set: Partial<typeof complaints.$inferInsert>,
): Promise<void> {
  const current = await getOwnComplaint(db, userId, id);
  if (current.status !== 'draft' || current.version !== version) throw stale();
  const mutationId = crypto.randomUUID();
  const now = new Date().toISOString();
  const update = db
    .update(complaints)
    .set({ ...set, version: sql`${complaints.version} + 1`, mutationId, updatedAt: now })
    .where(
      and(
        eq(complaints.id, id),
        eq(complaints.creatorUserId, userId),
        eq(complaints.status, 'draft'),
        eq(complaints.version, version),
      ),
    )
    .returning({ id: complaints.id });
  const audit = db.insert(auditLogs).select(
    sql`SELECT ${crypto.randomUUID()}, ${userId}, ${action}, 'complaint', ${id},
      ${JSON.stringify({ fromVersion: version })}, ${now}
      WHERE EXISTS (SELECT 1 FROM complaints WHERE id = ${id} AND mutation_id = ${mutationId})`,
  );
  try {
    const [changed] = await db.batch([update, audit]);
    if (changed.length !== 1) throw stale();
  } catch (error) {
    if (rootMessage(error).includes('COMPLAINT_QUOTA_EXCEEDED')) throw quotaExceeded();
    throw error;
  }
}

export async function updateOwnDraft(
  db: Db,
  userId: string,
  id: string,
  input: UpdateComplaintDraftInput,
): Promise<ComplaintDetail> {
  if (input.classId) await assertClassParticipant(db, userId, input.classId);
  await mutateOwnDraft(db, userId, id, input.version, 'complaint.draft_edited', {
    classId: input.classId,
    title: input.title,
    body: input.body,
  });
  return getOwnComplaint(db, userId, id);
}

export async function submitOwnDraft(
  db: Db,
  userId: string,
  id: string,
  version: number,
): Promise<ComplaintDetail> {
  await mutateOwnDraft(db, userId, id, version, 'complaint.submitted', {
    status: 'submitted',
    submittedAt: new Date().toISOString(),
  });
  return getOwnComplaint(db, userId, id);
}

/** Unsent drafts only; D1 refuses deleting a sent complaint as well. */
export async function deleteOwnDraft(
  db: Db,
  userId: string,
  id: string,
  version: number,
): Promise<void> {
  const current = await getOwnComplaint(db, userId, id);
  if (current.status !== 'draft' || current.version !== version) throw stale();
  const now = new Date().toISOString();
  const [deleted] = await db.batch([
    db
      .delete(complaints)
      .where(
        and(
          eq(complaints.id, id),
          eq(complaints.creatorUserId, userId),
          eq(complaints.status, 'draft'),
          eq(complaints.version, version),
        ),
      )
      .returning({ id: complaints.id }),
    db.insert(auditLogs).select(
      sql`SELECT ${crypto.randomUUID()}, ${userId}, 'complaint.draft_deleted', 'complaint', ${id},
        ${JSON.stringify({ version })}, ${now}
        WHERE NOT EXISTS (SELECT 1 FROM complaints WHERE id = ${id})`,
    ),
  ]);
  if (deleted.length !== 1) throw stale();
}

export async function listOwnComplaints(
  db: Db,
  userId: string,
  query: ComplaintListQuery,
): Promise<Page<OwnComplaintSummary>> {
  const keyword = query.q ? `%${query.q.replace(/[!%_]/g, (char) => `!${char}`)}%` : null;
  const where = and(
    eq(complaints.creatorUserId, userId),
    query.status ? eq(complaints.status, query.status) : undefined,
    query.group ? inArray(complaints.status, [...COMPLAINT_GROUPS[query.group]]) : undefined,
    query.from ? gte(complaints.createdAt, localDayStartUtc(query.from)) : undefined,
    query.to ? lt(complaints.createdAt, localDayStartUtc(query.to, 1)) : undefined,
    keyword
      ? or(
          sql`${complaints.code} LIKE ${keyword} ESCAPE '!'`,
          sql`${complaints.title} LIKE ${keyword} ESCAPE '!'`,
          sql`${complaints.body} LIKE ${keyword} ESCAPE '!'`,
        )
      : undefined,
  );
  const [items, totals] = await Promise.all([
    db
      .select({ ...summaryColumns, body: complaints.body })
      .from(complaints)
      .where(where)
      .orderBy(desc(complaints.createdAt), desc(complaints.id))
      .limit(query.pageSize)
      .offset((query.page - 1) * query.pageSize)
      .all(),
    db.select({ total: count() }).from(complaints).where(where).all(),
  ]);
  return { items, total: totals[0]?.total ?? 0, page: query.page, pageSize: query.pageSize };
}

export async function countOwnComplaints(db: Db, userId: string): Promise<ComplaintCounts> {
  const rows = await db
    .select({ status: complaints.status, total: count() })
    .from(complaints)
    .where(eq(complaints.creatorUserId, userId))
    .groupBy(complaints.status)
    .all();
  const counts = Object.fromEntries(COMPLAINT_STATUSES.map((status) => [status, 0])) as Record<
    ComplaintStatus,
    number
  >;
  for (const row of rows) counts[row.status] = row.total;
  return counts;
}

export async function getOwnComplaint(
  db: Db,
  userId: string,
  id: string,
): Promise<ComplaintDetail> {
  const item = await db
    .select({ ...summaryColumns, body: complaints.body, resolution: complaints.resolution })
    .from(complaints)
    .where(and(eq(complaints.id, id), eq(complaints.creatorUserId, userId)))
    .get();
  if (!item) throw notFound();
  return item;
}

const adminColumns = {
  ...summaryColumns,
  creatorUserId: complaints.creatorUserId,
  creatorDisplayName: users.displayName,
  creatorDbRole: users.role,
};

function adminSummary<Row extends { creatorDbRole: typeof users.$inferSelect.role }>(row: Row) {
  const { creatorDbRole, ...fields } = row;
  return {
    ...fields,
    creatorRole: creatorDbRole === 'student' ? ('parent' as const) : ('tutor' as const),
  };
}

/** Moderators see sent complaints only; an author's draft stays private. */
export async function listAdminComplaints(
  db: Db,
  query: AdminComplaintListQuery,
): Promise<Page<AdminComplaintSummary>> {
  const where = and(
    ne(complaints.status, 'draft'),
    query.status ? eq(complaints.status, query.status) : undefined,
  );
  const [rows, totals] = await Promise.all([
    db
      .select(adminColumns)
      .from(complaints)
      .innerJoin(users, eq(users.id, complaints.creatorUserId))
      .where(where)
      .orderBy(desc(complaints.submittedAt), desc(complaints.id))
      .limit(query.pageSize)
      .offset((query.page - 1) * query.pageSize)
      .all(),
    db.select({ total: count() }).from(complaints).where(where).all(),
  ]);
  return {
    items: rows.map(adminSummary),
    total: totals[0]?.total ?? 0,
    page: query.page,
    pageSize: query.pageSize,
  };
}

export async function getAdminComplaint(
  db: Db,
  id: string,
  moderatorId?: string,
): Promise<AdminComplaintDetail> {
  const row = await db
    .select({
      ...adminColumns,
      body: complaints.body,
      triageReason: complaints.triageReason,
      resolution: complaints.resolution,
      handledBy: complaints.handledBy,
    })
    .from(complaints)
    .innerJoin(users, eq(users.id, complaints.creatorUserId))
    .where(and(eq(complaints.id, id), ne(complaints.status, 'draft')))
    .get();
  if (!row) throw notFound();
  if (moderatorId) {
    await db.insert(auditLogs).values({
      id: crypto.randomUUID(),
      actorId: moderatorId,
      action: 'complaint.detail_viewed',
      targetType: 'complaint',
      targetId: id,
      metadata: JSON.stringify({ status: row.status }),
      createdAt: new Date().toISOString(),
    });
  }
  return adminSummary(row);
}

async function transition(
  db: Db,
  moderatorId: string,
  id: string,
  version: number,
  from: ComplaintStatus[],
  to: 'in_review' | 'resolved',
  reason: string,
): Promise<AdminComplaintDetail> {
  const current = await getAdminComplaint(db, id);
  if (!from.includes(current.status) || current.version !== version) throw stale();
  const mutationId = crypto.randomUUID();
  const now = new Date().toISOString();
  const update = db
    .update(complaints)
    .set({
      status: to,
      version: sql`${complaints.version} + 1`,
      mutationId,
      handledBy: moderatorId,
      ...(to === 'in_review' ? { triageReason: reason } : { resolution: reason, resolvedAt: now }),
      updatedAt: now,
    })
    .where(
      and(
        eq(complaints.id, id),
        eq(complaints.version, version),
        eq(complaints.status, current.status),
      ),
    )
    .returning({ id: complaints.id });
  const audit = db.insert(auditLogs).select(
    sql`SELECT ${crypto.randomUUID()}, ${moderatorId}, ${`complaint.${to}`},
      'complaint', ${id}, ${JSON.stringify({ from: current.status, to, reasonRecorded: true })}, ${now}
      WHERE EXISTS (SELECT 1 FROM complaints WHERE id = ${id} AND mutation_id = ${mutationId})`,
  );
  const [changed] = await db.batch([update, audit]);
  if (changed.length !== 1) throw stale();
  return getAdminComplaint(db, id);
}

export const triageComplaint = (
  db: Db,
  moderatorId: string,
  id: string,
  version: number,
  reason: string,
) => transition(db, moderatorId, id, version, ['submitted'], 'in_review', reason);

export const resolveComplaint = (
  db: Db,
  moderatorId: string,
  id: string,
  version: number,
  resolution: string,
) => transition(db, moderatorId, id, version, ['submitted', 'in_review'], 'resolved', resolution);
