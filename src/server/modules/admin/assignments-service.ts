import { and, asc, count, desc, eq, sql } from 'drizzle-orm';
import type {
  AdminAssignment,
  AssignClassInput,
  AssignedParentContact,
  RecordAssignmentTuitionInput,
  TutorAssignment,
  TutorAssignmentListQuery,
} from '../../../shared/schemas/admin-assignments';
import type { Page } from '../../../shared/schemas/discovery';
import type { Db } from '../../db/client';
import {
  auditLogs,
  classAssignments,
  classContractRecords,
  classListings,
  feeOptionVersions,
  parentRequestPrivate,
  parentRequests,
  subjects,
  tutorApplications,
  tutorProfiles,
  users,
} from '../../db/schema';
import { AppError, isUniqueViolation } from '../../lib/errors';

const OTHER_TUTOR_REASON = 'Lớp đã được gán cho gia sư khác';

const stale = () =>
  new AppError(409, 'STALE_ASSIGNMENT', 'Lớp hoặc đơn ứng tuyển đã thay đổi. Vui lòng tải lại.');

export async function listTutorAssignments(
  db: Db,
  tutorId: string,
  query: TutorAssignmentListQuery,
): Promise<Page<TutorAssignment>> {
  const where = and(
    eq(classAssignments.tutorUserId, tutorId),
    eq(classAssignments.status, 'active'),
    eq(classListings.status, 'active'),
  );
  const [items, totals] = await Promise.all([
    db
      .select({
        id: classAssignments.id,
        classId: classAssignments.classId,
        classCode: classListings.code,
        applicationId: classAssignments.applicationId,
        subjectName: subjects.name,
        grade: classListings.grade,
        mode: classListings.mode,
        publicArea: classListings.publicArea,
        status: classAssignments.status,
        assignedAt: classAssignments.assignedAt,
        agreedTuitionPerSessionMinor: classAssignments.agreedTuitionPerSessionMinor,
        learnerConfirmed: sql<number>`${classAssignments.learnerConfirmedAt} IS NOT NULL`,
        placementFeePaid: sql<number>`${classAssignments.placementFeePaidAt} IS NOT NULL`,
        contractAcknowledged: sql<number>`EXISTS (SELECT 1 FROM class_contract_records r
          WHERE r.assignment_id = ${classAssignments.id} AND r.status = 'acknowledged')`,
      })
      .from(classAssignments)
      .innerJoin(classListings, eq(classListings.id, classAssignments.classId))
      .innerJoin(subjects, eq(subjects.id, classListings.subjectId))
      .where(where)
      .orderBy(desc(classAssignments.assignedAt), asc(classAssignments.id))
      .limit(query.pageSize)
      .offset((query.page - 1) * query.pageSize)
      .all(),
    db
      .select({ total: count() })
      .from(classAssignments)
      .innerJoin(classListings, eq(classListings.id, classAssignments.classId))
      .where(where)
      .all(),
  ]);
  return {
    items: items.map(({ learnerConfirmed, contractAcknowledged, placementFeePaid, ...row }) => ({
      ...row,
      status: 'active' as const,
      contactGate: {
        learnerConfirmed: Boolean(learnerConfirmed),
        contractAcknowledged: Boolean(contractAcknowledged),
        placementFeePaid: Boolean(placementFeePaid),
      },
    })),
    page: query.page,
    pageSize: query.pageSize,
    total: totals[0]?.total ?? 0,
  };
}

function rootErrorMessage(error: unknown): string {
  let cause = error;
  while (cause instanceof Error && cause.cause !== undefined) cause = cause.cause;
  return cause instanceof Error ? cause.message : String(cause);
}

