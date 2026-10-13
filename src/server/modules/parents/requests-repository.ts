import {
  and,
  asc,
  count,
  desc,
  eq,
  exists,
  gte,
  inArray,
  isNotNull,
  lt,
  or,
  sql,
} from 'drizzle-orm';
import type { BatchItem } from 'drizzle-orm/batch';
import type { Page } from '../../../shared/schemas/discovery';
import type {
  CreateParentRequestInput,
  OwnParentRequest,
  ParentRequestListItem,
  ParentRequestListQuery,
  ParentRequestSummary,
  UpdateParentRequestInput,
} from '../../../shared/schemas/requests';
import type {
  LearnerStageCounts,
  ProposedTutor,
  RequestStage,
} from '../../../shared/schemas/requests';
import { assignedTutorFit } from '../classes/matching';
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
  tutorProfiles,
  tutorSubjects,
  users,
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

/** Learner tab of a request; see LEARNER_REQUEST_STAGES. Kept in SQL so lists filter and page on it. */
// Fully qualified on purpose: Drizzle may emit bare column names, which the correlated
// subquery would resolve against class_assignments/class_listings instead.
const stageExpression = sql<RequestStage>`CASE
  WHEN parent_requests.status IN ('submitted', 'sourcing') THEN 'searching'
  WHEN parent_requests.status = 'fulfilled' THEN 'confirmed'
  WHEN parent_requests.status = 'assigned' AND EXISTS (
    SELECT 1 FROM class_assignments a JOIN class_listings c ON c.id = a.class_id
    WHERE c.source_request_id = parent_requests.id AND a.status = 'active'
      AND a.learner_confirmed_at IS NOT NULL) THEN 'confirmed'
  WHEN parent_requests.status = 'assigned' THEN 'found'
  ELSE 'other' END`;

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
      educationLevel: input.educationLevel,
      sessionsPerWeek: input.sessionsPerWeek,
      tutorRequirements: input.tutorRequirements,
      studentTraits: input.studentTraits,
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
      studentName: input.studentName,
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
      studentName: parentRequestPrivate.studentName,
      stage: stageExpression,
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
  const {
    contactPhone,
    contactAddress,
    contactConsentAt,
    contactConsentVersion,
    studentName,
    stage,
    ...publicRow
  } = row;
  const tutor =
    publicRow.status === 'assigned' || publicRow.status === 'fulfilled'
      ? await proposedTutor(db, id)
      : null;
  return {
    ...summary(publicRow, windows),
    publishedClassId: publishedClass?.id ?? null,
    publishedClassCode: publishedClass?.code ?? null,
    agreedTuitionPerSessionMinor: currentTuition?.agreedTuitionPerSessionMinor ?? null,
    studentName,
    contactPhone,
    contactAddress,
    contactConsentAt,
    contactConsentVersion,
    stage,
    tutor,
    cancellationReason: cancellation?.reason ?? null,
  };
}

