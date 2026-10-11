import { and, asc, count, desc, eq, exists, inArray, isNotNull, sql } from 'drizzle-orm';
import type { BatchItem } from 'drizzle-orm/batch';
import type { Page } from '../../../shared/schemas/discovery';
import type {
  CreateParentRequestInput,
  OwnParentRequest,
  ParentRequestListQuery,
  ParentRequestSummary,
  UpdateParentRequestInput,
} from '../../../shared/schemas/requests';
import type { Db } from '../../db/client';
import {
  auditLogs,
  classAssignments,
  classCancellations,
  classListings,
  parentRequestPrivate,
  parentRequests,
  requestScheduleWindows,
  subjects,
} from '../../db/schema';

const publicColumns = {
  id: parentRequests.id,
  code: parentRequests.code,
  subjectId: parentRequests.subjectId,
  subjectName: subjects.name,
  grade: parentRequests.grade,
  mode: parentRequests.mode,
  area: parentRequests.area,
  expectedBudgetMinor: parentRequests.expectedBudgetMinor,
  description: parentRequests.description,
  status: parentRequests.status,
  version: parentRequests.version,
  timezone: parentRequests.timezone,
  discussLater: parentRequests.discussLater,
  createdAt: parentRequests.createdAt,
  updatedAt: parentRequests.updatedAt,
};

type PublicRow = Omit<ParentRequestSummary, 'schedule'> & {
  timezone: string;
  discussLater: boolean;
};

function summary(
  row: PublicRow,
  windows: OwnParentRequest['schedule']['windows'],
): ParentRequestSummary {
  const { timezone, discussLater, ...fields } = row;
  return { ...fields, schedule: { timezone, discussLater, windows } };
}

export async function subjectExists(db: Db, id: string): Promise<boolean> {
  return !!(await db.select({ id: subjects.id }).from(subjects).where(eq(subjects.id, id)).get());
}

export async function insertRequest(
  db: Db,
  request: { id: string; code: string; parentId: string; mutationId: string; now: string },
  input: CreateParentRequestInput,
  extra: { before: BatchItem<'sqlite'>[]; after: BatchItem<'sqlite'>[] } = {
    before: [],
    after: [],
  },
): Promise<void> {
  const statements: BatchItem<'sqlite'>[] = [
    ...extra.before,
    db.insert(parentRequests).values({
      id: request.id,
      code: request.code,
      parentUserId: request.parentId,
      subjectId: input.subjectId,
      grade: input.grade,
      mode: input.mode,
      area: input.area,
      expectedBudgetMinor: input.expectedBudgetMinor,
      description: input.description,
      status: 'draft',
      version: 1,
      mutationId: request.mutationId,
      timezone: input.schedule.timezone,
      discussLater: input.schedule.discussLater,
      createdAt: request.now,
      updatedAt: request.now,
    }),
    db.insert(parentRequestPrivate).values({
      requestId: request.id,
      contactPhone: input.contactPhone,
      contactAddress: input.contactAddress,
    }),
    ...input.schedule.windows.map((window) =>
      db.insert(requestScheduleWindows).values({
        requestId: request.id,
        weekday: window.weekday,
        startLocal: window.startLocal,
        endLocal: window.endLocal,
        timezone: input.schedule.timezone,
      }),
    ),
    db.insert(auditLogs).values({
      id: crypto.randomUUID(),
      actorId: request.parentId,
      action: 'parent_request.created',
      targetType: 'parent_request',
      targetId: request.id,
      metadata: JSON.stringify({ to: 'draft', version: 1 }),
      createdAt: request.now,
    }),
    ...extra.after,
  ];
  await db.batch(statements as [BatchItem<'sqlite'>, ...BatchItem<'sqlite'>[]]);
}

export async function findOwnRequest(
  db: Db,
  parentId: string,
  id: string,
): Promise<OwnParentRequest | null> {
  const row = await db
    .select({
      ...publicColumns,
      contactPhone: parentRequestPrivate.contactPhone,
      contactAddress: parentRequestPrivate.contactAddress,
      contactConsentAt: parentRequestPrivate.contactConsentAt,
      contactConsentVersion: parentRequestPrivate.contactConsentVersion,
    })
    .from(parentRequests)
    .innerJoin(subjects, eq(subjects.id, parentRequests.subjectId))
    .innerJoin(parentRequestPrivate, eq(parentRequestPrivate.requestId, parentRequests.id))
    .where(and(eq(parentRequests.id, id), eq(parentRequests.parentUserId, parentId)))
    .get();
  if (!row) return null;
  const windows = await db
    .select({
      weekday: requestScheduleWindows.weekday,
      startLocal: requestScheduleWindows.startLocal,
      endLocal: requestScheduleWindows.endLocal,
    })
    .from(requestScheduleWindows)
    .where(eq(requestScheduleWindows.requestId, id))
    .orderBy(asc(requestScheduleWindows.weekday), asc(requestScheduleWindows.startLocal))
    .all();
  const cancellation = await db
    .select({ reason: classCancellations.reason })
    .from(classListings)
    .innerJoin(classCancellations, eq(classCancellations.classId, classListings.id))
    .where(eq(classListings.sourceRequestId, id))
    .get();
  const publishedClass = await db
    .select({ id: classListings.id, code: classListings.code })
    .from(classListings)
    .where(and(eq(classListings.sourceRequestId, id), eq(classListings.status, 'open')))
    .get();
  const currentTuition = await db
    .select({ agreedTuitionPerSessionMinor: classAssignments.agreedTuitionPerSessionMinor })
    .from(classListings)
    .innerJoin(classAssignments, eq(classAssignments.classId, classListings.id))
    .where(
      and(
        eq(classListings.sourceRequestId, id),
        eq(classAssignments.status, 'active'),
        inArray(classListings.status, ['active', 'completed']),
      ),
    )
    .get();
  const { contactPhone, contactAddress, contactConsentAt, contactConsentVersion, ...publicRow } =
    row;
  return {
    ...summary(publicRow, windows),
    publishedClassId: publishedClass?.id ?? null,
    publishedClassCode: publishedClass?.code ?? null,
    agreedTuitionPerSessionMinor: currentTuition?.agreedTuitionPerSessionMinor ?? null,
    contactPhone,
    contactAddress,
    contactConsentAt,
    contactConsentVersion,
    cancellationReason: cancellation?.reason ?? null,
  };
}

