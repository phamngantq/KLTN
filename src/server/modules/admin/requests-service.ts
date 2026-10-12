import { and, asc, count, desc, eq, inArray, ne } from 'drizzle-orm';
import { z } from 'zod';
import {
  ADMIN_REQUEST_STATUSES,
  type AdminRequestDetail,
  type AdminRequestSummary,
} from '../../../shared/schemas/admin-requests';
import type { Page } from '../../../shared/schemas/discovery';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '../../../shared/schemas/discovery';
import type { ParentRequestSummary } from '../../../shared/schemas/requests';
import type { Db } from '../../db/client';
import { parentRequests, requestScheduleWindows, subjects, users } from '../../db/schema';
import { AppError } from '../../lib/errors';
import { findOwnRequest } from '../parents/requests-repository';

/** Drafts have no sharing consent and are deliberately absent from the moderator queue. */
export const adminRequestListSchema = z.strictObject({
  status: z.enum(ADMIN_REQUEST_STATUSES).optional(),
  page: z.coerce.number().int().min(1).max(1000).default(1),
  pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
});
export type AdminRequestListQuery = z.infer<typeof adminRequestListSchema>;

const summaryColumns = {
  id: parentRequests.id,
  code: parentRequests.code,
  subjectId: parentRequests.subjectId,
  subjectName: subjects.name,
  grade: parentRequests.grade,
  mode: parentRequests.mode,
  area: parentRequests.area,
  expectedBudgetMinor: parentRequests.expectedBudgetMinor,
  description: parentRequests.description,
  educationLevel: parentRequests.educationLevel,
  sessionsPerWeek: parentRequests.sessionsPerWeek,
  tutorRequirements: parentRequests.tutorRequirements,
  studentTraits: parentRequests.studentTraits,
  status: parentRequests.status,
  version: parentRequests.version,
  timezone: parentRequests.timezone,
  discussLater: parentRequests.discussLater,
  createdAt: parentRequests.createdAt,
  updatedAt: parentRequests.updatedAt,
};

/** Moderator list projection contains no phone, address or consent metadata. */
export async function listRequests(
  db: Db,
  query: AdminRequestListQuery,
): Promise<Page<AdminRequestSummary>> {
  const where = and(
    ne(parentRequests.status, 'draft'),
    query.status ? eq(parentRequests.status, query.status) : undefined,
  );
  const [rows, totals] = await Promise.all([
    db
      .select(summaryColumns)
      .from(parentRequests)
      .innerJoin(subjects, eq(subjects.id, parentRequests.subjectId))
      .where(where)
      .orderBy(desc(parentRequests.createdAt), asc(parentRequests.id))
      .limit(query.pageSize)
      .offset((query.page - 1) * query.pageSize)
      .all(),
    db.select({ total: count() }).from(parentRequests).where(where).all(),
  ]);
  const ids = rows.map(({ id }) => id);
  const windows = ids.length
    ? await db
        .select({
          requestId: requestScheduleWindows.requestId,
          weekday: requestScheduleWindows.weekday,
          startLocal: requestScheduleWindows.startLocal,
          endLocal: requestScheduleWindows.endLocal,
        })
        .from(requestScheduleWindows)
        .where(inArray(requestScheduleWindows.requestId, ids))
        .orderBy(asc(requestScheduleWindows.weekday), asc(requestScheduleWindows.startLocal))
        .all()
    : [];
  const byRequest = new Map<string, ParentRequestSummary['schedule']['windows']>();
  for (const { requestId, ...window } of windows) {
    const group = byRequest.get(requestId) ?? [];
    group.push(window);
    byRequest.set(requestId, group);
  }
  return {
    items: rows.map(({ timezone, discussLater, ...row }) => ({
      ...row,
      schedule: { timezone, discussLater, windows: byRequest.get(row.id) ?? [] },
    })),
    page: query.page,
    pageSize: query.pageSize,
    total: totals[0]?.total ?? 0,
  };
}

/** Moderator-only private projection; a parent's unsubmitted draft is never readable here. */
export async function getRequest(db: Db, id: string): Promise<AdminRequestDetail> {
  const owner = await db
    .select({
      parentUserId: parentRequests.parentUserId,
      parentDisplayName: users.displayName,
      status: parentRequests.status,
    })
    .from(parentRequests)
    .innerJoin(users, eq(users.id, parentRequests.parentUserId))
    .where(eq(parentRequests.id, id))
    .get();
  if (!owner || owner.status === 'draft') {
    throw new AppError(404, 'REQUEST_NOT_FOUND', 'Không tìm thấy yêu cầu.');
  }
  const request = await findOwnRequest(db, owner.parentUserId, id);
  if (!request) throw new AppError(404, 'REQUEST_NOT_FOUND', 'Không tìm thấy yêu cầu.');
  return {
    ...request,
    parentUserId: owner.parentUserId,
    parentDisplayName: owner.parentDisplayName,
  };
}
