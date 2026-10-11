import type { Page } from '../../../shared/schemas/discovery';
import type {
  CreateTutorOfferInput,
  PublicTutorOffer,
  TutorOffer,
  TutorOfferContract,
  TutorOfferStatus,
  UpdateTutorOfferInput,
} from '../../../shared/schemas/tutor-offers';
import { TUTOR_OFFER_CONTACT_CONSENT_VERSION } from '../../../shared/schemas/tutor-offers';
import { AppError } from '../../lib/errors';

const CONTRACT_SLUG = 'tutor-student-offer-contract';
const missing = () =>
  new AppError(404, 'TUTOR_OFFER_NOT_FOUND', 'Không tìm thấy lớp tìm học viên.');
const stale = () => new AppError(409, 'TUTOR_OFFER_STALE', 'Lớp đã thay đổi. Vui lòng tải lại.');

interface OfferRow {
  id: string;
  tutor_user_id: string;
  tutor_display_name: string;
  contact_phone: string | null;
  contact_share_consent_version: string | null;
  contact_share_consent_at: string | null;
  subject_id: string;
  subject_name: string;
  grade: string;
  mode: 'online' | 'offline';
  area: string | null;
  proposed_tuition_per_session_minor: number;
  status: TutorOfferStatus;
  version: number;
  contract_revision_id: string | null;
  contract_revision: number | null;
  contract_title: string | null;
  contract_body_text: string | null;
  acknowledged_at: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  rejection_reason: string | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;
}

const offerSelect = `SELECT o.id, o.tutor_user_id, u.display_name AS tutor_display_name,
  o.contact_phone, o.contact_share_consent_version, o.contact_share_consent_at,
  o.subject_id, s.name AS subject_name,
  o.grade, o.mode, o.area, o.proposed_tuition_per_session_minor, o.status, o.version,
  o.contract_revision_id, c.revision AS contract_revision, c.title AS contract_title,
  c.body_text AS contract_body_text, o.acknowledged_at, o.reviewed_by, o.reviewed_at,
  o.rejection_reason, o.published_at, o.created_at, o.updated_at
  FROM tutor_student_offers o
  JOIN subjects s ON s.id = o.subject_id
  JOIN users u ON u.id = o.tutor_user_id
  LEFT JOIN content_revisions c ON c.id = o.contract_revision_id`;

