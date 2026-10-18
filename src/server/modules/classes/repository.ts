import {
  and,
  asc,
  count,
  desc,
  eq,
  exists,
  gt,
  inArray,
  isNull,
  lte,
  or,
  sql,
  type SQL,
} from 'drizzle-orm';
import type { BatchItem } from 'drizzle-orm/batch';
import type { Page } from '../../../shared/schemas/discovery';
import type {
  AdminClass,
  ApplicationMatchSnapshot,
  ClassSearchQuery,
  CreateClassInput,
  CreateFeeOptionInput,
  RefreshClassInput,
  FeeOptionVersion,
  PublicClass,
  TutorApplication,
  ApplicationStatus,
} from '../../../shared/schemas/classes';
import {
  FEE_OPTION_KEYS,
  feeSessionsPerWeek,
  PLACEMENT_FEE_OPTION_KEY,
  placementFee,
} from '../../../shared/schemas/classes';
import type { ApplicationAvailability } from '../../../shared/schemas/classes';
import { APPLICATION_COMPLETED } from '../class-requests/sql';
import type { Db } from '../../db/client';
import {
  auditLogs,
  classListings,
  feeOptionVersions,
  parentRequestPrivate,
  parentRequests,
  requestScheduleWindows,
  subjects,
  tutorApplications,
  tutorPreferenceAreas,
  tutorPreferenceGrades,
  tutorProfiles,
  tutorSubjects,
  users,
} from '../../db/schema';

export interface ScoredClass {
  class: PublicClass;
  gradeScore: number;
  areaScore: number;
  scheduleScore: number;
  negotiableTime: boolean;
}

const classColumns = {
  id: classListings.id,
  code: classListings.code,
  sourceRequestId: classListings.sourceRequestId,
  sourceRequestVersion: classListings.sourceRequestVersion,
  parentUserId: classListings.parentUserId,
  subjectId: classListings.subjectId,
  subjectName: subjects.name,
  grade: classListings.grade,
  mode: classListings.mode,
  publicArea: classListings.publicArea,
  expectedBudgetMinor: classListings.expectedBudgetMinor,
  status: classListings.status,
  version: classListings.version,
  timezone: parentRequests.timezone,
  discussLater: parentRequests.discussLater,
  publishedAt: classListings.publishedAt,
  createdAt: classListings.createdAt,
  updatedAt: classListings.updatedAt,
  sessionsPerWeek: parentRequests.sessionsPerWeek,
  tutorRequirements: parentRequests.tutorRequirements,
  studentTraits: parentRequests.studentTraits,
  educationLevel: parentRequests.educationLevel,
  // Rate of the placement-fee policy that applies to this class now (most specific first).
  placementRateBp: sql<number | null>`(SELECT f.rate_basis_points FROM fee_option_versions f
    WHERE f.option_key = ${PLACEMENT_FEE_OPTION_KEY} AND f.status = 'published'
      AND f.published_at <= strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
      AND (f.effective_from IS NULL OR f.effective_from <= strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      AND (f.effective_to IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', 'now') < f.effective_to)
      AND (f.scope_subject_id IS NULL OR f.scope_subject_id = class_listings.subject_id)
      AND (f.scope_mode IS NULL OR f.scope_mode = class_listings.mode)
    ORDER BY ((f.scope_subject_id IS NOT NULL) + (f.scope_mode IS NOT NULL)) DESC,
      f.version DESC LIMIT 1)`,
};
type ClassRow = Awaited<ReturnType<typeof findClassRow>>;
type ActualClassRow = NonNullable<ClassRow>;

async function withSchedules(db: Db, rows: ActualClassRow[]): Promise<AdminClass[]> {
  const requestIds = rows.map((row) => row.sourceRequestId);
  const windows = requestIds.length
    ? await db
        .select({
          requestId: requestScheduleWindows.requestId,
          weekday: requestScheduleWindows.weekday,
          startLocal: requestScheduleWindows.startLocal,
          endLocal: requestScheduleWindows.endLocal,
        })
        .from(requestScheduleWindows)
        .where(inArray(requestScheduleWindows.requestId, requestIds))
        .orderBy(asc(requestScheduleWindows.weekday), asc(requestScheduleWindows.startLocal))
        .all()
    : [];
  const grouped = new Map<string, PublicClass['schedule']['windows']>();
  for (const { requestId, ...window } of windows) {
    const list = grouped.get(requestId) ?? [];
    list.push(window);
    grouped.set(requestId, list);
  }
  return rows.map(
    ({ timezone, discussLater, placementRateBp, tutorRequirements, studentTraits, ...row }) => ({
      ...row,
      tutorRequirements: tutorRequirements.trim() || null,
      studentTraits: studentTraits.trim() || null,
      placementFeeMinor: placementFee(
        row.expectedBudgetMinor,
        feeSessionsPerWeek(row.sessionsPerWeek, grouped.get(row.sourceRequestId)?.length ?? 0),
        placementRateBp,
      ),
      schedule: { timezone, discussLater, windows: grouped.get(row.sourceRequestId) ?? [] },
    }),
  );
}