async function getAssignment(db: Db, id: string): Promise<AdminAssignment> {
  const row = await db
    .select({
      id: classAssignments.id,
      classId: classAssignments.classId,
      applicationId: classAssignments.applicationId,
      tutorUserId: classAssignments.tutorUserId,
      status: classAssignments.status,
      version: classAssignments.version,
      assignedBy: classAssignments.assignedBy,
      assignedAt: classAssignments.assignedAt,
      agreedTuitionPerSessionMinor: classAssignments.agreedTuitionPerSessionMinor,
      tuitionRecordedBy: classAssignments.tuitionRecordedBy,
      tuitionRecordedAt: classAssignments.tuitionRecordedAt,
    })
    .from(classAssignments)
    .where(eq(classAssignments.id, id))
    .get();
  if (!row) throw new AppError(404, 'ASSIGNMENT_NOT_FOUND', 'Không tìm thấy phân công lớp.');
  return row;
}

/**
 * One moderator action: selected application, all competing applications,
 * class, source request and assignment commit together. A DB trigger rejects
 * stale zero-row updates before the batch can commit any partial state.
 */
export async function assignClass(
  db: Db,
  moderatorId: string,
  classId: string,
  input: AssignClassInput,
  now = new Date(),
): Promise<AdminAssignment> {
  const [cls, application, request] = await Promise.all([
    db
      .select({
        id: classListings.id,
        status: classListings.status,
        version: classListings.version,
        sourceRequestId: classListings.sourceRequestId,
      })
      .from(classListings)
      .where(eq(classListings.id, classId))
      .get(),
    db
      .select({
        id: tutorApplications.id,
        classId: tutorApplications.classId,
        tutorUserId: tutorApplications.tutorUserId,
        status: tutorApplications.status,
        version: tutorApplications.version,
        feeStatus: feeOptionVersions.status,
        tutorStatus: users.status,
        approvalStatus: tutorProfiles.approvalStatus,
      })
      .from(tutorApplications)
      .innerJoin(feeOptionVersions, eq(feeOptionVersions.id, tutorApplications.feeOptionVersionId))
      .innerJoin(users, eq(users.id, tutorApplications.tutorUserId))
      .innerJoin(tutorProfiles, eq(tutorProfiles.userId, tutorApplications.tutorUserId))
      .where(eq(tutorApplications.id, input.applicationId))
      .get(),
    db
      .select({
        status: parentRequests.status,
        version: parentRequests.version,
        contactConsentAt: parentRequestPrivate.contactConsentAt,
        contactConsentVersion: parentRequestPrivate.contactConsentVersion,
      })
      .from(parentRequests)
      .innerJoin(parentRequestPrivate, eq(parentRequestPrivate.requestId, parentRequests.id))
      .innerJoin(classListings, eq(classListings.sourceRequestId, parentRequests.id))
      .where(eq(classListings.id, classId))
      .get(),
  ]);
  if (!cls) throw new AppError(404, 'CLASS_NOT_FOUND', 'Không tìm thấy lớp học.');
  if (!application || application.classId !== classId) {
    throw new AppError(404, 'APPLICATION_NOT_FOUND', 'Không tìm thấy đơn ứng tuyển cho lớp này.');
  }
  if (
    !request ||
    cls.status !== 'open' ||
    cls.version !== input.classVersion ||
    application.status !== 'submitted' ||
    application.version !== input.applicationVersion ||
    application.feeStatus !== 'published' ||
    application.tutorStatus !== 'active' ||
    application.approvalStatus !== 'approved' ||
    request.status !== 'sourcing' ||
    request.version !== input.requestVersion ||
    !request.contactConsentAt ||
    !request.contactConsentVersion
  ) {
    throw stale();
  }

  const id = crypto.randomUUID();
  const selectedMutationId = crypto.randomUUID();
  const rejectedMutationId = crypto.randomUUID();
  const classMutationId = crypto.randomUUID();
  const requestMutationId = crypto.randomUUID();
  const nowIso = now.toISOString();

  const selected = db
    .update(tutorApplications)
    .set({
      status: 'selected',
      version: sql`${tutorApplications.version} + 1`,
      mutationId: selectedMutationId,
      updatedAt: nowIso,
    })
    .where(
      and(
        eq(tutorApplications.id, input.applicationId),
        eq(tutorApplications.classId, classId),
        eq(tutorApplications.status, 'submitted'),
        eq(tutorApplications.version, input.applicationVersion),
      ),
    )
    .returning({ id: tutorApplications.id });

  const rejected = db
    .update(tutorApplications)
    .set({
      status: 'rejected',
      rejectionReason: OTHER_TUTOR_REASON,
      version: sql`${tutorApplications.version} + 1`,
      mutationId: rejectedMutationId,
      updatedAt: nowIso,
    })
    .where(
      and(
        eq(tutorApplications.classId, classId),
        eq(tutorApplications.status, 'submitted'),
        sql`${tutorApplications.id} <> ${input.applicationId}`,
      ),
    );

  const activated = db
    .update(classListings)
    .set({
      status: 'active',
      version: sql`${classListings.version} + 1`,
      mutationId: classMutationId,
      updatedAt: nowIso,
    })
    .where(
      and(
        eq(classListings.id, classId),
        eq(classListings.status, 'open'),
        eq(classListings.version, input.classVersion),
        sql`EXISTS (
          SELECT 1 FROM tutor_applications
          WHERE id = ${input.applicationId} AND mutation_id = ${selectedMutationId}
            AND status = 'selected'
        )`,
      ),
    )
    .returning({ id: classListings.id });

  const requestAssigned = db
    .update(parentRequests)
    .set({
      status: 'assigned',
      version: sql`${parentRequests.version} + 1`,
      mutationId: requestMutationId,
      updatedAt: nowIso,
    })
    .where(
      and(
        eq(parentRequests.id, cls.sourceRequestId),
        eq(parentRequests.status, 'sourcing'),
        eq(parentRequests.version, input.requestVersion),
        sql`EXISTS (
          SELECT 1 FROM class_listings
          WHERE id = ${classId} AND mutation_id = ${classMutationId} AND status = 'active'
        )`,
      ),
    )
    .returning({ id: parentRequests.id });

  const assignment = db.insert(classAssignments).values({
    id,
    classId,
    applicationId: input.applicationId,
    tutorUserId: application.tutorUserId,
    assignedBy: moderatorId,
    status: 'active',
    version: 1,
    mutationId: crypto.randomUUID(),
    assignedAt: nowIso,
    revokedAt: null,
    agreedTuitionPerSessionMinor: input.agreedTuitionPerSessionMinor,
    tuitionRecordedBy: moderatorId,
    tuitionRecordedAt: nowIso,
  });

  const selectedAudit = db.insert(auditLogs).values({
    id: crypto.randomUUID(),
    actorId: moderatorId,
    action: 'application.selected',
    targetType: 'tutor_application',
    targetId: input.applicationId,
    metadata: JSON.stringify({
      from: 'submitted',
      to: 'selected',
      classId,
      version: input.applicationVersion + 1,
    }),
    createdAt: nowIso,
  });
  const rejectedAudits = db.insert(auditLogs).select(
    sql`SELECT lower(hex(randomblob(16))), ${moderatorId}, 'application.rejected',
      'tutor_application', id,
      json_object('from', 'submitted', 'to', 'rejected', 'classId', ${classId},
        'reason', ${OTHER_TUTOR_REASON}),
      ${nowIso}
      FROM tutor_applications
      WHERE class_id = ${classId} AND status = 'rejected'
        AND mutation_id = ${rejectedMutationId}`,
  );
  const classAudit = db.insert(auditLogs).values({
    id: crypto.randomUUID(),
    actorId: moderatorId,
    action: 'class.assigned',
    targetType: 'class_listing',
    targetId: classId,
    metadata: JSON.stringify({
      from: 'open',
      to: 'active',
      applicationId: input.applicationId,
      version: input.classVersion + 1,
      note: input.note ?? null,
    }),
    createdAt: nowIso,
  });
  const requestAudit = db.insert(auditLogs).values({
    id: crypto.randomUUID(),
    actorId: moderatorId,
    action: 'parent_request.assigned',
    targetType: 'parent_request',
    targetId: cls.sourceRequestId,
    metadata: JSON.stringify({
      from: 'sourcing',
      to: 'assigned',
      classId,
      version: input.requestVersion + 1,
    }),
    createdAt: nowIso,
  });
  const assignmentAudit = db.insert(auditLogs).values({
    id: crypto.randomUUID(),
    actorId: moderatorId,
    action: 'assignment.created',
    targetType: 'class_assignment',
    targetId: id,
    metadata: JSON.stringify({
      to: 'active',
      classId,
      applicationId: input.applicationId,
      tutorUserId: application.tutorUserId,
      agreedTuitionPerSessionMinor: input.agreedTuitionPerSessionMinor,
      partiesAgreed: input.partiesAgreed,
      note: input.note ?? null,
    }),
    createdAt: nowIso,
  });

  try {
    const [, , classResult, requestResult] = await db.batch([
      selected,
      rejected,
      activated,
      requestAssigned,
      assignment,
      selectedAudit,
      rejectedAudits,
      classAudit,
      requestAudit,
      assignmentAudit,
    ]);
    if (classResult.length !== 1 || requestResult.length !== 1) throw stale();
  } catch (error) {
    if (error instanceof AppError) throw error;
    if (
      isUniqueViolation(error, 'class_assignments.class_id') ||
      isUniqueViolation(error, 'class_assignments.application_id') ||
      rootErrorMessage(error).includes('ASSIGNMENT_NOT_ELIGIBLE') ||
      rootErrorMessage(error).includes('ASSIGNMENT_TUITION_REQUIRED')
    ) {
      throw stale();
    }
    throw error;
  }
  return getAssignment(db, id);
}

