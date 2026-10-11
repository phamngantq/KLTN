import type { Page } from '../../../shared/schemas/discovery';
import {
  TUTOR_OFFER_JOIN_CONTACT_CONSENT_VERSION,
  TUTOR_OFFER_JOIN_DETAILS_CONSENT_VERSION,
  type AdminTutorOfferJoin,
  type AdminTutorOfferJoinDetail,
  type CreateTutorOfferJoinInput,
  type ParentTutorOfferJoin,
  type TutorOfferJoinContact,
  type TutorOfferJoinForTutor,
  type TutorOfferJoinListQuery,
} from '../../../shared/schemas/tutor-offer-joins';
import { AppError } from '../../lib/errors';
import { getPublic } from '../tutor-offers/service';

const missing = () =>
  new AppError(404, 'TUTOR_OFFER_JOIN_NOT_FOUND', 'Không tìm thấy yêu cầu tham gia lớp.');
const stale = () =>
  new AppError(409, 'TUTOR_OFFER_JOIN_STALE', 'Yêu cầu đã thay đổi. Vui lòng tải lại.');

interface JoinRow {
  id: string;
  offer_id: string;
  offer_status: string;
  subject_name: string;
  offer_grade: string;
  offer_mode: 'online' | 'offline';
  proposed_tuition_per_session_minor: number;
  parent_user_id: string;
  parent_display_name: string;
  tutor_user_id: string;
  student_grade: string;
  learning_needs: string;
  teaching_area: string | null;
  details_consent_version: string;
  details_consented_at: string;
  contact_consent_version: string;
  contact_consented_at: string;
  parent_contact_phone: string | null;
  tutor_contact_phone: string | null;
  status: ParentTutorOfferJoin['status'];
  version: number;
  reviewed_by: string | null;
  reviewed_at: string | null;
  rejection_reason: string | null;
  agreed_tuition_per_session_minor: number | null;
  terminated_by: string | null;
  terminated_at: string | null;
  terminal_reason: string | null;
  created_at: string;
  updated_at: string;
}

const joinSelect = `SELECT j.id, j.offer_id, o.status AS offer_status,
  s.name AS subject_name, o.grade AS offer_grade, o.mode AS offer_mode,
  o.proposed_tuition_per_session_minor, j.parent_user_id,
  parent.display_name AS parent_display_name, o.tutor_user_id,
  j.student_grade, j.learning_needs, j.teaching_area,
  j.details_consent_version, j.details_consented_at,
  j.contact_consent_version, j.contact_consented_at,
  j.contact_phone AS parent_contact_phone, o.contact_phone AS tutor_contact_phone,
  j.status, j.version, j.reviewed_by, j.reviewed_at, j.rejection_reason,
  j.agreed_tuition_per_session_minor, j.terminated_by, j.terminated_at,
  j.terminal_reason, j.created_at, j.updated_at
  FROM tutor_offer_join_requests j
  JOIN tutor_student_offers o ON o.id = j.offer_id
  JOIN subjects s ON s.id = o.subject_id
  JOIN users parent ON parent.id = j.parent_user_id`;