function publicProjection(row: AdminClass): PublicClass {
  return {
    id: row.id,
    code: row.code,
    subjectId: row.subjectId,
    subjectName: row.subjectName,
    grade: row.grade,
    mode: row.mode,
    publicArea: row.publicArea,
    expectedBudgetMinor: row.expectedBudgetMinor,
    status: row.status,
    version: row.version,
    schedule: row.schedule,
    publishedAt: row.publishedAt,
    createdAt: row.createdAt,
    sessionsPerWeek: row.sessionsPerWeek,
    tutorRequirements: row.tutorRequirements,
    studentTraits: row.studentTraits,
    educationLevel: row.educationLevel,
    placementFeeMinor: row.placementFeeMinor,
  };
}

export async function findClassRow(db: Db, id: string) {
  return db
    .select(classColumns)
    .from(classListings)
    .innerJoin(subjects, eq(subjects.id, classListings.subjectId))
    .innerJoin(parentRequests, eq(parentRequests.id, classListings.sourceRequestId))
    .where(eq(classListings.id, id))
    .get();
}

export async function findAdminClass(db: Db, id: string): Promise<AdminClass | null> {
  const row = await findClassRow(db, id);
  return row ? (await withSchedules(db, [row]))[0]! : null;
}

export async function findPublicClass(db: Db, id: string): Promise<PublicClass | null> {
  const row = await findClassRow(db, id);
  if (!row || row.status !== 'open') return null;
  return publicProjection((await withSchedules(db, [row]))[0]!);
}

function matchedFor(db: Db, tutorId: string): SQL {
  return and(
    exists(
      db
        .select({ one: tutorSubjects.subjectId })
        .from(tutorSubjects)
        .where(
          and(
            eq(tutorSubjects.tutorId, tutorId),
            eq(tutorSubjects.subjectId, classListings.subjectId),
          ),
        ),
    ),
    or(
      exists(
        db
          .select({ one: tutorPreferenceGrades.grade })
          .from(tutorPreferenceGrades)
          .where(
            and(
              eq(tutorPreferenceGrades.tutorId, tutorId),
              eq(tutorPreferenceGrades.grade, classListings.grade),
            ),
          ),
      ),
      sql`NOT EXISTS (SELECT 1 FROM tutor_preference_grades WHERE tutor_id = ${tutorId})`,
    ),
    or(
      eq(classListings.mode, 'online'),
      exists(
        db
          .select({ one: tutorPreferenceAreas.area })
          .from(tutorPreferenceAreas)
          .where(
            and(
              eq(tutorPreferenceAreas.tutorId, tutorId),
              sql`instr(${classListings.publicArea}, ${tutorPreferenceAreas.area}) > 0`,
            ),
          ),
      ),
      sql`NOT EXISTS (SELECT 1 FROM tutor_preference_areas WHERE tutor_id = ${tutorId})`,
    ),
    exists(
      db
        .select({ one: tutorProfiles.userId })
        .from(tutorProfiles)
        .where(
          and(
            eq(tutorProfiles.userId, tutorId),
            or(
              and(eq(classListings.mode, 'online'), eq(tutorProfiles.teachesOnline, true)),
              and(eq(classListings.mode, 'offline'), eq(tutorProfiles.teachesOffline, true)),
            ),
          ),
        ),
    ),
  )!;
}

/** Subject and teaching mode are application hard gates. Preferences remain advisory. */
function candidateFor(db: Db, tutorId: string): SQL {
  return and(
    exists(
      db
        .select({ one: tutorSubjects.subjectId })
        .from(tutorSubjects)
        .where(
          and(
            eq(tutorSubjects.tutorId, tutorId),
            eq(tutorSubjects.subjectId, classListings.subjectId),
          ),
        ),
    ),
    exists(
      db
        .select({ one: tutorProfiles.userId })
        .from(tutorProfiles)
        .where(
          and(
            eq(tutorProfiles.userId, tutorId),
            or(
              and(eq(classListings.mode, 'online'), eq(tutorProfiles.teachesOnline, true)),
              and(eq(classListings.mode, 'offline'), eq(tutorProfiles.teachesOffline, true)),
            ),
          ),
        ),
    ),
  )!;
}

const vietnameseLowercase = Array.from(
  new Set('àáâãèéêìíòóôõùúýăđĩũơưạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹ'),
);

function unicodeLower(value: SQL): SQL {
  // SQLite lower() only folds ASCII. A recursive CTE folds one Unicode code point
  // at a time; a flat CASE avoids SQLite's expression-depth limit from nested replace().
  const mappings: SQL[] = [];
  for (const lower of vietnameseLowercase) {
    const upperLiteral = sql.raw(`'${lower.toLocaleUpperCase('vi')}'`);
    const lowerLiteral = sql.raw(`'${lower}'`);
    mappings.push(sql`WHEN ${upperLiteral} THEN ${lowerLiteral}`);
  }
  return sql`(
    WITH RECURSIVE folded(n, text_value) AS (
      SELECT 1, ''
      UNION ALL
      SELECT n + 1, text_value || CASE substr(${value}, n, 1)
        ${sql.join(mappings, sql` `)}
        ELSE lower(substr(${value}, n, 1)) END
      FROM folded WHERE n <= length(${value})
    )
    SELECT text_value FROM folded ORDER BY n DESC LIMIT 1
  )`;
}

function canonicalArea(value: SQL): SQL {
  // Compare complete comma-separated units while accepting common administrative prefixes.
  const lower = unicodeLower(value);
  return sql`replace(replace(replace(replace(
    replace(replace(trim(${lower}), ' ,', ','), ', ', ','),
    'quận ', ''), 'huyện ', ''), 'thành phố ', ''), 'tỉnh ', '')`;
}

