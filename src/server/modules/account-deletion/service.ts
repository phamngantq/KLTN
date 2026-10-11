import { and, eq, inArray, isNotNull, or, sql } from 'drizzle-orm';
import type { BatchItem } from 'drizzle-orm/batch';
import type { DeletedAccount } from '../../../shared/schemas/privacy';
import type { Db } from '../../db/client';
import {
  accountDeletions,
  auditLogs,
  authCredentials,
  authSessions,
  availabilityExceptions,
  availabilityRules,
  bookings,
  classAssignments,
  classCancellations,
  classLifecycleEvents,
  classListings,
  complaints,
  idempotencyKeys,
  parentProfiles,
  parentRequestPrivate,
  parentRequests,
  requestScheduleWindows,
  tutorProfiles,
  tutorOfferJoinRequests,
  tutorStudentOffers,
  tutorApplications,
  users,
} from '../../db/schema';
import { AppError } from '../../lib/errors';

const obligationMessage =
  'Tài khoản còn lịch, yêu cầu hoặc lớp đang xử lý. Vui lòng liên hệ kiểm duyệt viên để hoàn tất trước khi xóa.';
const redactedReason = 'Đã ẩn thông tin';

function rootErrorMessage(error: unknown): string {
  let cause = error;
  while (cause instanceof Error && cause.cause !== undefined) cause = cause.cause;
  return cause instanceof Error ? cause.message : String(cause);
}

