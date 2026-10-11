import type {
  CancelClassInput,
  ClassLifecycle,
  ClassLifecycleActionInput,
  ClassLifecycleEvent,
  TutorAssignmentHistory,
} from '../../../shared/schemas/admin-assignments';
import type { Page } from '../../../shared/schemas/discovery';
import { AppError } from '../../lib/errors';

type ContextRow = {
  class_id: string;
  class_status: ClassLifecycle['classStatus'];
  class_version: number;
  request_id: string;
  request_status: ClassLifecycle['requestStatus'];
  request_version: number;
  assignment_id: string | null;
  assignment_version: number | null;
  tutor_display_name: string | null;
};
type EventRow = {
  id: string;
  class_id: string;
  assignment_id: string | null;
  event_type: ClassLifecycleEvent['eventType'];
  actor_id: string;
  reason: string;
  created_at: string;
};

const stale = () =>
  new AppError(409, 'CLASS_LIFECYCLE_STALE', 'Trạng thái lớp đã thay đổi. Vui lòng tải lại.');

function rootMessage(error: unknown): string {
  let cause = error;
  while (cause instanceof Error && cause.cause !== undefined) cause = cause.cause;
  return cause instanceof Error ? cause.message : String(cause);
}

export async function getClassLifecycle(db: D1Database, classId: string): Promise<ClassLifecycle> {
  const context = await db
    .prepare(
      `SELECT c.id AS class_id, c.status AS class_status, c.version AS class_version,
        r.id AS request_id, r.status AS request_status, r.version AS request_version,
        a.id AS assignment_id, a.version AS assignment_version,
        u.display_name AS tutor_display_name
       FROM class_listings c
       JOIN parent_requests r ON r.id = c.source_request_id
       LEFT JOIN class_assignments a ON a.class_id = c.id AND a.status = 'active'
       LEFT JOIN users u ON u.id = a.tutor_user_id
       WHERE c.id = ?`,
    )
    .bind(classId)
    .first<ContextRow>();
  if (!context) throw new AppError(404, 'CLASS_NOT_FOUND', 'Không tìm thấy lớp học.');
  const history = await db
    .prepare(
      `SELECT id, class_id, assignment_id, event_type, actor_id, reason, created_at
       FROM class_lifecycle_events WHERE class_id = ?
       UNION ALL
       SELECT id, class_id, NULL AS assignment_id, 'cancelled' AS event_type,
         actor_id, reason, created_at
       FROM class_cancellations WHERE class_id = ?
       ORDER BY created_at DESC, id DESC LIMIT 100`,
    )
    .bind(classId, classId)
    .all<EventRow>();
  return {
    classId,
    classStatus: context.class_status,
    classVersion: context.class_version,
    requestStatus: context.request_status,
    requestVersion: context.request_version,
    assignmentId: context.class_status === 'active' ? context.assignment_id : null,
    assignmentVersion: context.class_status === 'active' ? context.assignment_version : null,
    tutorDisplayName: context.class_status === 'active' ? context.tutor_display_name : null,
    events: history.results.map((row) => ({
      id: row.id,
      classId: row.class_id,
      assignmentId: row.assignment_id,
      eventType: row.event_type,
      actorId: row.actor_id,
      reason: row.reason,
      createdAt: row.created_at,
    })),
  };
}