/** Keep these SQL scores in step with the public criterion weights in matching.ts. */
function matchScores(tutorId: string) {
  const publicArea = canonicalArea(sql`${classListings.publicArea}`);
  const preferredArea = canonicalArea(sql`a.area`);
  const firstAreaSegment = sql<string>`trim(CASE
    WHEN instr(${classListings.publicArea}, ',') > 0
      THEN substr(${classListings.publicArea}, 1, instr(${classListings.publicArea}, ',') - 1)
    ELSE ${classListings.publicArea} END)`;
  const gradeScore = sql<number>`CASE
    WHEN EXISTS (SELECT 1 FROM tutor_preference_grades g
      WHERE g.tutor_id = ${tutorId} AND g.grade = ${classListings.grade}) THEN 20
    WHEN NOT EXISTS (SELECT 1 FROM tutor_preference_grades g
      WHERE g.tutor_id = ${tutorId}) THEN 10
    ELSE 0 END`;
  const areaScore = sql<number>`CASE
    WHEN ${classListings.mode} = 'online' THEN 15
    WHEN ${classListings.publicArea} IS NULL THEN 7
    WHEN length(${firstAreaSegment}) > 80 OR length(${firstAreaSegment}) = 0 THEN 7
    WHEN NOT EXISTS (SELECT 1 FROM tutor_preference_areas a
      WHERE a.tutor_id = ${tutorId}) THEN 7
    WHEN EXISTS (SELECT 1 FROM tutor_preference_areas a
      WHERE a.tutor_id = ${tutorId}
        AND instr(',' || ${publicArea} || ',', ',' || ${preferredArea} || ',') > 0) THEN 15
    ELSE 0 END`;
  // Recurring windows are comparable only in the same timezone and against an
  // unbounded rule. A bounded/absent rule is unknown, not a proven conflict.
  const scheduleScore = sql<number>`CASE
    WHEN ${parentRequests.discussLater} = 1 THEN 7
    WHEN NOT EXISTS (SELECT 1 FROM availability_rules r
      WHERE r.tutor_id = ${tutorId}
        AND r.timezone = ${parentRequests.timezone}
        AND r.effective_from IS NULL AND r.effective_to IS NULL) THEN 7
    WHEN EXISTS (SELECT 1 FROM request_schedule_windows w
      JOIN availability_rules r ON r.tutor_id = ${tutorId}
        AND r.timezone = w.timezone
        AND r.effective_from IS NULL AND r.effective_to IS NULL
        AND r.weekday = w.weekday
        AND r.start_local <= w.start_local AND r.end_local >= w.end_local
      WHERE w.request_id = ${classListings.sourceRequestId}) THEN 15
    ELSE 0 END`;
  const negotiableTime = sql<number>`(SELECT t.negotiable_time FROM tutor_profiles t
    WHERE t.user_id = ${tutorId})`;
  return { gradeScore, areaScore, scheduleScore, negotiableTime };
}

function scoredProjection(
  row: ActualClassRow & {
    gradeScore: number;
    areaScore: number;
    scheduleScore: number;
    negotiableTime: number;
  },
  cls: AdminClass,
): ScoredClass {
  return {
    class: publicProjection(cls),
    gradeScore: row.gradeScore,
    areaScore: row.areaScore,
    scheduleScore: row.scheduleScore,
    negotiableTime: row.negotiableTime === 1,
  };
}

/** Global score order is applied in SQLite before LIMIT/OFFSET pagination. */
export async function searchCandidateClasses(
  db: Db,
  tutorId: string,
  query: ClassSearchQuery,
): Promise<Page<ScoredClass>> {
  const where = and(classSearchFilter(db, query), candidateFor(db, tutorId))!;
  const scores = matchScores(tutorId);
  const totalScore = sql<number>`(50 + ${scores.gradeScore} + ${scores.areaScore} + ${scores.scheduleScore})`;
  const [rows, totals] = await db.batch([
    db
      .select({ ...classColumns, ...scores })
      .from(classListings)
      .innerJoin(subjects, eq(subjects.id, classListings.subjectId))
      .innerJoin(parentRequests, eq(parentRequests.id, classListings.sourceRequestId))
      .where(where)
      .orderBy(desc(totalScore), desc(classListings.publishedAt), asc(classListings.id))
      .limit(query.pageSize)
      .offset((query.page - 1) * query.pageSize),
    db.select({ total: count() }).from(classListings).where(where),
  ]);
  const classes = await withSchedules(db, rows);
  return {
    items: rows.map((row, index) => scoredProjection(row, classes[index]!)),
    page: query.page,
    pageSize: query.pageSize,
    total: totals[0]?.total ?? 0,
  };
}

export async function findCandidateClass(
  db: Db,
  tutorId: string,
  classId: string,
): Promise<ScoredClass | null> {
  const row = await db
    .select({ ...classColumns, ...matchScores(tutorId) })
    .from(classListings)
    .innerJoin(subjects, eq(subjects.id, classListings.subjectId))
    .innerJoin(parentRequests, eq(parentRequests.id, classListings.sourceRequestId))
    .where(
      and(
        eq(classListings.id, classId),
        eq(classListings.status, 'open'),
        candidateFor(db, tutorId),
      ),
    )
    .get();
  if (!row) return null;
  return scoredProjection(row, (await withSchedules(db, [row]))[0]!);
}