/** Keeps the referential identity but removes credential and contact fields in one D1 transaction. */
export async function deleteOwnAccount(db: Db, userId: string): Promise<DeletedAccount> {
  const owner = await db
    .select({ id: users.id })
    .from(users)
    .where(
      and(
        eq(users.id, userId),
        eq(users.status, 'active'),
        inArray(users.role, ['student', 'tutor']),
      ),
    )
    .get();
  if (!owner) throw new AppError(409, 'ACCOUNT_NOT_DELETABLE', 'Tài khoản không thể xóa.');

  const now = new Date().toISOString();
  const redactedEmail = `deleted-${userId}@example.invalid`;
  const requestIds = db
    .select({ id: parentRequests.id })
    .from(parentRequests)
    .where(eq(parentRequests.parentUserId, userId));
  // A tutor can appear on another parent's class through an application or
  // assignment. Free text about that class can still identify the tutor.
  const affectedClassIds = db
    .select({ id: classListings.id })
    .from(classListings)
    .where(
      or(
        eq(classListings.parentUserId, userId),
        sql`EXISTS (SELECT 1 FROM tutor_applications a
          WHERE a.class_id = ${classListings.id} AND a.tutor_user_id = ${userId})`,
        sql`EXISTS (SELECT 1 FROM class_assignments a
          WHERE a.class_id = ${classListings.id} AND a.tutor_user_id = ${userId})`,
      ),
    );
  const affectedRequestIds = db
    .select({ id: classListings.sourceRequestId })
    .from(classListings)
    .where(inArray(classListings.id, affectedClassIds));
  const affectedApplicationIds = db
    .select({ id: tutorApplications.id })
    .from(tutorApplications)
    .where(inArray(tutorApplications.classId, affectedClassIds));
  const affectedAssignmentIds = db
    .select({ id: classAssignments.id })
    .from(classAssignments)
    .where(inArray(classAssignments.classId, affectedClassIds));
  const affectedTutorOfferIds = db
    .select({ id: tutorStudentOffers.id })
    .from(tutorStudentOffers)
    .where(eq(tutorStudentOffers.tutorUserId, userId));
  const affectedTutorOfferJoinIds = db
    .select({ id: tutorOfferJoinRequests.id })
    .from(tutorOfferJoinRequests)
    .where(
      or(
        eq(tutorOfferJoinRequests.parentUserId, userId),
        inArray(tutorOfferJoinRequests.offerId, affectedTutorOfferIds),
      ),
    );
  const affectedComplaintIds = db
    .select({ id: complaints.id })
    .from(complaints)
    .where(or(eq(complaints.creatorUserId, userId), inArray(complaints.classId, affectedClassIds)));
  const ownBookingIds = db
    .select({ id: bookings.id })
    .from(bookings)
    .where(or(eq(bookings.studentId, userId), eq(bookings.tutorId, userId)));
  const statements: BatchItem<'sqlite'>[] = [
    db
      .update(parentRequests)
      .set({
        area: sql`CASE WHEN ${parentRequests.mode} = 'offline' THEN 'Đã ẩn khu vực' ELSE NULL END`,
        description: 'Nội dung đã xóa',
        discussLater: true,
        version: sql`${parentRequests.version} + 1`,
        mutationId: crypto.randomUUID(),
        updatedAt: now,
      })
      .where(eq(parentRequests.parentUserId, userId)),
    db.delete(requestScheduleWindows).where(inArray(requestScheduleWindows.requestId, requestIds)),
    db.delete(parentRequestPrivate).where(inArray(parentRequestPrivate.requestId, requestIds)),
    db
      .update(classListings)
      .set({ publicArea: null, updatedAt: now })
      .where(eq(classListings.parentUserId, userId)),
    db.delete(parentProfiles).where(eq(parentProfiles.userId, userId)),
    db.delete(availabilityRules).where(eq(availabilityRules.tutorId, userId)),
    db.delete(availabilityExceptions).where(eq(availabilityExceptions.tutorId, userId)),
    db.delete(tutorProfiles).where(eq(tutorProfiles.userId, userId)),
    db
      .update(tutorStudentOffers)
      .set({
        area: sql`CASE WHEN ${tutorStudentOffers.mode} = 'offline' THEN 'Đã ẩn khu vực' ELSE NULL END`,
        rejectionReason: sql`CASE WHEN ${tutorStudentOffers.rejectionReason} IS NULL THEN NULL ELSE ${redactedReason} END`,
        contactPhone: null,
        version: sql`${tutorStudentOffers.version} + 1`,
        mutationId: crypto.randomUUID(),
        updatedAt: now,
      })
      .where(
        and(
          eq(tutorStudentOffers.tutorUserId, userId),
          inArray(tutorStudentOffers.status, ['draft', 'rejected', 'closed']),
        ),
      ),
    db
      .update(tutorOfferJoinRequests)
      .set({
        studentGrade: 'Đã ẩn',
        learningNeeds: 'Nhu cầu học tập đã được xóa',
        teachingArea: null,
        contactPhone: null,
        rejectionReason: sql`CASE WHEN ${tutorOfferJoinRequests.rejectionReason} IS NULL THEN NULL ELSE ${redactedReason} END`,
        terminalReason: sql`CASE WHEN ${tutorOfferJoinRequests.terminalReason} IS NULL THEN NULL ELSE ${redactedReason} END`,
        version: sql`${tutorOfferJoinRequests.version} + 1`,
        mutationId: crypto.randomUUID(),
        updatedAt: now,
      })
      .where(
        and(
          eq(tutorOfferJoinRequests.parentUserId, userId),
          inArray(tutorOfferJoinRequests.status, ['withdrawn', 'rejected', 'completed', 'revoked']),
        ),
      ),
    db
      .update(complaints)
      .set({
        title: 'Khiếu nại đã xóa',
        body: 'Nội dung khiếu nại đã được xóa cùng tài khoản.',
        triageReason: sql`CASE WHEN ${complaints.triageReason} IS NULL THEN NULL ELSE ${redactedReason} END`,
        resolution: sql`CASE WHEN ${complaints.resolution} IS NULL THEN NULL ELSE ${redactedReason} END`,
        version: sql`${complaints.version} + 1`,
        mutationId: crypto.randomUUID(),
        updatedAt: now,
      })
      .where(
        or(eq(complaints.creatorUserId, userId), inArray(complaints.classId, affectedClassIds)),
      ),
    db
      .update(tutorApplications)
      .set({
        rejectionReason: redactedReason,
        version: sql`${tutorApplications.version} + 1`,
        mutationId: crypto.randomUUID(),
        updatedAt: now,
      })
      .where(
        and(
          inArray(tutorApplications.classId, affectedClassIds),
          isNotNull(tutorApplications.rejectionReason),
        ),
      ),
    db
      .update(auditLogs)
      .set({ metadata: JSON.stringify({ redactedOnAccountDeletion: true }) })
      .where(
        or(
          eq(auditLogs.actorId, userId),
          eq(auditLogs.targetId, userId),
          and(eq(auditLogs.targetType, 'parent_request'), inArray(auditLogs.targetId, requestIds)),
          and(
            eq(auditLogs.targetType, 'parent_request'),
            inArray(auditLogs.targetId, affectedRequestIds),
          ),
          and(
            eq(auditLogs.targetType, 'class_listing'),
            inArray(auditLogs.targetId, affectedClassIds),
          ),
          and(
            eq(auditLogs.targetType, 'complaint'),
            inArray(auditLogs.targetId, affectedComplaintIds),
          ),
          and(
            eq(auditLogs.targetType, 'tutor_application'),
            inArray(auditLogs.targetId, affectedApplicationIds),
          ),
          and(
            eq(auditLogs.targetType, 'class_assignment'),
            inArray(auditLogs.targetId, affectedAssignmentIds),
          ),
          and(eq(auditLogs.targetType, 'booking'), inArray(auditLogs.targetId, ownBookingIds)),
          and(
            eq(auditLogs.targetType, 'tutor_student_offer'),
            inArray(auditLogs.targetId, affectedTutorOfferIds),
          ),
          and(
            eq(auditLogs.targetType, 'tutor_offer_join_request'),
            inArray(auditLogs.targetId, affectedTutorOfferJoinIds),
          ),
        ),
      ),
    db.delete(idempotencyKeys).where(eq(idempotencyKeys.actorId, userId)),
    db.delete(authSessions).where(eq(authSessions.userId, userId)),
    db.delete(authCredentials).where(eq(authCredentials.userId, userId)),
    db.insert(accountDeletions).values({ userId, deletedAt: now }),
    db
      .update(classLifecycleEvents)
      .set({ reason: redactedReason })
      .where(inArray(classLifecycleEvents.classId, affectedClassIds)),
    db
      .update(classCancellations)
      .set({ reason: redactedReason })
      .where(inArray(classCancellations.classId, affectedClassIds)),
    db
      .update(users)
      .set({
        email: redactedEmail,
        emailNormalized: redactedEmail,
        displayName: 'Tài khoản đã xóa',
        status: 'suspended',
        updatedAt: now,
      })
      .where(and(eq(users.id, userId), eq(users.status, 'active'))),
    db.insert(auditLogs).values({
      id: crypto.randomUUID(),
      actorId: userId,
      action: 'account.deleted',
      targetType: 'user',
      targetId: userId,
      metadata: JSON.stringify({ deidentified: true }),
      createdAt: now,
    }),
  ];
  try {
    await db.batch(statements as [BatchItem<'sqlite'>, ...BatchItem<'sqlite'>[]]);
  } catch (error) {
    if (rootErrorMessage(error).includes('ACCOUNT_DELETION_BLOCKED')) {
      await db.insert(auditLogs).values({
        id: crypto.randomUUID(),
        actorId: userId,
        action: 'account.deletion_blocked',
        targetType: 'user',
        targetId: userId,
        metadata: JSON.stringify({ reason: 'active_obligations' }),
        createdAt: now,
      });
      throw new AppError(409, 'ACCOUNT_HAS_ACTIVE_OBLIGATIONS', obligationMessage);
    }
    throw error;
  }
  return { deletedAt: now };
}