export async function listOwnRequests(
  db: Db,
  parentId: string,
  query: ParentRequestListQuery,
): Promise<Page<ParentRequestListItem>> {
  const keyword = query.q ? `%${query.q.replace(/[!%_]/g, (char) => `!${char}`)}%` : null;
  const where = and(
    eq(parentRequests.parentUserId, parentId),
    query.status ? eq(parentRequests.status, query.status) : undefined,
    query.group ? sql`${stageExpression} = ${query.group}` : undefined,
    query.subjectId ? eq(parentRequests.subjectId, query.subjectId) : undefined,
    query.mode ? eq(parentRequests.mode, query.mode) : undefined,
    query.from ? gte(parentRequests.createdAt, localDayStartUtc(query.from)) : undefined,
    query.to ? lt(parentRequests.createdAt, localDayStartUtc(query.to, 1)) : undefined,
    keyword
      ? or(
          sql`${parentRequests.code} LIKE ${keyword} ESCAPE '!'`,
          sql`${subjects.name} LIKE ${keyword} ESCAPE '!'`,
          sql`${parentRequests.grade} LIKE ${keyword} ESCAPE '!'`,
          sql`coalesce(${parentRequests.area}, '') LIKE ${keyword} ESCAPE '!'`,
          sql`coalesce(${parentRequestPrivate.studentName}, '') LIKE ${keyword} ESCAPE '!'`,
        )
      : undefined,
  );
  const [rows, totals] = await Promise.all([
    db
      .select({
        ...publicColumns,
        studentName: parentRequestPrivate.studentName,
        contactPhone: parentRequestPrivate.contactPhone,
        stage: stageExpression,
      })
      .from(parentRequests)
      .innerJoin(subjects, eq(subjects.id, parentRequests.subjectId))
      .innerJoin(parentRequestPrivate, eq(parentRequestPrivate.requestId, parentRequests.id))
      .where(where)
      .orderBy(desc(parentRequests.createdAt), asc(parentRequests.id))
      .limit(query.pageSize)
      .offset((query.page - 1) * query.pageSize)
      .all(),
    db
      .select({ total: count() })
      .from(parentRequests)
      .innerJoin(subjects, eq(subjects.id, parentRequests.subjectId))
      .innerJoin(parentRequestPrivate, eq(parentRequestPrivate.requestId, parentRequests.id))
      .where(where)
      .all(),
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
    items: rows.map(({ studentName, contactPhone, stage, ...row }) => ({
      ...summary(row, byRequest.get(row.id) ?? []),
      studentName,
      contactPhone,
      stage,
    })),
    page: query.page,
    pageSize: query.pageSize,
    total: totals[0]?.total ?? 0,
  };
}

/** UTC instant of local midnight in Asia/Ho_Chi_Minh (UTC+7, no DST) for a YYYY-MM-DD date. */
function localDayStartUtc(date: string, addDays = 0): string {
  const start = new Date(`${date}T00:00:00.000+07:00`);
  start.setUTCDate(start.getUTCDate() + addDays);
  return start.toISOString();
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
      educationLevel: input.educationLevel,
      sessionsPerWeek: input.sessionsPerWeek,
      tutorRequirements: input.tutorRequirements,
      studentTraits: input.studentTraits,
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
    .set({
      contactPhone: input.contactPhone,
      contactAddress: input.contactAddress,
      studentName: input.studentName,
    })
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

/** Owner's request counts per learner tab; drafts and cancelled requests have no tab. */
export async function countOwnStages(db: Db, parentId: string): Promise<LearnerStageCounts> {
  const rows = await db
    .select({ stage: stageExpression, total: count() })
    .from(parentRequests)
    .where(eq(parentRequests.parentUserId, parentId))
    .groupBy(stageExpression)
    .all();
  const counts: LearnerStageCounts = { searching: 0, found: 0, confirmed: 0 };
  for (const row of rows) if (row.stage !== 'other') counts[row.stage] = row.total;
  return counts;
}

/** The active assignment's tutor for this request with a learner-facing profile and fit. */
async function proposedTutor(db: Db, requestId: string): Promise<ProposedTutor | null> {
  const row = await db
    .select({
      assignmentId: classAssignments.id,
      classId: classAssignments.classId,
      tutorId: classAssignments.tutorUserId,
      assignedAt: classAssignments.assignedAt,
      learnerConfirmedAt: classAssignments.learnerConfirmedAt,
      displayName: users.displayName,
      tutorType: tutorProfiles.tutorType,
      school: tutorProfiles.school,
      specialization: tutorProfiles.specialization,
      experienceYears: tutorProfiles.experienceYears,
      experienceSummary: tutorProfiles.experienceSummary,
      bio: tutorProfiles.bio,
      teachesOnline: tutorProfiles.teachesOnline,
      teachesOffline: tutorProfiles.teachesOffline,
      hasPhoto: sql<number>`EXISTS (SELECT 1 FROM profile_photos p WHERE p.user_id = ${classAssignments.tutorUserId})`,
    })
    .from(classAssignments)
    .innerJoin(classListings, eq(classListings.id, classAssignments.classId))
    .innerJoin(users, eq(users.id, classAssignments.tutorUserId))
    .innerJoin(tutorProfiles, eq(tutorProfiles.userId, classAssignments.tutorUserId))
    .where(and(eq(classListings.sourceRequestId, requestId), eq(classAssignments.status, 'active')))
    .get();
  if (!row) return null;
  const [subjectRows, fit] = await Promise.all([
    db
      .select({ name: subjects.name })
      .from(tutorSubjects)
      .innerJoin(subjects, eq(subjects.id, tutorSubjects.subjectId))
      .where(eq(tutorSubjects.tutorId, row.tutorId))
      .orderBy(asc(subjects.name))
      .all(),
    assignedTutorFit(db, row.tutorId, row.classId),
  ]);
  return {
    assignmentId: row.assignmentId,
    assignedAt: row.assignedAt,
    learnerConfirmedAt: row.learnerConfirmedAt,
    displayName: row.displayName,
    tutorType: row.tutorType,
    school: row.school,
    specialization: row.specialization,
    experienceYears: row.experienceYears,
    experienceSummary: row.experienceSummary,
    bio: row.bio,
    teachesOnline: row.teachesOnline,
    teachesOffline: row.teachesOffline,
    hasPhoto: Boolean(row.hasPhoto),
    subjects: subjectRows.map((subject) => subject.name),
    fit: fit
      ? {
          score: fit.score,
          coverage: fit.coverage,
          level: fit.level,
          criteria: fit.criteria
            .filter((item) => item.maxScore > 0)
            .map(({ key, score, maxScore, status }) => ({ key, score, maxScore, status })),
        }
      : { score: 0, coverage: 0, level: 'uncertain', criteria: [] },
  };
}

/**
 * Learner confirms hiring the proposed tutor: one-time stamp on the active assignment plus a
 * request version bump and audit, all in one D1 batch. D1 rejects any other confirmer.
 */
export async function confirmProposedTutor(
  db: Db,
  parentId: string,
  requestId: string,
  version: number,
  assignmentId: string,
  now: string,
): Promise<boolean> {
  const mutationId = crypto.randomUUID();
  const bumped = db
    .update(parentRequests)
    .set({ version: sql`${parentRequests.version} + 1`, mutationId, updatedAt: now })
    .where(
      and(
        eq(parentRequests.id, requestId),
        eq(parentRequests.parentUserId, parentId),
        eq(parentRequests.status, 'assigned'),
        eq(parentRequests.version, version),
        exists(
          db
            .select({ one: sql`1` })
            .from(classAssignments)
            .innerJoin(classListings, eq(classListings.id, classAssignments.classId))
            .where(
              and(
                eq(classAssignments.id, assignmentId),
                eq(classAssignments.status, 'active'),
                sql`${classAssignments.learnerConfirmedAt} IS NULL`,
                eq(classListings.sourceRequestId, requestId),
              ),
            ),
        ),
      ),
    )
    .returning({ id: parentRequests.id });
  const confirmed = db
    .update(classAssignments)
    .set({ learnerConfirmedAt: now, learnerConfirmedBy: parentId })
    .where(and(eq(classAssignments.id, assignmentId), wasCommitted(db, requestId, mutationId)));
  const audit = db.insert(auditLogs).select(
    sql`SELECT ${crypto.randomUUID()}, ${parentId}, 'parent_request.tutor_confirmed', 'parent_request',
      ${requestId}, ${JSON.stringify({ assignmentId, version: version + 1 })}, ${now}
      WHERE EXISTS (SELECT 1 FROM parent_requests WHERE id = ${requestId} AND mutation_id = ${mutationId})`,
  );
  const [result] = await db.batch([bumped, confirmed, audit]);
  return result.length === 1;
}

/** Tutor of the request's active assignment, for the learner's photo request. */
export async function proposedTutorId(
  db: Db,
  parentId: string,
  requestId: string,
): Promise<string | null> {
  const row = await db
    .select({ tutorId: classAssignments.tutorUserId })
    .from(classAssignments)
    .innerJoin(classListings, eq(classListings.id, classAssignments.classId))
    .innerJoin(parentRequests, eq(parentRequests.id, classListings.sourceRequestId))
    .where(
      and(
        eq(parentRequests.id, requestId),
        eq(parentRequests.parentUserId, parentId),
        eq(classAssignments.status, 'active'),
      ),
    )
    .get();
  return row?.tutorId ?? null;
}