/** Code, subject, grade or public area contains the keyword (case-insensitive for ASCII). */
function keywordFilter(q: string): SQL {
  const pattern = `%${q.replace(/[!%_]/g, (char) => `!${char}`)}%`;
  return sql`(class_listings.code LIKE ${pattern} ESCAPE '!'
    OR class_listings.grade LIKE ${pattern} ESCAPE '!'
    OR class_listings.public_area LIKE ${pattern} ESCAPE '!'
    OR EXISTS (SELECT 1 FROM subjects s WHERE s.id = class_listings.subject_id
      AND s.name LIKE ${pattern} ESCAPE '!'))`;
}

function classSearchFilter(db: Db, query: ClassSearchQuery, matchedTutorId?: string): SQL {
  return and(
    eq(classListings.status, 'open'),
    query.subjectId ? eq(classListings.subjectId, query.subjectId) : undefined,
    query.grade ? eq(classListings.grade, query.grade) : undefined,
    query.mode ? eq(classListings.mode, query.mode) : undefined,
    query.area ? sql`instr(${classListings.publicArea}, ${query.area}) > 0` : undefined,
    query.q ? keywordFilter(query.q) : undefined,
    matchedTutorId ? matchedFor(db, matchedTutorId) : undefined,
  )!;
}

const ORDER = {
  newest: [desc(classListings.publishedAt), asc(classListings.id)],
  oldest: [asc(classListings.publishedAt), asc(classListings.id)],
  budget_asc: [
    asc(classListings.expectedBudgetMinor),
    desc(classListings.publishedAt),
    asc(classListings.id),
  ],
  budget_desc: [
    desc(classListings.expectedBudgetMinor),
    desc(classListings.publishedAt),
    asc(classListings.id),
  ],
} as const;

export async function searchPublicClasses(
  db: Db,
  query: ClassSearchQuery,
  matchedTutorId?: string,
): Promise<Page<PublicClass>> {
  const where = classSearchFilter(db, query, matchedTutorId);
  const [rows, totals] = await db.batch([
    db
      .select(classColumns)
      .from(classListings)
      .innerJoin(subjects, eq(subjects.id, classListings.subjectId))
      .innerJoin(parentRequests, eq(parentRequests.id, classListings.sourceRequestId))
      .where(where)
      .orderBy(...ORDER[query.sort])
      .limit(query.pageSize)
      .offset((query.page - 1) * query.pageSize),
    db.select({ total: count() }).from(classListings).where(where),
  ]);
  return {
    items: (await withSchedules(db, rows)).map(publicProjection),
    page: query.page,
    pageSize: query.pageSize,
    total: totals[0]?.total ?? 0,
  };
}

export async function listAdminClasses(
  db: Db,
  query: { status?: AdminClass['status']; page: number; pageSize: number },
): Promise<Page<AdminClass>> {
  const where = query.status ? eq(classListings.status, query.status) : undefined;
  const [rows, totals] = await db.batch([
    db
      .select(classColumns)
      .from(classListings)
      .innerJoin(subjects, eq(subjects.id, classListings.subjectId))
      .innerJoin(parentRequests, eq(parentRequests.id, classListings.sourceRequestId))
      .where(where)
      .orderBy(desc(classListings.createdAt), asc(classListings.id))
      .limit(query.pageSize)
      .offset((query.page - 1) * query.pageSize),
    db.select({ total: count() }).from(classListings).where(where),
  ]);
  return {
    items: await withSchedules(db, rows),
    page: query.page,
    pageSize: query.pageSize,
    total: totals[0]?.total ?? 0,
  };
}

export async function sourceRequest(db: Db, id: string) {
  return db
    .select({
      id: parentRequests.id,
      parentUserId: parentRequests.parentUserId,
      subjectId: parentRequests.subjectId,
      grade: parentRequests.grade,
      mode: parentRequests.mode,
      expectedBudgetMinor: parentRequests.expectedBudgetMinor,
      status: parentRequests.status,
      version: parentRequests.version,
      contactConsentAt: parentRequestPrivate.contactConsentAt,
      contactConsentVersion: parentRequestPrivate.contactConsentVersion,
    })
    .from(parentRequests)
    .innerJoin(parentRequestPrivate, eq(parentRequestPrivate.requestId, parentRequests.id))
    .where(eq(parentRequests.id, id))
    .get();
}

export async function insertClass(
  db: Db,
  moderatorId: string,
  input: CreateClassInput,
  source: NonNullable<Awaited<ReturnType<typeof sourceRequest>>>,
  id: string,
  code: string,
  now: string,
): Promise<void> {
  const metadata = JSON.stringify({
    from: null,
    to: 'draft',
    sourceRequestId: source.id,
    sourceRequestVersion: source.version,
  });
  await db.batch([
    db.insert(classListings).values({
      id,
      code,
      sourceRequestId: source.id,
      sourceRequestVersion: source.version,
      parentUserId: source.parentUserId,
      subjectId: source.subjectId,
      grade: source.grade,
      mode: source.mode,
      publicArea: input.publicArea,
      expectedBudgetMinor: source.expectedBudgetMinor,
      status: 'draft',
      version: 1,
      mutationId: crypto.randomUUID(),
      publishedAt: null,
      createdAt: now,
      updatedAt: now,
    }),
    db.insert(auditLogs).values({
      id: crypto.randomUUID(),
      actorId: moderatorId,
      action: 'class.created',
      targetType: 'class_listing',
      targetId: id,
      metadata,
      createdAt: now,
    }),
  ]);
}