export async function transitionClass(
  db: D1Database,
  actorId: string,
  classId: string,
  action: 'revoke' | 'complete',
  input: ClassLifecycleActionInput,
): Promise<ClassLifecycle> {
  const current = await getClassLifecycle(db, classId);
  if (
    current.classStatus !== 'active' ||
    current.requestStatus !== 'assigned' ||
    current.classVersion !== input.classVersion ||
    current.requestVersion !== input.requestVersion ||
    current.assignmentId !== input.assignmentId ||
    current.assignmentVersion !== input.assignmentVersion
  )
    throw stale();

  const now = new Date().toISOString();
  const mutationId = crypto.randomUUID();
  const eventId = crypto.randomUUID();
  const requestStatus = action === 'revoke' ? 'sourcing' : 'fulfilled';
  const classStatus = action === 'revoke' ? 'open' : 'completed';
  const assignmentUpdate =
    action === 'revoke'
      ? `UPDATE class_assignments SET status = 'revoked', revoked_at = ?,
           version = version + 1, mutation_id = ?
         WHERE id = ? AND class_id = ? AND status = 'active' AND version = ?`
      : `UPDATE class_assignments SET version = version + 1, mutation_id = ?
         WHERE id = ? AND class_id = ? AND status = 'active' AND version = ?`;
  const assignmentBind =
    action === 'revoke'
      ? [now, mutationId, input.assignmentId, classId, input.assignmentVersion]
      : [mutationId, input.assignmentId, classId, input.assignmentVersion];
  try {
    await db.batch([
      db
        .prepare(
          `UPDATE parent_requests SET status = ?, version = version + 1,
             mutation_id = ?, updated_at = ?
           WHERE id = (SELECT source_request_id FROM class_listings WHERE id = ?)
             AND status = 'assigned' AND version = ?`,
        )
        .bind(requestStatus, mutationId, now, classId, input.requestVersion),
      db
        .prepare(
          `UPDATE class_listings SET status = ?, version = version + 1,
             mutation_id = ?, updated_at = ?
           WHERE id = ? AND status = 'active' AND version = ?`,
        )
        .bind(classStatus, mutationId, now, classId, input.classVersion),
      db.prepare(assignmentUpdate).bind(...assignmentBind),
      db
        .prepare(
          `INSERT INTO class_lifecycle_events
           (id, class_id, assignment_id, event_type, actor_id, reason, mutation_id, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          eventId,
          classId,
          input.assignmentId,
          action === 'revoke' ? 'revoked' : 'completed',
          actorId,
          input.reason,
          mutationId,
          now,
        ),
      db
        .prepare(
          `INSERT INTO audit_logs
           (id, actor_id, action, target_type, target_id, metadata, created_at)
           VALUES (?, ?, ?, 'class_assignment', ?, ?, ?)`,
        )
        .bind(
          crypto.randomUUID(),
          actorId,
          action === 'revoke' ? 'assignment.revoked' : 'class.completed',
          input.assignmentId,
          JSON.stringify({
            classId,
            reason: input.reason,
            from: 'active',
            to: classStatus,
            requestStatus,
            eventId,
          }),
          now,
        ),
    ]);
  } catch (error) {
    if (
      rootMessage(error).includes('CLASS_LIFECYCLE_INCOMPLETE') ||
      rootMessage(error).includes('UNIQUE constraint failed')
    )
      throw stale();
    throw error;
  }
  return getClassLifecycle(db, classId);
}

export async function cancelOpenClass(
  db: D1Database,
  actorId: string,
  classId: string,
  input: CancelClassInput,
): Promise<ClassLifecycle> {
  const current = await getClassLifecycle(db, classId);
  if (
    current.classStatus !== 'open' ||
    current.requestStatus !== 'sourcing' ||
    current.classVersion !== input.classVersion ||
    current.requestVersion !== input.requestVersion ||
    current.assignmentId !== null
  )
    throw stale();
  const now = new Date().toISOString();
  const mutationId = crypto.randomUUID();
  const applicationsMutationId = crypto.randomUUID();
  const eventId = crypto.randomUUID();
  const rejectionReason = `Lớp đã hủy: ${input.reason}`;
  try {
    await db.batch([
      db
        .prepare(
          `UPDATE parent_requests SET status = 'cancelled', version = version + 1,
             mutation_id = ?, updated_at = ?
           WHERE id = (SELECT source_request_id FROM class_listings WHERE id = ?)
             AND status = 'sourcing' AND version = ?`,
        )
        .bind(mutationId, now, classId, input.requestVersion),
      db
        .prepare(
          `UPDATE class_listings SET status = 'cancelled', version = version + 1,
             mutation_id = ?, updated_at = ?
           WHERE id = ? AND status = 'open' AND version = ?
             AND NOT EXISTS (SELECT 1 FROM class_assignments a
               WHERE a.class_id = class_listings.id AND a.status = 'active')`,
        )
        .bind(mutationId, now, classId, input.classVersion),
      db
        .prepare(
          `UPDATE tutor_applications SET status = 'rejected', rejection_reason = ?,
             version = version + 1, mutation_id = ?, updated_at = ?
           WHERE class_id = ? AND status = 'submitted'`,
        )
        .bind(rejectionReason, applicationsMutationId, now, classId),
      db
        .prepare(
          `INSERT INTO class_cancellations
           (id, class_id, actor_id, reason, mutation_id, created_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .bind(eventId, classId, actorId, input.reason, mutationId, now),
      db
        .prepare(
          `INSERT INTO audit_logs
           (id, actor_id, action, target_type, target_id, metadata, created_at)
           SELECT lower(hex(randomblob(16))), ?, 'application.rejected',
             'tutor_application', id,
             json_object('from', 'submitted', 'to', 'rejected',
               'classId', ?, 'reason', ?), ?
           FROM tutor_applications WHERE class_id = ? AND status = 'rejected'
             AND mutation_id = ?`,
        )
        .bind(actorId, classId, rejectionReason, now, classId, applicationsMutationId),
      db
        .prepare(
          `INSERT INTO audit_logs
           (id, actor_id, action, target_type, target_id, metadata, created_at)
           VALUES (?, ?, 'class.cancelled', 'class_listing', ?, ?, ?)`,
        )
        .bind(
          crypto.randomUUID(),
          actorId,
          classId,
          JSON.stringify({
            from: 'open',
            to: 'cancelled',
            requestStatus: 'cancelled',
            reason: input.reason,
            eventId,
          }),
          now,
        ),
    ]);
  } catch (error) {
    if (
      rootMessage(error).includes('CLASS_CANCELLATION_INCOMPLETE') ||
      rootMessage(error).includes('UNIQUE constraint failed')
    )
      throw stale();
    throw error;
  }
  return getClassLifecycle(db, classId);
}

type TutorHistoryRow = {
  assignment_id: string;
  class_id: string;
  class_code: string;
  subject_name: string;
  grade: string;
  mode: 'online' | 'offline';
  event_type: 'revoked' | 'completed';
  reason: string;
  created_at: string;
};

export async function listTutorAssignmentHistory(
  db: D1Database,
  tutorId: string,
  page: number,
  pageSize: number,
): Promise<Page<TutorAssignmentHistory>> {
  const [rows, count] = await Promise.all([
    db
      .prepare(
        `SELECT e.assignment_id, e.class_id, c.code AS class_code,
          s.name AS subject_name, c.grade, c.mode, e.event_type, e.reason, e.created_at
         FROM class_lifecycle_events e
         JOIN class_assignments a ON a.id = e.assignment_id
         JOIN class_listings c ON c.id = e.class_id
         JOIN subjects s ON s.id = c.subject_id
         WHERE a.tutor_user_id = ?
         ORDER BY e.created_at DESC, e.id DESC LIMIT ? OFFSET ?`,
      )
      .bind(tutorId, pageSize, (page - 1) * pageSize)
      .all<TutorHistoryRow>(),
    db
      .prepare(
        `SELECT count(*) AS total FROM class_lifecycle_events e
         JOIN class_assignments a ON a.id = e.assignment_id WHERE a.tutor_user_id = ?`,
      )
      .bind(tutorId)
      .first<{ total: number }>(),
  ]);
  return {
    items: rows.results.map((row) => ({
      assignmentId: row.assignment_id,
      classId: row.class_id,
      classCode: row.class_code,
      subjectName: row.subject_name,
      grade: row.grade,
      mode: row.mode,
      outcome: row.event_type,
      reason: row.reason,
      endedAt: row.created_at,
    })),
    page,
    pageSize,
    total: count?.total ?? 0,
  };
}