function project(row: OfferRow): TutorOffer {
  return {
    id: row.id,
    tutorUserId: row.tutor_user_id,
    tutorDisplayName: row.tutor_display_name,
    contactPhone: row.contact_phone,
    contactShareConsentVersion: row.contact_share_consent_version,
    contactShareConsentAt: row.contact_share_consent_at,
    subjectId: row.subject_id,
    subjectName: row.subject_name,
    grade: row.grade,
    mode: row.mode,
    area: row.area,
    proposedTuitionPerSessionMinor: row.proposed_tuition_per_session_minor,
    status: row.status,
    version: row.version,
    contractRevisionId: row.contract_revision_id,
    contractRevision: row.contract_revision,
    contractTitle: row.contract_title,
    contractBodyText: row.contract_body_text,
    acknowledgedAt: row.acknowledged_at,
    reviewedBy: row.reviewed_by,
    reviewedAt: row.reviewed_at,
    rejectionReason: row.rejection_reason,
    publishedAt: row.published_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function publicProject(row: OfferRow): PublicTutorOffer {
  return {
    id: row.id,
    version: row.version,
    tutorDisplayName: row.tutor_display_name,
    subjectId: row.subject_id,
    subjectName: row.subject_name,
    grade: row.grade,
    mode: row.mode,
    // The tutor's free-text area is private; publish a structured district only in a later policy.
    area: null,
    proposedTuitionPerSessionMinor: row.proposed_tuition_per_session_minor,
    publishedAt: row.published_at!,
  };
}

function rootMessage(error: unknown): string {
  let cause = error;
  while (cause instanceof Error && cause.cause !== undefined) cause = cause.cause;
  return cause instanceof Error ? cause.message : String(cause);
}

function audit(
  db: D1Database,
  actorId: string,
  action: string,
  id: string,
  metadata: Record<string, unknown>,
  now: string,
  mutationId?: string,
): D1PreparedStatement {
  if (mutationId) {
    return db
      .prepare(
        `INSERT INTO audit_logs (id, actor_id, action, target_type, target_id, metadata, created_at)
         SELECT ?, ?, ?, 'tutor_student_offer', ?, ?, ?
         WHERE EXISTS (SELECT 1 FROM tutor_student_offers WHERE id = ? AND mutation_id = ?)`,
      )
      .bind(
        crypto.randomUUID(),
        actorId,
        action,
        id,
        JSON.stringify(metadata),
        now,
        id,
        mutationId,
      );
  }
  return db
    .prepare(
      `INSERT INTO audit_logs (id, actor_id, action, target_type, target_id, metadata, created_at)
       VALUES (?, ?, ?, 'tutor_student_offer', ?, ?, ?)`,
    )
    .bind(crypto.randomUUID(), actorId, action, id, JSON.stringify(metadata), now);
}

function mapWriteError(error: unknown): never {
  const message = rootMessage(error);
  if (message.includes('TUTOR_OFFER_PHONE_REQUIRED')) {
    throw new AppError(
      409,
      'TUTOR_OFFER_PHONE_REQUIRED',
      'Cần nhập số điện thoại liên hệ của gia sư.',
    );
  }
  if (message.includes('TUTOR_OFFER_CONTACT_CONSENT_REQUIRED')) {
    throw new AppError(
      409,
      'TUTOR_OFFER_CONTACT_CONSENT_REQUIRED',
      'Cần xác nhận chia sẻ số điện thoại sau khi yêu cầu được duyệt.',
    );
  }
  if (message.includes('TUTOR_OFFER_CREATE_NOT_ALLOWED')) {
    throw new AppError(
      409,
      'TUTOR_OFFER_CREATE_NOT_ALLOWED',
      'Hồ sơ gia sư, môn dạy hoặc giới hạn lớp chưa phù hợp.',
    );
  }
  if (message.includes('TUTOR_OFFER_CONTRACT_NOT_READY')) {
    throw new AppError(
      409,
      'TUTOR_OFFER_CONTRACT_UNAVAILABLE',
      'Hợp đồng hoặc hồ sơ gia sư đã thay đổi.',
    );
  }
  if (message.includes('TUTOR_OFFER_TUTOR_NOT_ELIGIBLE')) {
    throw new AppError(
      409,
      'TUTOR_OFFER_TUTOR_NOT_ELIGIBLE',
      'Hồ sơ gia sư không còn đủ điều kiện công bố.',
    );
  }
  if (message.includes('UNIQUE constraint failed')) throw stale();
  throw error;
}

export async function getOwn(db: D1Database, tutorId: string, id: string): Promise<TutorOffer> {
  const row = await db
    .prepare(`${offerSelect} WHERE o.id = ? AND o.tutor_user_id = ?`)
    .bind(id, tutorId)
    .first<OfferRow>();
  if (!row) throw missing();
  return project(row);
}

export async function getAdmin(db: D1Database, id: string): Promise<TutorOffer> {
  const row = await db.prepare(`${offerSelect} WHERE o.id = ?`).bind(id).first<OfferRow>();
  if (!row) throw missing();
  return project(row);
}

export async function getPublic(db: D1Database, id: string): Promise<PublicTutorOffer> {
  const row = await db
    .prepare(
      `${offerSelect} JOIN tutor_profiles p ON p.user_id = o.tutor_user_id
       WHERE o.id = ? AND o.status = 'published' AND u.status = 'active'
         AND p.approval_status = 'approved' AND p.visibility = 'public'`,
    )
    .bind(id)
    .first<OfferRow>();
  if (!row) throw missing();
  return publicProject(row);
}

export async function listPublic(
  db: D1Database,
  query: {
    page: number;
    pageSize: number;
    subjectId?: string;
    grade?: string;
    mode?: 'online' | 'offline';
  },
): Promise<Page<PublicTutorOffer>> {
  const where = `o.status = 'published' AND u.status = 'active'
    AND p.approval_status = 'approved' AND p.visibility = 'public'
    AND (? IS NULL OR o.subject_id = ?) AND (? IS NULL OR o.grade = ?)
    AND (? IS NULL OR o.mode = ?)`;
  const args = [
    query.subjectId ?? null,
    query.subjectId ?? null,
    query.grade ?? null,
    query.grade ?? null,
    query.mode ?? null,
    query.mode ?? null,
  ];
  const joins = `JOIN tutor_profiles p ON p.user_id = o.tutor_user_id`;
  const [rows, count] = await Promise.all([
    db
      .prepare(
        `${offerSelect} ${joins} WHERE ${where}
      ORDER BY o.published_at DESC, o.id DESC LIMIT ? OFFSET ?`,
      )
      .bind(...args, query.pageSize, (query.page - 1) * query.pageSize)
      .all<OfferRow>(),
    db
      .prepare(
        `SELECT count(*) AS count FROM tutor_student_offers o ${joins}
        JOIN users u ON u.id = o.tutor_user_id WHERE ${where}`,
      )
      .bind(...args)
      .first<{ count: number }>(),
  ]);
  return {
    items: rows.results.map(publicProject),
    page: query.page,
    pageSize: query.pageSize,
    total: count?.count ?? 0,
  };
}

export async function listOwn(
  db: D1Database,
  tutorId: string,
  query: { page: number; pageSize: number; status?: TutorOfferStatus },
): Promise<Page<TutorOffer>> {
  const where = 'o.tutor_user_id = ? AND (? IS NULL OR o.status = ?)';
  const args = [tutorId, query.status ?? null, query.status ?? null];
  const [rows, count] = await Promise.all([
    db
      .prepare(
        `${offerSelect} WHERE ${where} ORDER BY o.updated_at DESC, o.id DESC LIMIT ? OFFSET ?`,
      )
      .bind(...args, query.pageSize, (query.page - 1) * query.pageSize)
      .all<OfferRow>(),
    db
      .prepare(`SELECT count(*) AS count FROM tutor_student_offers o WHERE ${where}`)
      .bind(...args)
      .first<{ count: number }>(),
  ]);
  return {
    items: rows.results.map(project),
    page: query.page,
    pageSize: query.pageSize,
    total: count?.count ?? 0,
  };
}

export async function listAdmin(
  db: D1Database,
  query: { page: number; pageSize: number; status?: TutorOfferStatus },
): Promise<Page<TutorOffer>> {
  const where = '(? IS NULL OR o.status = ?)';
  const args = [query.status ?? null, query.status ?? null];
  const [rows, count] = await Promise.all([
    db
      .prepare(
        `${offerSelect} WHERE ${where} ORDER BY o.updated_at DESC, o.id DESC LIMIT ? OFFSET ?`,
      )
      .bind(...args, query.pageSize, (query.page - 1) * query.pageSize)
      .all<OfferRow>(),
    db
      .prepare(`SELECT count(*) AS count FROM tutor_student_offers o WHERE ${where}`)
      .bind(...args)
      .first<{ count: number }>(),
  ]);
  return {
    items: rows.results.map(project),
    page: query.page,
    pageSize: query.pageSize,
    total: count?.count ?? 0,
  };
}

export async function getCurrentContract(db: D1Database): Promise<TutorOfferContract> {
  const row = await db
    .prepare(
      `SELECT id, revision, title, body_text FROM content_revisions
       WHERE kind = 'contract' AND slug = ? AND audience = 'tutor' AND status = 'published'`,
    )
    .bind(CONTRACT_SLUG)
    .first<{ id: string; revision: number; title: string; body_text: string }>();
  if (!row)
    throw new AppError(
      409,
      'TUTOR_OFFER_CONTRACT_UNAVAILABLE',
      'Kiểm duyệt viên chưa công bố hợp đồng cho lớp tìm học viên.',
    );
  return { id: row.id, revision: row.revision, title: row.title, bodyText: row.body_text };
}

export async function create(
  db: D1Database,
  tutorId: string,
  input: CreateTutorOfferInput,
): Promise<TutorOffer> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  try {
    await db.batch([
      db
        .prepare(
          `INSERT INTO tutor_student_offers
        (id, tutor_user_id, subject_id, grade, mode, area, contact_phone,
         proposed_tuition_per_session_minor, status, version, mutation_id, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'draft', 1, ?, ?, ?)`,
        )
        .bind(
          id,
          tutorId,
          input.subjectId,
          input.grade,
          input.mode,
          input.area,
          input.contactPhone,
          input.proposedTuitionPerSessionMinor,
          crypto.randomUUID(),
          now,
          now,
        ),
      audit(db, tutorId, 'tutor_offer.created', id, {}, now),
    ]);
  } catch (error) {
    mapWriteError(error);
  }
  return getOwn(db, tutorId, id);
}

export async function edit(
  db: D1Database,
  tutorId: string,
  id: string,
  input: UpdateTutorOfferInput,
): Promise<TutorOffer> {
  const existing = await getOwn(db, tutorId, id);
  if (!['draft', 'rejected'].includes(existing.status) || existing.version !== input.version)
    throw stale();
  const now = new Date().toISOString();
  const mutationId = crypto.randomUUID();
  try {
    const [result] = await db.batch([
      db
        .prepare(
          `UPDATE tutor_student_offers SET subject_id = ?, grade = ?, mode = ?, area = ?,
        contact_phone = ?, contact_share_consent_at = NULL, contact_share_consent_version = NULL,
        proposed_tuition_per_session_minor = ?, status = 'draft', version = version + 1,
        contract_revision_id = NULL, acknowledged_at = NULL, reviewed_by = NULL,
        reviewed_at = NULL, rejection_reason = NULL, published_at = NULL,
        mutation_id = ?, updated_at = ?
        WHERE id = ? AND tutor_user_id = ? AND status IN ('draft', 'rejected') AND version = ?
          AND EXISTS (SELECT 1 FROM tutor_subjects WHERE tutor_id = ? AND subject_id = ?)
          AND EXISTS (SELECT 1 FROM tutor_profiles p JOIN users u ON u.id = p.user_id
            WHERE p.user_id = ? AND p.approval_status = 'approved' AND u.status = 'active'
              AND ((? = 'online' AND p.teaches_online = 1)
                OR (? = 'offline' AND p.teaches_offline = 1)))`,
        )
        .bind(
          input.subjectId,
          input.grade,
          input.mode,
          input.area,
          input.contactPhone,
          input.proposedTuitionPerSessionMinor,
          mutationId,
          now,
          id,
          tutorId,
          input.version,
          tutorId,
          input.subjectId,
          tutorId,
          input.mode,
          input.mode,
        ),
      audit(db, tutorId, 'tutor_offer.edited', id, { version: input.version + 1 }, now, mutationId),
    ]);
    if (result?.meta.changes !== 1) throw stale();
  } catch (error) {
    mapWriteError(error);
  }
  return getOwn(db, tutorId, id);
}

export async function submit(
  db: D1Database,
  tutorId: string,
  id: string,
  input: {
    version: number;
    contractRevisionId: string;
    acknowledged: true;
    shareContactAfterApproval: true;
  },
): Promise<TutorOffer> {
  const existing = await getOwn(db, tutorId, id);
  if (!['draft', 'rejected'].includes(existing.status) || existing.version !== input.version)
    throw stale();
  if (!existing.contactPhone)
    throw new AppError(
      409,
      'TUTOR_OFFER_PHONE_REQUIRED',
      'Cần nhập số điện thoại trước khi gửi duyệt.',
    );
  const current = await getCurrentContract(db);
  if (current.id !== input.contractRevisionId) throw stale();
  const now = new Date().toISOString();
  const mutationId = crypto.randomUUID();
  try {
    const [, result] = await db.batch([
      db
        .prepare(
          `INSERT INTO tutor_offer_contract_acks
        (id, offer_id, tutor_user_id, offer_version, contract_revision_id, acknowledged_at,
         contact_share_consent_version, contact_share_consent_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          crypto.randomUUID(),
          id,
          tutorId,
          input.version,
          current.id,
          now,
          TUTOR_OFFER_CONTACT_CONSENT_VERSION,
          now,
        ),
      db
        .prepare(
          `UPDATE tutor_student_offers SET status = 'pending', version = version + 1,
        contract_revision_id = ?, acknowledged_at = ?,
        contact_share_consent_version = ?, contact_share_consent_at = ?,
        reviewed_by = NULL, reviewed_at = NULL,
        rejection_reason = NULL, mutation_id = ?, updated_at = ?
        WHERE id = ? AND tutor_user_id = ? AND status IN ('draft', 'rejected') AND version = ?
          AND contact_phone IS NOT NULL
          AND EXISTS (SELECT 1 FROM content_revisions WHERE id = ? AND status = 'published')`,
        )
        .bind(
          current.id,
          now,
          TUTOR_OFFER_CONTACT_CONSENT_VERSION,
          now,
          mutationId,
          now,
          id,
          tutorId,
          input.version,
          current.id,
        ),
      audit(
        db,
        tutorId,
        'tutor_offer.submitted',
        id,
        {
          contractRevisionId: current.id,
          contactConsentVersion: TUTOR_OFFER_CONTACT_CONSENT_VERSION,
          version: input.version + 1,
        },
        now,
        mutationId,
      ),
    ]);
    if (result?.meta.changes !== 1) throw stale();
  } catch (error) {
    mapWriteError(error);
  }
  return getOwn(db, tutorId, id);
}

export async function review(
  db: D1Database,
  moderatorId: string,
  id: string,
  input: { version: number; decision: 'published' | 'rejected'; reason?: string },
): Promise<TutorOffer> {
  const existing = await getAdmin(db, id);
  if (existing.status !== 'pending' || existing.version !== input.version) throw stale();
  const now = new Date().toISOString();
  const mutationId = crypto.randomUUID();
  try {
    const [result] = await db.batch([
      db
        .prepare(
          `UPDATE tutor_student_offers SET status = ?, version = version + 1,
        reviewed_by = ?, reviewed_at = ?, rejection_reason = ?, published_at = ?,
        mutation_id = ?, updated_at = ?
        WHERE id = ? AND status = 'pending' AND version = ?`,
        )
        .bind(
          input.decision,
          moderatorId,
          now,
          input.reason ?? null,
          input.decision === 'published' ? now : null,
          mutationId,
          now,
          id,
          input.version,
        ),
      audit(
        db,
        moderatorId,
        input.decision === 'published' ? 'tutor_offer.approved' : 'tutor_offer.rejected',
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

export async function close(
  db: D1Database,
  tutorId: string,
  id: string,
  version: number,
): Promise<TutorOffer> {
  const existing = await getOwn(db, tutorId, id);
  if (!['pending', 'published'].includes(existing.status) || existing.version !== version)
    throw stale();
  const now = new Date().toISOString();
  const mutationId = crypto.randomUUID();
  const [result] = await db.batch([
    db
      .prepare(
        `UPDATE tutor_student_offers SET status = 'closed', version = version + 1,
      mutation_id = ?, updated_at = ?
      WHERE id = ? AND tutor_user_id = ? AND status IN ('pending', 'published') AND version = ?`,
      )
      .bind(mutationId, now, id, tutorId, version),
    audit(db, tutorId, 'tutor_offer.closed', id, { version: version + 1 }, now, mutationId),
  ]);
  if (result?.meta.changes !== 1) throw stale();
  return getOwn(db, tutorId, id);
}