export async function publishClass(
  db: Db,
  moderatorId: string,
  id: string,
  version: number,
  sourceRequestId: string,
  sourceRequestVersion: number,
  now: string,
): Promise<boolean> {
  const mutationId = crypto.randomUUID();
  const published = db
    .update(classListings)
    .set({
      status: 'open',
      version: sql`${classListings.version} + 1`,
      mutationId,
      publishedAt: now,
      updatedAt: now,
    })
    .where(
      and(
        eq(classListings.id, id),
        eq(classListings.status, 'draft'),
        eq(classListings.version, version),
        exists(
          db
            .select({ one: parentRequests.id })
            .from(parentRequests)
            .innerJoin(parentRequestPrivate, eq(parentRequestPrivate.requestId, parentRequests.id))
            .where(
              and(
                eq(parentRequests.id, sourceRequestId),
                eq(parentRequests.status, 'submitted'),
                eq(parentRequests.version, sourceRequestVersion),
                sql`${parentRequestPrivate.contactConsentAt} IS NOT NULL`,
                sql`${parentRequestPrivate.contactConsentVersion} IS NOT NULL`,
              ),
            ),
        ),
      ),
    )
    .returning({ id: classListings.id });
  const committed = exists(
    db
      .select({ one: classListings.id })
      .from(classListings)
      .where(and(eq(classListings.id, id), eq(classListings.mutationId, mutationId))),
  );
  const requestUpdate = db
    .update(parentRequests)
    .set({
      status: 'sourcing',
      version: sql`${parentRequests.version} + 1`,
      mutationId,
      updatedAt: now,
    })
    .where(
      and(
        eq(parentRequests.id, sourceRequestId),
        eq(parentRequests.status, 'submitted'),
        eq(parentRequests.version, sourceRequestVersion),
        committed,
      ),
    );
  const classMetadata = JSON.stringify({ from: 'draft', to: 'open', version: version + 1 });
  const requestMetadata = JSON.stringify({ from: 'submitted', to: 'sourcing', classId: id });
  const audits: BatchItem<'sqlite'>[] = [
    db
      .insert(auditLogs)
      .select(
        sql`SELECT ${crypto.randomUUID()}, ${moderatorId}, 'class.published', 'class_listing', ${id}, ${classMetadata}, ${now} WHERE ${committed}`,
      ),
    db
      .insert(auditLogs)
      .select(
        sql`SELECT ${crypto.randomUUID()}, ${moderatorId}, 'parent_request.sourcing', 'parent_request', ${sourceRequestId}, ${requestMetadata}, ${now} WHERE ${committed}`,
      ),
  ];
  const [result] = await db.batch([published, requestUpdate, ...audits]);
  return result.length === 1;
}

export async function refreshClass(
  db: Db,
  moderatorId: string,
  cls: AdminClass,
  source: NonNullable<Awaited<ReturnType<typeof sourceRequest>>>,
  input: RefreshClassInput,
  now: string,
): Promise<boolean> {
  const mutationId = crypto.randomUUID();
  const refreshed = db
    .update(classListings)
    .set({
      sourceRequestVersion: source.version,
      subjectId: source.subjectId,
      grade: source.grade,
      mode: source.mode,
      expectedBudgetMinor: source.expectedBudgetMinor,
      publicArea: input.publicArea,
      version: sql`${classListings.version} + 1`,
      mutationId,
      updatedAt: now,
    })
    .where(
      and(
        eq(classListings.id, cls.id),
        eq(classListings.status, 'draft'),
        eq(classListings.version, input.version),
        exists(
          db
            .select({ one: parentRequests.id })
            .from(parentRequests)
            .innerJoin(parentRequestPrivate, eq(parentRequestPrivate.requestId, parentRequests.id))
            .where(
              and(
                eq(parentRequests.id, cls.sourceRequestId),
                eq(parentRequests.parentUserId, cls.parentUserId),
                eq(parentRequests.status, 'submitted'),
                eq(parentRequests.version, input.requestVersion),
                sql`${parentRequestPrivate.contactConsentAt} IS NOT NULL`,
                sql`${parentRequestPrivate.contactConsentVersion} IS NOT NULL`,
              ),
            ),
        ),
      ),
    )
    .returning({ id: classListings.id });
  const metadata = JSON.stringify({
    sourceRequestVersion: source.version,
    fromVersion: input.version,
    toVersion: input.version + 1,
  });
  const audit = db.insert(auditLogs).select(sql`SELECT ${crypto.randomUUID()}, ${moderatorId},
    'class.refreshed', 'class_listing', ${cls.id}, ${metadata}, ${now}
    WHERE EXISTS (SELECT 1 FROM class_listings WHERE id = ${cls.id} AND mutation_id = ${mutationId})`);
  const [result] = await db.batch([refreshed, audit]);
  return result.length === 1;
}