/** Records a verified amount once for an active pre-migration assignment. */
export async function recordAssignmentTuition(
  db: Db,
  moderatorId: string,
  assignmentId: string,
  input: RecordAssignmentTuitionInput,
  now = new Date(),
): Promise<AdminAssignment> {
  const [assignment, contract] = await Promise.all([
    db
      .select({
        id: classAssignments.id,
        classId: classAssignments.classId,
        status: classAssignments.status,
        version: classAssignments.version,
        amount: classAssignments.agreedTuitionPerSessionMinor,
        classStatus: classListings.status,
      })
      .from(classAssignments)
      .innerJoin(classListings, eq(classListings.id, classAssignments.classId))
      .where(eq(classAssignments.id, assignmentId))
      .get(),
    db
      .select({ id: classContractRecords.id })
      .from(classContractRecords)
      .where(eq(classContractRecords.assignmentId, assignmentId))
      .get(),
  ]);
  if (!assignment) throw new AppError(404, 'ASSIGNMENT_NOT_FOUND', 'Không tìm thấy phân công lớp.');
  if (assignment.amount !== null)
    throw new AppError(409, 'TUITION_ALREADY_RECORDED', 'Học phí đã chốt đã được ghi nhận.');
  if (
    assignment.status !== 'active' ||
    assignment.classStatus !== 'active' ||
    assignment.version !== input.assignmentVersion
  )
    throw stale();
  if (contract) throw new AppError(409, 'CONTRACT_ALREADY_ISSUED', 'Hợp đồng đã được phát hành.');

  const mutationId = crypto.randomUUID();
  const nowIso = now.toISOString();
  const update = db
    .update(classAssignments)
    .set({
      agreedTuitionPerSessionMinor: input.agreedTuitionPerSessionMinor,
      tuitionRecordedBy: moderatorId,
      tuitionRecordedAt: nowIso,
      version: sql`${classAssignments.version} + 1`,
      mutationId,
    })
    .where(
      and(
        eq(classAssignments.id, assignmentId),
        eq(classAssignments.status, 'active'),
        eq(classAssignments.version, input.assignmentVersion),
        sql`${classAssignments.agreedTuitionPerSessionMinor} IS NULL`,
        sql`EXISTS (SELECT 1 FROM class_listings
          WHERE id = ${assignment.classId} AND status = 'active')`,
        sql`NOT EXISTS (SELECT 1 FROM class_contract_records
          WHERE assignment_id = ${assignmentId})`,
      ),
    )
    .returning({ id: classAssignments.id });
  const audit = db.insert(auditLogs).select(
    sql`SELECT ${crypto.randomUUID()}, ${moderatorId}, 'assignment.tuition_recorded',
      'class_assignment', ${assignmentId}, ${JSON.stringify({
        classId: assignment.classId,
        agreedTuitionPerSessionMinor: input.agreedTuitionPerSessionMinor,
        partiesAgreed: input.partiesAgreed,
        version: input.assignmentVersion + 1,
      })}, ${nowIso}
      WHERE EXISTS (SELECT 1 FROM class_assignments
        WHERE id = ${assignmentId} AND mutation_id = ${mutationId})`,
  );
  try {
    const [updated] = await db.batch([update, audit]);
    if (updated.length !== 1) throw stale();
  } catch (error) {
    if (error instanceof AppError) throw error;
    if (rootErrorMessage(error).includes('ASSIGNMENT_TUITION_BACKFILL_INVALID')) throw stale();
    throw error;
  }
  return getAssignment(db, assignmentId);
}