export async function listOwnRequests(
  db: Db,
  parentId: string,
  query: ParentRequestListQuery,
): Promise<Page<ParentRequestSummary>> {
  const where = and(
    eq(parentRequests.parentUserId, parentId),
    query.status ? eq(parentRequests.status, query.status) : undefined,
  );
  const [rows, totals] = await Promise.all([
    db
      .select(publicColumns)
      .from(parentRequests)
      .innerJoin(subjects, eq(subjects.id, parentRequests.subjectId))
      .where(where)
      .orderBy(desc(parentRequests.createdAt), asc(parentRequests.id))
      .limit(query.pageSize)
      .offset((query.page - 1) * query.pageSize)
      .all(),
    db.select({ total: count() }).from(parentRequests).where(where).all(),
  ]);
  const ids = rows.map((row) => row.id);
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
  const byRequest = new Map<string, OwnParentRequest['schedule']['windows']>();
  for (const { requestId, ...window } of windows) {
    const list = byRequest.get(requestId) ?? [];
    list.push(window);
    byRequest.set(requestId, list);
  }
  return {
    items: rows.map((row) => summary(row, byRequest.get(row.id) ?? [])),
    page: query.page,
    pageSize: query.pageSize,
    total: totals[0]?.total ?? 0,
  };
}

function wasCommitted(db: Db, id: string, mutationId: string) {
  return exists(
    db
      .select({ one: sql`1` })
      .from(parentRequests)
      .where(and(eq(parentRequests.id, id), eq(parentRequests.mutationId, mutationId))),
  );
}

/** CAS update plus dependent private/schedule/audit writes in one D1 transaction. */
export async function updateOwnRequest(
  db: Db,
  parentId: string,
  id: string,
  input: UpdateParentRequestInput,
  now: string,
): Promise<boolean> {
  const mutationId = crypto.randomUUID();
  const committed = wasCommitted(db, id, mutationId);
  const updated = db
    .update(parentRequests)
    .set({
      subjectId: input.subjectId,
      grade: input.grade,
      mode: input.mode,
      area: input.area,
      expectedBudgetMinor: input.expectedBudgetMinor,
      description: input.description,
      timezone: input.schedule.timezone,
      discussLater: input.schedule.discussLater,
      version: sql`${parentRequests.version} + 1`,
      mutationId,
      updatedAt: now,
    })
    .where(
      and(
        eq(parentRequests.id, id),
        eq(parentRequests.parentUserId, parentId),
        inArray(parentRequests.status, ['draft', 'submitted']),
        eq(parentRequests.version, input.version),
      ),
    )
    .returning({ id: parentRequests.id });
  const privateUpdate = db
    .update(parentRequestPrivate)
    .set({ contactPhone: input.contactPhone, contactAddress: input.contactAddress })
    .where(and(eq(parentRequestPrivate.requestId, id), committed));
  const clearWindows = db
    .delete(requestScheduleWindows)
    .where(and(eq(requestScheduleWindows.requestId, id), committed));
  const insertWindows = input.schedule.windows.map((window) =>
    db.insert(requestScheduleWindows).select(
      sql`SELECT ${id}, ${window.weekday}, ${window.startLocal}, ${window.endLocal},
          ${input.schedule.timezone} WHERE EXISTS
          (SELECT 1 FROM parent_requests WHERE id = ${id} AND mutation_id = ${mutationId})`,
    ),
  );
  const metadata = JSON.stringify({ version: input.version + 1 });
  const audit = db.insert(auditLogs).select(
    sql`SELECT ${crypto.randomUUID()}, ${parentId}, 'parent_request.updated', 'parent_request',
        ${id}, ${metadata}, ${now} WHERE EXISTS
        (SELECT 1 FROM parent_requests WHERE id = ${id} AND mutation_id = ${mutationId})`,
  );
  const [result] = await db.batch([updated, privateUpdate, clearWindows, ...insertWindows, audit]);
  return result.length === 1;
}