const feeColumns = {
  id: feeOptionVersions.id,
  optionKey: feeOptionVersions.optionKey,
  version: feeOptionVersions.version,
  title: feeOptionVersions.title,
  policyText: feeOptionVersions.policyText,
  rateBasisPoints: feeOptionVersions.rateBasisPoints,
  depositBasisPoints: feeOptionVersions.depositBasisPoints,
  scopeSubjectId: feeOptionVersions.scopeSubjectId,
  scopeMode: feeOptionVersions.scopeMode,
  status: feeOptionVersions.status,
  effectiveFrom: feeOptionVersions.effectiveFrom,
  effectiveTo: feeOptionVersions.effectiveTo,
  publishedAt: feeOptionVersions.publishedAt,
};

export async function listFeeOptions(db: Db): Promise<FeeOptionVersion[]> {
  return db
    .select(feeColumns)
    .from(feeOptionVersions)
    .orderBy(asc(feeOptionVersions.optionKey), desc(feeOptionVersions.version))
    .limit(100)
    .all();
}

export async function getFeeOption(db: Db, id: string): Promise<FeeOptionVersion | null> {
  return (
    (await db
      .select(feeColumns)
      .from(feeOptionVersions)
      .where(eq(feeOptionVersions.id, id))
      .get()) ?? null
  );
}

export async function nextFeeVersion(
  db: Db,
  optionKey: CreateFeeOptionInput['optionKey'],
): Promise<number> {
  const row = await db
    .select({ version: feeOptionVersions.version })
    .from(feeOptionVersions)
    .where(eq(feeOptionVersions.optionKey, optionKey))
    .orderBy(desc(feeOptionVersions.version))
    .get();
  return (row?.version ?? 0) + 1;
}

export async function insertFeeOption(
  db: Db,
  moderatorId: string,
  input: CreateFeeOptionInput,
  id: string,
  version: number,
  now: string,
): Promise<void> {
  const metadata = JSON.stringify({ optionKey: input.optionKey, version, to: 'draft' });
  await db.batch([
    db.insert(feeOptionVersions).values({
      id,
      optionKey: input.optionKey,
      version,
      title: input.title,
      policyText: input.policyText,
      rateBasisPoints: input.rateBasisPoints,
      depositBasisPoints: input.depositBasisPoints,
      scopeSubjectId: input.scopeSubjectId,
      scopeMode: input.scopeMode,
      status: 'draft',
      effectiveFrom: input.effectiveFrom,
      effectiveTo: input.effectiveTo,
      approvedBy: null,
      publishedAt: null,
      mutationId: crypto.randomUUID(),
      createdAt: now,
    }),
    db.insert(auditLogs).values({
      id: crypto.randomUUID(),
      actorId: moderatorId,
      action: 'fee_option.created',
      targetType: 'fee_option_version',
      targetId: id,
      metadata,
      createdAt: now,
    }),
  ]);
}

export async function publishFeeOption(
  db: Db,
  moderatorId: string,
  id: string,
  version: number,
  now: string,
): Promise<boolean> {
  const mutationId = crypto.randomUUID();
  const updated = db
    .update(feeOptionVersions)
    .set({ status: 'published', approvedBy: moderatorId, publishedAt: now, mutationId })
    .where(
      and(
        eq(feeOptionVersions.id, id),
        eq(feeOptionVersions.version, version),
        eq(feeOptionVersions.status, 'draft'),
      ),
    )
    .returning({ id: feeOptionVersions.id });
  const metadata = JSON.stringify({ from: 'draft', to: 'published', version });
  const audit = db.insert(auditLogs)
    .select(sql`SELECT ${crypto.randomUUID()}, ${moderatorId}, 'fee_option.published',
      'fee_option_version', ${id}, ${metadata}, ${now} WHERE EXISTS
      (SELECT 1 FROM fee_option_versions WHERE id = ${id} AND mutation_id = ${mutationId})`);
  const [result] = await db.batch([updated, audit]);
  return result.length === 1;
}

export async function availableFeeOptions(
  db: Db,
  classId: string,
  now: string,
): Promise<FeeOptionVersion[]> {
  const choices = await Promise.all(
    FEE_OPTION_KEYS.map((key) =>
      db
        .select(feeColumns)
        .from(feeOptionVersions)
        .innerJoin(classListings, eq(classListings.id, classId))
        .where(
          and(
            eq(classListings.status, 'open'),
            eq(feeOptionVersions.optionKey, key),
            eq(feeOptionVersions.status, 'published'),
            lte(feeOptionVersions.publishedAt, now),
            or(isNull(feeOptionVersions.effectiveFrom), lte(feeOptionVersions.effectiveFrom, now)),
            or(isNull(feeOptionVersions.effectiveTo), gt(feeOptionVersions.effectiveTo, now)),
            or(
              isNull(feeOptionVersions.scopeSubjectId),
              eq(feeOptionVersions.scopeSubjectId, classListings.subjectId),
            ),
            or(
              isNull(feeOptionVersions.scopeMode),
              eq(feeOptionVersions.scopeMode, classListings.mode),
            ),
          ),
        )
        .orderBy(
          sql`((${feeOptionVersions.scopeSubjectId} IS NOT NULL) +
            (${feeOptionVersions.scopeMode} IS NOT NULL)) DESC`,
          desc(feeOptionVersions.version),
        )
        .get(),
    ),
  );
  return choices.filter((choice): choice is FeeOptionVersion => choice !== undefined);
}

export async function tutorEligible(db: Db, tutorId: string): Promise<boolean> {
  return !!(await db
    .select({ id: tutorProfiles.userId })
    .from(tutorProfiles)
    .innerJoin(users, eq(users.id, tutorProfiles.userId))
    .where(
      and(
        eq(tutorProfiles.userId, tutorId),
        eq(tutorProfiles.approvalStatus, 'approved'),
        eq(users.status, 'active'),
      ),
    )
    .get());
}