function parentProject(row: JoinRow): ParentTutorOfferJoin {
  return {
    id: row.id,
    offerId: row.offer_id,
    offerStatus: row.offer_status,
    subjectName: row.subject_name,
    offerGrade: row.offer_grade,
    offerMode: row.offer_mode,
    proposedTuitionPerSessionMinor: row.proposed_tuition_per_session_minor,
    studentGrade: row.student_grade,
    learningNeeds: row.learning_needs,
    teachingArea: row.teaching_area,
    status: row.status,
    version: row.version,
    detailsConsentVersion: row.details_consent_version,
    detailsConsentedAt: row.details_consented_at,
    contactConsentVersion: row.contact_consent_version,
    contactConsentedAt: row.contact_consented_at,
    reviewedAt: row.reviewed_at,
    rejectionReason: row.rejection_reason,
    agreedTuitionPerSessionMinor: row.agreed_tuition_per_session_minor,
    terminatedAt: row.terminated_at,
    terminalReason: row.terminal_reason,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function adminProject(row: JoinRow): AdminTutorOfferJoin {
  return {
    ...parentProject(row),
    parentUserId: row.parent_user_id,
    parentDisplayName: row.parent_display_name,
    tutorUserId: row.tutor_user_id,
    reviewedBy: row.reviewed_by,
    terminatedBy: row.terminated_by,
  };
}

function adminDetailProject(row: JoinRow): AdminTutorOfferJoinDetail {
  return {
    ...adminProject(row),
    parentContactPhone: row.parent_contact_phone,
    tutorContactPhone: row.tutor_contact_phone,
  };
}

function rootMessage(error: unknown): string {
  let cause = error;
  while (cause instanceof Error && cause.cause !== undefined) cause = cause.cause;
  return cause instanceof Error ? cause.message : String(cause);
}

function mapWriteError(error: unknown): never {
  const message = rootMessage(error);
  if (message.includes('UNIQUE constraint failed')) {
    throw new AppError(409, 'TUTOR_OFFER_JOIN_EXISTS', 'Bạn đã gửi yêu cầu cho lớp này.');
  }
  if (message.includes('TUTOR_OFFER_JOIN_NOT_ALLOWED')) {
    throw new AppError(
      409,
      'TUTOR_OFFER_JOIN_UNAVAILABLE',
      'Lớp hoặc tài khoản không còn đủ điều kiện nhận yêu cầu.',
    );
  }
  if (message.includes('TUTOR_OFFER_JOIN_CONTACT_NOT_READY')) {
    throw new AppError(
      409,
      'TUTOR_OFFER_JOIN_CONTACT_NOT_READY',
      'Gia sư chưa cung cấp số điện thoại hoặc xác nhận chia sẻ liên hệ.',
    );
  }
  if (message.includes('TUTOR_OFFER_JOIN_APPROVAL_NOT_ALLOWED')) {
    throw new AppError(
      409,
      'TUTOR_OFFER_JOIN_APPROVAL_NOT_ALLOWED',
      'Yêu cầu hoặc lớp không còn đủ điều kiện phê duyệt.',
    );
  }
  if (message.includes('TUTOR_OFFER_JOIN_INVALID_TRANSITION')) throw stale();
  if (message.includes('TUTOR_OFFER_JOIN_REVIEW_NOT_ALLOWED')) {
    throw new AppError(403, 'FORBIDDEN', 'Tài khoản không được duyệt yêu cầu.');
  }
  throw error;
}

function audit(
  db: D1Database,
  actorId: string,
  action: string,
  id: string,
  metadata: Record<string, unknown>,
  now: string,
  mutationId: string,
): D1PreparedStatement {
  return db
    .prepare(
      `INSERT INTO audit_logs (id, actor_id, action, target_type, target_id, metadata, created_at)
       SELECT ?, ?, ?, 'tutor_offer_join_request', ?, ?, ?
       WHERE EXISTS (SELECT 1 FROM tutor_offer_join_requests WHERE id = ? AND mutation_id = ?)`,
    )
    .bind(crypto.randomUUID(), actorId, action, id, JSON.stringify(metadata), now, id, mutationId);
}

async function auditRead(
  db: D1Database,
  actorId: string,
  action: string,
  id: string,
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO audit_logs (id, actor_id, action, target_type, target_id, metadata, created_at)
       VALUES (?, ?, ?, 'tutor_offer_join_request', ?, '{}', ?)`,
    )
    .bind(crypto.randomUUID(), actorId, action, id, new Date().toISOString())
    .run();
}

export async function getParent(
  db: D1Database,
  parentId: string,
  id: string,
): Promise<ParentTutorOfferJoin> {
  const row = await db
    .prepare(`${joinSelect} WHERE j.id = ? AND j.parent_user_id = ?`)
    .bind(id, parentId)
    .first<JoinRow>();
  if (!row) throw missing();
  return parentProject(row);
}

export async function listParent(
  db: D1Database,
  parentId: string,
  query: TutorOfferJoinListQuery,
): Promise<Page<ParentTutorOfferJoin>> {
  const where =
    'j.parent_user_id = ? AND (? IS NULL OR j.status = ?) AND (? IS NULL OR j.offer_id = ?)';
  const args = [
    parentId,
    query.status ?? null,
    query.status ?? null,
    query.offerId ?? null,
    query.offerId ?? null,
  ];
  const [rows, count] = await Promise.all([
    db
      .prepare(
        `${joinSelect} WHERE ${where} ORDER BY j.created_at DESC, j.id DESC LIMIT ? OFFSET ?`,
      )
      .bind(...args, query.pageSize, (query.page - 1) * query.pageSize)
      .all<JoinRow>(),
    db
      .prepare(`SELECT count(*) AS count FROM tutor_offer_join_requests j WHERE ${where}`)
      .bind(...args)
      .first<{ count: number }>(),
  ]);
  return {
    items: rows.results.map(parentProject),
    page: query.page,
    pageSize: query.pageSize,
    total: count?.count ?? 0,
  };
}

export async function getAdmin(db: D1Database, id: string): Promise<AdminTutorOfferJoin> {
  const row = await db.prepare(`${joinSelect} WHERE j.id = ?`).bind(id).first<JoinRow>();
  if (!row) throw missing();
  return adminProject(row);
}

export async function getAdminDetail(
  db: D1Database,
  moderatorId: string,
  id: string,
): Promise<AdminTutorOfferJoinDetail> {
  const row = await db.prepare(`${joinSelect} WHERE j.id = ?`).bind(id).first<JoinRow>();
  if (!row) throw missing();
  await auditRead(db, moderatorId, 'tutor_offer_join.admin_contact_viewed', id);
  return adminDetailProject(row);
}

export async function listAdmin(
  db: D1Database,
  query: TutorOfferJoinListQuery,
): Promise<Page<AdminTutorOfferJoin>> {
  const where = '(? IS NULL OR j.status = ?)';
  const args = [query.status ?? null, query.status ?? null];
  const [rows, count] = await Promise.all([
    db
      .prepare(
        `${joinSelect} WHERE ${where} ORDER BY j.created_at DESC, j.id DESC LIMIT ? OFFSET ?`,
      )
      .bind(...args, query.pageSize, (query.page - 1) * query.pageSize)
      .all<JoinRow>(),
    db
      .prepare(`SELECT count(*) AS count FROM tutor_offer_join_requests j WHERE ${where}`)
      .bind(...args)
      .first<{ count: number }>(),
  ]);
  return {
    items: rows.results.map(adminProject),
    page: query.page,
    pageSize: query.pageSize,
    total: count?.count ?? 0,
  };
}

export async function listTutor(
  db: D1Database,
  tutorId: string,
  offerId: string,
  query: { page: number; pageSize: number },
): Promise<Page<TutorOfferJoinForTutor>> {
  const offer = await db
    .prepare(
      `SELECT o.id FROM tutor_student_offers o
       JOIN users u ON u.id = o.tutor_user_id
       JOIN tutor_profiles p ON p.user_id = o.tutor_user_id
       WHERE o.id = ? AND o.tutor_user_id = ? AND o.status IN ('published', 'closed')
         AND u.status = 'active' AND p.approval_status = 'approved' AND p.visibility = 'public'`,
    )
    .bind(offerId, tutorId)
    .first<{ id: string }>();
  if (!offer) throw missing();
  const [rows, count] = await Promise.all([
    db
      .prepare(
        `SELECT id, status, student_grade, learning_needs, teaching_area,
          agreed_tuition_per_session_minor, created_at
         FROM tutor_offer_join_requests WHERE offer_id = ?
         ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`,
      )
      .bind(offerId, query.pageSize, (query.page - 1) * query.pageSize)
      .all<{
        id: string;
        status: TutorOfferJoinForTutor['status'];
        student_grade: string;
        learning_needs: string;
        teaching_area: string | null;
        agreed_tuition_per_session_minor: number | null;
        created_at: string;
      }>(),
    db
      .prepare('SELECT count(*) AS count FROM tutor_offer_join_requests WHERE offer_id = ?')
      .bind(offerId)
      .first<{ count: number }>(),
  ]);
  return {
    items: rows.results.map((row) => ({
      id: row.id,
      status: row.status,
      studentGrade: row.student_grade,
      learningNeeds: row.learning_needs,
      teachingArea: row.teaching_area,
      agreedTuitionPerSessionMinor: row.agreed_tuition_per_session_minor,
      createdAt: row.created_at,
    })),
    page: query.page,
    pageSize: query.pageSize,
    total: count?.count ?? 0,
  };
}

export async function create(
  db: D1Database,
  parentId: string,
  offerId: string,
  input: CreateTutorOfferJoinInput,
): Promise<ParentTutorOfferJoin> {
  const offer = await getPublic(db, offerId);
  if (offer.version !== input.offerVersion) {
    throw new AppError(409, 'TUTOR_OFFER_JOIN_OFFER_STALE', 'Lớp đã thay đổi. Vui lòng tải lại.');
  }
  if (offer.grade !== input.studentGrade) {
    throw new AppError(422, 'VALIDATION_ERROR', 'Lớp học của học viên không khớp với lớp đã đăng.');
  }
  if (offer.mode === 'offline' && input.teachingArea === null) {
    throw new AppError(422, 'VALIDATION_ERROR', 'Lớp tại nhà cần khu vực học chung.');
  }
  const existing = await db
    .prepare(
      `SELECT id FROM tutor_offer_join_requests
       WHERE offer_id = ? AND parent_user_id = ? AND status IN ('submitted', 'approved')`,
    )
    .bind(offerId, parentId)
    .first<{ id: string }>();
  if (existing) {
    throw new AppError(409, 'TUTOR_OFFER_JOIN_EXISTS', 'Bạn đã gửi yêu cầu cho lớp này.');
  }
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const mutationId = crypto.randomUUID();
  try {
    await db.batch([
      db
        .prepare(
          `INSERT INTO tutor_offer_join_requests
           (id, offer_id, parent_user_id, offer_version, student_grade,
            learning_needs, teaching_area, contact_phone,
            details_consent_version, details_consented_at,
            contact_consent_version, contact_consented_at,
            status, version, mutation_id, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'submitted', 1, ?, ?, ?)`,
        )
        .bind(
          id,
          offerId,
          parentId,
          input.offerVersion,
          input.studentGrade,
          input.learningNeeds,
          input.teachingArea,
          input.contactPhone,
          TUTOR_OFFER_JOIN_DETAILS_CONSENT_VERSION,
          now,
          TUTOR_OFFER_JOIN_CONTACT_CONSENT_VERSION,
          now,
          mutationId,
          now,
          now,
        ),
      audit(
        db,
        parentId,
        'tutor_offer_join.submitted',
        id,
        {
          offerId,
          detailsConsentVersion: TUTOR_OFFER_JOIN_DETAILS_CONSENT_VERSION,
          contactConsentVersion: TUTOR_OFFER_JOIN_CONTACT_CONSENT_VERSION,
        },
        now,
        mutationId,
      ),
    ]);
  } catch (error) {
    mapWriteError(error);
  }
  return getParent(db, parentId, id);
}

export async function withdraw(
  db: D1Database,
  parentId: string,
  id: string,
  version: number,
): Promise<ParentTutorOfferJoin> {
  const existing = await getParent(db, parentId, id);
  if (existing.status !== 'submitted' || existing.version !== version) throw stale();
  const now = new Date().toISOString();
  const mutationId = crypto.randomUUID();
  try {
    const [result] = await db.batch([
      db
        .prepare(
          `UPDATE tutor_offer_join_requests
           SET status = 'withdrawn', version = version + 1, withdrawn_at = ?,
             mutation_id = ?, updated_at = ?
           WHERE id = ? AND parent_user_id = ? AND status = 'submitted' AND version = ?`,
        )
        .bind(now, mutationId, now, id, parentId, version),
      audit(
        db,
        parentId,
        'tutor_offer_join.withdrawn',
        id,
        { version: version + 1 },
        now,
        mutationId,
      ),
    ]);
    if (result?.meta.changes !== 1) throw stale();
  } catch (error) {
    mapWriteError(error);
  }
  return getParent(db, parentId, id);
}

export async function reject(
  db: D1Database,
  moderatorId: string,
  id: string,
  input: { version: number; reason: string },
): Promise<AdminTutorOfferJoin> {
  const existing = await getAdmin(db, id);
  if (existing.status !== 'submitted' || existing.version !== input.version) throw stale();
  const now = new Date().toISOString();
  const mutationId = crypto.randomUUID();
  try {
    const [result] = await db.batch([
      db
        .prepare(
          `UPDATE tutor_offer_join_requests
           SET status = 'rejected', version = version + 1, reviewed_by = ?,
             reviewed_at = ?, rejection_reason = ?, mutation_id = ?, updated_at = ?
           WHERE id = ? AND status = 'submitted' AND version = ?`,
        )
        .bind(moderatorId, now, input.reason, mutationId, now, id, input.version),
      audit(
        db,
        moderatorId,
        'tutor_offer_join.rejected',
        id,
        { version: input.version + 1 },
        now,
        mutationId,
      ),
    ]);
    if (result?.meta.changes !== 1) throw stale();
  } catch (error) {
    mapWriteError(error);
  }
  return getAdmin(db, id);
}

export async function approve(
  db: D1Database,
  moderatorId: string,
  id: string,
  input: { version: number; agreedTuitionPerSessionMinor: number; partiesAgreed: true },
): Promise<AdminTutorOfferJoin> {
  const existing = await getAdmin(db, id);
  if (existing.status !== 'submitted' || existing.version !== input.version) throw stale();
  const phones = await db
    .prepare(
      `SELECT j.contact_phone AS parent_phone, o.contact_phone AS tutor_phone
       FROM tutor_offer_join_requests j JOIN tutor_student_offers o ON o.id = j.offer_id
       WHERE j.id = ?`,
    )
    .bind(id)
    .first<{ parent_phone: string | null; tutor_phone: string | null }>();
  if (
    existing.offerStatus !== 'published' ||
    !phones?.parent_phone ||
    !phones.tutor_phone ||
    !existing.contactConsentVersion
  ) {
    throw new AppError(
      409,
      'TUTOR_OFFER_JOIN_APPROVAL_NOT_ALLOWED',
      'Yêu cầu hoặc lớp không còn đủ điều kiện phê duyệt.',
    );
  }
  const now = new Date().toISOString();
  const mutationId = crypto.randomUUID();
  try {
    const [result] = await db.batch([
      db
        .prepare(
          `UPDATE tutor_offer_join_requests
           SET status = 'approved', version = version + 1, reviewed_by = ?,
             reviewed_at = ?, agreed_tuition_per_session_minor = ?, parties_agreed_at = ?,
             mutation_id = ?, updated_at = ?
           WHERE id = ? AND status = 'submitted' AND version = ?
             AND EXISTS (SELECT 1 FROM tutor_student_offers o WHERE o.id = offer_id
               AND o.status = 'published' AND o.contact_phone IS NOT NULL
               AND o.contact_share_consent_at IS NOT NULL
               AND o.contact_share_consent_version IS NOT NULL)`,
        )
        .bind(
          moderatorId,
          now,
          input.agreedTuitionPerSessionMinor,
          now,
          mutationId,
          now,
          id,
          input.version,
        ),
      audit(
        db,
        moderatorId,
        'tutor_offer_join.approved',
        id,
        {
          version: input.version + 1,
          agreedTuitionPerSessionMinor: input.agreedTuitionPerSessionMinor,
          partiesAgreed: input.partiesAgreed,
        },
        now,
        mutationId,
      ),
    ]);
    if (result?.meta.changes !== 1) throw stale();
  } catch (error) {
    mapWriteError(error);
  }
  return getAdmin(db, id);
}

export async function terminate(
  db: D1Database,
  moderatorId: string,
  id: string,
  input: { version: number; reason: string; status: 'completed' | 'revoked' },
): Promise<AdminTutorOfferJoin> {
  const existing = await getAdmin(db, id);
  if (existing.status !== 'approved' || existing.version !== input.version) throw stale();
  const now = new Date().toISOString();
  const mutationId = crypto.randomUUID();
  try {
    const [result] = await db.batch([
      db
        .prepare(
          `UPDATE tutor_offer_join_requests
           SET status = ?, version = version + 1, terminated_by = ?,
             terminated_at = ?, terminal_reason = ?, mutation_id = ?, updated_at = ?
           WHERE id = ? AND status = 'approved' AND version = ?`,
        )
        .bind(input.status, moderatorId, now, input.reason, mutationId, now, id, input.version),
      audit(
        db,
        moderatorId,
        input.status === 'completed' ? 'tutor_offer_join.completed' : 'tutor_offer_join.revoked',
        id,
        { version: input.version + 1 },
        now,
        mutationId,
      ),
    ]);
    if (result?.meta.changes !== 1) throw stale();
  } catch (error) {
    mapWriteError(error);
  }
  return getAdmin(db, id);
}

function contactUnavailable() {
  return new AppError(
    409,
    'TUTOR_OFFER_JOIN_CONTACT_UNAVAILABLE',
    'Chỉ xem được số điện thoại khi yêu cầu đang được phê duyệt.',
  );
}

/** Both the approved join and the requesting parent's ownership are checked on every read. */
export async function getTutorContactForParent(
  db: D1Database,
  parentId: string,
  id: string,
): Promise<TutorOfferJoinContact> {
  const existing = await getParent(db, parentId, id);
  if (existing.status !== 'approved') throw contactUnavailable();
  const source = `FROM tutor_offer_join_requests j
       JOIN tutor_student_offers o ON o.id = j.offer_id
       JOIN users parent ON parent.id = j.parent_user_id
       JOIN users tutor ON tutor.id = o.tutor_user_id
       JOIN tutor_profiles p ON p.user_id = o.tutor_user_id
       WHERE j.id = ? AND j.parent_user_id = ? AND j.status = 'approved'
         AND j.contact_phone IS NOT NULL AND j.contact_consent_version IS NOT NULL
         AND j.contact_consented_at IS NOT NULL
         AND o.contact_phone IS NOT NULL AND o.contact_share_consent_at IS NOT NULL
         AND o.contact_share_consent_version IS NOT NULL
         AND parent.status = 'active' AND tutor.status = 'active'
         AND p.approval_status = 'approved'`;
  const [read, logged] = await db.batch<{ phone: string }>([
    db.prepare(`SELECT o.contact_phone AS phone ${source}`).bind(id, parentId),
    db
      .prepare(
        `INSERT INTO audit_logs (id, actor_id, action, target_type, target_id, metadata, created_at)
         SELECT ?, ?, 'tutor_offer_join.tutor_contact_viewed',
           'tutor_offer_join_request', ?, '{}', ?
         WHERE EXISTS (SELECT 1 ${source})`,
      )
      .bind(crypto.randomUUID(), parentId, id, new Date().toISOString(), id, parentId),
  ]);
  const row = read?.results[0];
  if (!row) throw contactUnavailable();
  if (logged?.meta.changes !== 1) throw contactUnavailable();
  return { phone: row.phone };
}

/** The tutor must own this exact offer and the same join must still be approved. */
export async function getParentContactForTutor(
  db: D1Database,
  tutorId: string,
  offerId: string,
  id: string,
): Promise<TutorOfferJoinContact> {
  const source = `FROM tutor_offer_join_requests j
       JOIN tutor_student_offers o ON o.id = j.offer_id
       JOIN users parent ON parent.id = j.parent_user_id
       JOIN users tutor ON tutor.id = o.tutor_user_id
       JOIN tutor_profiles p ON p.user_id = o.tutor_user_id
       WHERE j.id = ? AND j.offer_id = ? AND o.tutor_user_id = ?
         AND j.status = 'approved' AND j.contact_phone IS NOT NULL
         AND j.contact_consent_version IS NOT NULL AND j.contact_consented_at IS NOT NULL
         AND o.contact_phone IS NOT NULL AND o.contact_share_consent_at IS NOT NULL
         AND o.contact_share_consent_version IS NOT NULL
         AND parent.status = 'active' AND tutor.status = 'active'
         AND p.approval_status = 'approved'`;
  const [read, logged] = await db.batch<{ phone: string }>([
    db.prepare(`SELECT j.contact_phone AS phone ${source}`).bind(id, offerId, tutorId),
    db
      .prepare(
        `INSERT INTO audit_logs (id, actor_id, action, target_type, target_id, metadata, created_at)
         SELECT ?, ?, 'tutor_offer_join.parent_contact_viewed',
           'tutor_offer_join_request', ?, '{}', ?
         WHERE EXISTS (SELECT 1 ${source})`,
      )
      .bind(crypto.randomUUID(), tutorId, id, new Date().toISOString(), id, offerId, tutorId),
  ]);
  const row = read?.results[0];
  if (!row) throw missing();
  if (logged?.meta.changes !== 1) throw missing();
  return { phone: row.phone };
}