/** Consent, publication and sourcing are one D1 transaction; public area is deliberately omitted. */
export async function submitAndPublishOwnRequest(
  db: Db,
  parentId: string,
  id: string,
  version: number,
  source: Pick<OwnParentRequest, 'subjectId' | 'grade' | 'mode' | 'expectedBudgetMinor'>,
  publishedClass: { id: string; code: string },
  now: string,
  consentVersion: string,
): Promise<boolean> {
  const submittedMutationId = crypto.randomUUID();
  const classMutationId = crypto.randomUUID();
  const sourcingMutationId = crypto.randomUUID();
  const updated = db
    .update(parentRequests)
    .set({
      status: 'submitted',
      version: sql`${parentRequests.version} + 1`,
      mutationId: submittedMutationId,
      updatedAt: now,
    })
    .where(
      and(
        eq(parentRequests.id, id),
        eq(parentRequests.parentUserId, parentId),
        eq(parentRequests.status, 'draft'),
        eq(parentRequests.version, version),
        exists(
          db
            .select({ one: sql`1` })
            .from(parentRequestPrivate)
            .where(
              and(
                eq(parentRequestPrivate.requestId, id),
                isNotNull(parentRequestPrivate.contactPhone),
              ),
            ),
        ),
      ),
    )
    .returning({ id: parentRequests.id });
  const privateUpdate = db
    .update(parentRequestPrivate)
    .set({ contactConsentAt: now, contactConsentVersion: consentVersion })
    .where(and(eq(parentRequestPrivate.requestId, id), wasCommitted(db, id, submittedMutationId)));
  // The existing class source trigger aborts the entire batch if submit or
  // consent did not win, and also checks every snapshot field against D1.
  const classInsert = db.insert(classListings).values({
    id: publishedClass.id,
    code: publishedClass.code,
    sourceRequestId: id,
    sourceRequestVersion: version + 1,
    parentUserId: parentId,
    subjectId: source.subjectId,
    grade: source.grade,
    mode: source.mode,
    publicArea: null,
    expectedBudgetMinor: source.expectedBudgetMinor,
    status: 'open',
    version: 1,
    mutationId: classMutationId,
    publishedAt: now,
    createdAt: now,
    updatedAt: now,
  });
  const sourcing = db
    .update(parentRequests)
    .set({
      status: 'sourcing',
      version: sql`${parentRequests.version} + 1`,
      mutationId: sourcingMutationId,
      updatedAt: now,
    })
    .where(
      and(
        eq(parentRequests.id, id),
        eq(parentRequests.parentUserId, parentId),
        eq(parentRequests.status, 'submitted'),
        eq(parentRequests.version, version + 1),
        sql`EXISTS (SELECT 1 FROM class_listings WHERE id = ${publishedClass.id} AND mutation_id = ${classMutationId} AND status = 'open')`,
      ),
    )
    .returning({ id: parentRequests.id });
  const submittedMetadata = JSON.stringify({
    from: 'draft',
    to: 'submitted',
    version: version + 1,
    contactConsentVersion: consentVersion,
  });
  const submittedAudit = db.insert(auditLogs).select(
    sql`SELECT ${crypto.randomUUID()}, ${parentId}, 'parent_request.submitted', 'parent_request',
        ${id}, ${submittedMetadata}, ${now} WHERE EXISTS
        (SELECT 1 FROM class_listings WHERE id = ${publishedClass.id} AND mutation_id = ${classMutationId})`,
  );
  const createdAudit = db.insert(auditLogs).values({
    id: crypto.randomUUID(),
    actorId: parentId,
    action: 'class.created',
    targetType: 'class_listing',
    targetId: publishedClass.id,
    metadata: JSON.stringify({ from: null, to: 'open', sourceRequestId: id }),
    createdAt: now,
  });
  const publishedAudit = db.insert(auditLogs).values({
    id: crypto.randomUUID(),
    actorId: parentId,
    action: 'class.published',
    targetType: 'class_listing',
    targetId: publishedClass.id,
    metadata: JSON.stringify({ to: 'open', sourceRequestId: id, version: 1 }),
    createdAt: now,
  });
  const sourcingAudit = db.insert(auditLogs).select(
    sql`SELECT ${crypto.randomUUID()}, ${parentId}, 'parent_request.sourcing', 'parent_request',
      ${id}, ${JSON.stringify({ from: 'submitted', to: 'sourcing', classId: publishedClass.id })}, ${now}
      WHERE EXISTS (SELECT 1 FROM parent_requests WHERE id = ${id} AND mutation_id = ${sourcingMutationId})`,
  );
  const [submitResult, , , sourcingResult] = await db.batch([
    updated,
    privateUpdate,
    classInsert,
    sourcing,
    submittedAudit,
    createdAudit,
    publishedAudit,
    sourcingAudit,
  ]);
  return submitResult.length === 1 && sourcingResult.length === 1;
}