export async function tutorMatchesClass(
  db: Db,
  tutorId: string,
  classId: string,
): Promise<boolean> {
  const hasSubject = exists(
    db
      .select({ one: tutorSubjects.subjectId })
      .from(tutorSubjects)
      .where(
        and(
          eq(tutorSubjects.tutorId, tutorId),
          eq(tutorSubjects.subjectId, classListings.subjectId),
        ),
      ),
  );
  const supportsMode = exists(
    db
      .select({ one: tutorProfiles.userId })
      .from(tutorProfiles)
      .where(
        and(
          eq(tutorProfiles.userId, tutorId),
          or(
            and(eq(classListings.mode, 'online'), eq(tutorProfiles.teachesOnline, true)),
            and(eq(classListings.mode, 'offline'), eq(tutorProfiles.teachesOffline, true)),
          ),
        ),
      ),
  );
  return !!(await db
    .select({ id: classListings.id })
    .from(classListings)
    .where(and(eq(classListings.id, classId), hasSubject, supportsMode))
    .get());
}

export async function insertApplication(
  db: Db,
  tutorId: string,
  classId: string,
  feeOptionVersionId: string,
  id: string,
  classVersion: number,
  now: string,
  matchSnapshot: ApplicationMatchSnapshot,
  softScores: { grade: number; area: number; schedule: number; negotiableTime: boolean },
  extra: { before: BatchItem<'sqlite'>[]; after: BatchItem<'sqlite'>[] } = {
    before: [],
    after: [],
  },
  availability: ApplicationAvailability | null = null,
): Promise<boolean> {
  const availabilityJson = availability
    ? JSON.stringify(
        [...availability.windows].sort(
          (a, b) => a.weekday - b.weekday || a.startLocal.localeCompare(b.startLocal),
        ),
      )
    : null;
  const mutationId = crypto.randomUUID();
  const matchSnapshotJson = JSON.stringify(matchSnapshot);
  const scores = matchScores(tutorId);
  const application = db
    .insert(tutorApplications)
    .select(
      sql`SELECT ${id}, ${classId}, ${tutorId},
    ${feeOptionVersionId}, 'submitted', NULL, 1, ${mutationId}, ${now}, ${now}, ${matchSnapshotJson},
    NULL, NULL, NULL, ${availabilityJson}
    WHERE EXISTS (
      SELECT 1 FROM class_listings
      JOIN parent_requests ON parent_requests.id = class_listings.source_request_id
      WHERE class_listings.id = ${classId}
        AND class_listings.status = 'open'
        AND class_listings.version = ${classVersion}
        AND ${scores.gradeScore} = ${softScores.grade}
        AND ${scores.areaScore} = ${softScores.area}
        AND ${scores.scheduleScore} = ${softScores.schedule}
        AND ${scores.negotiableTime} = ${softScores.negotiableTime ? 1 : 0}
    )`,
    )
    .returning({ id: tutorApplications.id });
  // A zero-row INSERT (stale class version) must abort the transaction before an
  // idempotency key can be marked completed. The invalid status trips a CHECK.
  const assertInserted = db.insert(tutorApplications)
    .select(sql`SELECT ${crypto.randomUUID()}, ${classId}, ${tutorId},
    ${feeOptionVersionId}, 'invalid', NULL, 1, ${mutationId}, ${now}, ${now}, '{}', NULL, NULL, NULL, NULL
    WHERE NOT EXISTS (SELECT 1 FROM tutor_applications WHERE id = ${id} AND mutation_id = ${mutationId})`);
  const profileChanges: BatchItem<'sqlite'>[] = [];
  const changes = matchSnapshot.profileChanges;
  if (changes?.preferredGrade) {
    profileChanges.push(
      db.insert(tutorPreferenceGrades).values({ tutorId, grade: changes.preferredGrade }),
    );
  }
  if (changes?.preferredArea) {
    profileChanges.push(
      db.insert(tutorPreferenceAreas).values({ tutorId, area: changes.preferredArea }),
    );
  }
  if (changes?.preferredGrade || changes?.preferredArea || changes?.negotiableTime) {
    profileChanges.push(
      db
        .update(tutorProfiles)
        .set({
          ...(changes.negotiableTime ? { negotiableTime: true } : {}),
          updatedAt: now,
        })
        .where(eq(tutorProfiles.userId, tutorId)),
    );
  }
  const metadata = JSON.stringify({
    to: 'submitted',
    classId,
    feeOptionVersionId,
    classVersion,
    matchSnapshot,
  });
  const audit = db.insert(auditLogs).select(sql`SELECT ${crypto.randomUUID()}, ${tutorId},
    'application.submitted', 'tutor_application', ${id}, ${metadata}, ${now}
    WHERE EXISTS (SELECT 1 FROM tutor_applications WHERE id = ${id} AND mutation_id = ${mutationId})`);
  await db.batch([
    ...extra.before,
    application,
    assertInserted,
    ...profileChanges,
    audit,
    ...extra.after,
  ] as [BatchItem<'sqlite'>, ...BatchItem<'sqlite'>[]]);
  return true;
}