/** Checked on every read; a revoked assignment never authorizes parent contact. */
export async function getAssignedContact(
  db: Db,
  tutorId: string,
  assignmentId: string,
): Promise<AssignedParentContact> {
  const row = await db
    .select({
      assignmentId: classAssignments.id,
      classId: classAssignments.classId,
      parentDisplayName: users.displayName,
      phone: parentRequestPrivate.contactPhone,
      address: parentRequestPrivate.contactAddress,
    })
    .from(classAssignments)
    .innerJoin(classListings, eq(classListings.id, classAssignments.classId))
    .innerJoin(parentRequests, eq(parentRequests.id, classListings.sourceRequestId))
    .innerJoin(parentRequestPrivate, eq(parentRequestPrivate.requestId, parentRequests.id))
    .innerJoin(users, eq(users.id, parentRequests.parentUserId))
    .where(
      and(
        eq(classAssignments.id, assignmentId),
        eq(classAssignments.tutorUserId, tutorId),
        eq(classAssignments.status, 'active'),
        eq(classListings.status, 'active'),
        eq(parentRequests.status, 'assigned'),
        sql`${parentRequestPrivate.contactConsentAt} IS NOT NULL`,
        sql`${parentRequestPrivate.contactConsentVersion} IS NOT NULL`,
        // Contact opens only after hire confirmation, contract acknowledgement and fee receipt.
        sql`${classAssignments.learnerConfirmedAt} IS NOT NULL`,
        sql`${classAssignments.placementFeePaidAt} IS NOT NULL`,
        sql`EXISTS (SELECT 1 FROM class_contract_records r
          WHERE r.assignment_id = ${classAssignments.id} AND r.status = 'acknowledged')`,
      ),
    )
    .get();
  if (!row || !row.phone) {
    throw new AppError(
      404,
      'ASSIGNMENT_CONTACT_NOT_FOUND',
      'Không tìm thấy liên hệ được phép xem.',
    );
  }
  await db.insert(auditLogs).values({
    id: crypto.randomUUID(),
    actorId: tutorId,
    action: 'assignment.contact_viewed',
    targetType: 'class_assignment',
    targetId: assignmentId,
    metadata: JSON.stringify({ classId: row.classId }),
    createdAt: new Date().toISOString(),
  });
  return { ...row, phone: row.phone };
}