/** Matrix windows of an application; 0035 rows (days + one range) read as the same shape. */
export function availabilityOf(row: {
  availabilityJson: string | null;
  availableWeekdays: string | null;
  availableStart: string | null;
  availableEnd: string | null;
}): ApplicationAvailability | null {
  if (row.availabilityJson) return { windows: JSON.parse(row.availabilityJson) };
  const { availableWeekdays, availableStart, availableEnd } = row;
  if (!availableWeekdays || !availableStart || !availableEnd) return null;
  return {
    windows: availableWeekdays.split(',').map((day) => ({
      weekday: Number(day),
      startLocal: availableStart,
      endLocal: availableEnd,
    })),
  };
}

export async function findOwnApplication(
  db: Db,
  tutorId: string,
  id: string,
): Promise<TutorApplication | null> {
  const row = await db
    .select({
      id: tutorApplications.id,
      classId: tutorApplications.classId,
      feeOptionVersionId: tutorApplications.feeOptionVersionId,
      status: tutorApplications.status,
      rejectionReason: tutorApplications.rejectionReason,
      version: tutorApplications.version,
      createdAt: tutorApplications.createdAt,
      updatedAt: tutorApplications.updatedAt,
      matchSnapshotJson: tutorApplications.matchSnapshotJson,
      availableWeekdays: tutorApplications.availableWeekdays,
      availableStart: tutorApplications.availableStart,
      availableEnd: tutorApplications.availableEnd,
      availabilityJson: tutorApplications.availabilityJson,
    })
    .from(tutorApplications)
    .where(and(eq(tutorApplications.id, id), eq(tutorApplications.tutorUserId, tutorId)))
    .get();
  if (!row) return null;
  const cls = await findAdminClass(db, row.classId);
  if (!cls) return null;
  const {
    matchSnapshotJson,
    availableWeekdays,
    availableStart,
    availableEnd,
    availabilityJson,
    ...application
  } = row;
  return {
    ...application,
    matchSnapshot: matchSnapshotJson === '{}' ? null : JSON.parse(matchSnapshotJson),
    availability: availabilityOf({
      availabilityJson,
      availableWeekdays,
      availableStart,
      availableEnd,
    }),
    class: publicProjection(cls),
    acceptance: null,
  };
}

export async function listOwnApplications(
  db: Db,
  tutorId: string,
  query: {
    status?: ApplicationStatus;
    q?: string;
    stage?: 'registered';
    page: number;
    pageSize: number;
  },
): Promise<Page<TutorApplication>> {
  const where = and(
    eq(tutorApplications.tutorUserId, tutorId),
    query.status ? eq(tutorApplications.status, query.status) : undefined,
    query.q
      ? sql`EXISTS (SELECT 1 FROM class_listings
          WHERE class_listings.id = tutor_applications.class_id AND ${keywordFilter(query.q)})`
      : undefined,
    query.stage === 'registered' ? sql`NOT ${sql.raw(APPLICATION_COMPLETED)}` : undefined,
  );
  const [rows, totals] = await db.batch([
    db
      .select({ id: tutorApplications.id })
      .from(tutorApplications)
      .where(where)
      .orderBy(desc(tutorApplications.createdAt), asc(tutorApplications.id))
      .limit(query.pageSize)
      .offset((query.page - 1) * query.pageSize),
    db.select({ total: count() }).from(tutorApplications).where(where),
  ]);
  const items = (
    await Promise.all(rows.map((row) => findOwnApplication(db, tutorId, row.id)))
  ).filter((row): row is TutorApplication => row !== null);
  return { items, page: query.page, pageSize: query.pageSize, total: totals[0]?.total ?? 0 };
}

export async function withdrawApplication(
  db: Db,
  tutorId: string,
  id: string,
  version: number,
  now: string,
): Promise<boolean> {
  const mutationId = crypto.randomUUID();
  const update = db
    .update(tutorApplications)
    .set({
      status: 'withdrawn',
      version: sql`${tutorApplications.version} + 1`,
      mutationId,
      updatedAt: now,
    })
    .where(
      and(
        eq(tutorApplications.id, id),
        eq(tutorApplications.tutorUserId, tutorId),
        eq(tutorApplications.status, 'submitted'),
        eq(tutorApplications.version, version),
      ),
    )
    .returning({ id: tutorApplications.id });
  const metadata = JSON.stringify({ from: 'submitted', to: 'withdrawn', version: version + 1 });
  const audit = db.insert(auditLogs).select(sql`SELECT ${crypto.randomUUID()}, ${tutorId},
    'application.withdrawn', 'tutor_application', ${id}, ${metadata}, ${now}
    WHERE EXISTS (SELECT 1 FROM tutor_applications WHERE id = ${id} AND mutation_id = ${mutationId})`);
  const [result] = await db.batch([update, audit]);
  return result.length === 1;
}

/**
 * Score inputs for one tutor against one class in any state, for the learner's view of an
 * assigned tutor. Uses the same SQL criteria as tutor recommendations.
 */
export async function scoreTutorForClass(db: Db, tutorId: string, classId: string) {
  const scores = matchScores(tutorId);
  const row = await db
    .select({
      mode: classListings.mode,
      grade: classListings.grade,
      publicArea: classListings.publicArea,
      ...scores,
    })
    .from(classListings)
    .innerJoin(parentRequests, eq(parentRequests.id, classListings.sourceRequestId))
    .where(eq(classListings.id, classId))
    .get();
  return row ?? null;
}
