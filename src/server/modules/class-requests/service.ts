import type { ApplicationAcceptance, TutorApplication } from '../../../shared/schemas/classes';
import type {
  CompletedAcceptance,
  IntroductionLetter,
  ScheduleWindow,
  TutorProposalItem,
} from '../../../shared/schemas/class-requests';
import type { Page } from '../../../shared/schemas/discovery';
import { AppError } from '../../lib/errors';
import { COMPLETED } from './sql';

/**
 * No payment gateway is wired into this deployment yet. Online payment stays unavailable —
 * never simulated — until a real provider and its secrets are configured.
 */
export const ONLINE_PAYMENT_READY = false;

/**
 * First-time acceptor: no other class of this tutor had its placement fee recorded before this
 * one. Based on completed acceptances, not on how many applications were sent.
 */
const FIRST_ACCEPTANCE = `NOT EXISTS (SELECT 1 FROM class_assignments o
  WHERE o.tutor_user_id = a.tutor_user_id AND o.id <> a.id AND o.placement_fee_paid_at IS NOT NULL
    AND (a.placement_fee_paid_at IS NULL OR o.placement_fee_paid_at < a.placement_fee_paid_at))`;

interface AcceptanceRow {
  id: string;
  application_id: string;
  status: 'active' | 'revoked';
  learner_confirmed_at: string | null;
  placement_fee_paid_at: string | null;
  placement_fee_amount_minor: number | null;
  contract_id: string | null;
  contract_version: number | null;
  contract_status: 'issued' | 'acknowledged' | null;
  first_acceptance: number;
  completed: number;
}

const acceptanceSelect = `SELECT a.id, a.application_id, a.status, a.learner_confirmed_at,
  a.placement_fee_paid_at, a.placement_fee_amount_minor,
  k.id AS contract_id, k.version AS contract_version, k.status AS contract_status,
  ${FIRST_ACCEPTANCE} AS first_acceptance,
  EXISTS (SELECT 1 FROM class_listings c JOIN parent_requests r ON r.id = c.source_request_id
    JOIN parent_request_private p ON p.request_id = r.id
    WHERE c.id = a.class_id AND ${COMPLETED}) AS completed
  FROM class_assignments a LEFT JOIN class_contract_records k ON k.assignment_id = a.id`;

function acceptanceOf(row: AcceptanceRow, estimatedFee: number | null): ApplicationAcceptance {
  const contract =
    row.contract_id && row.contract_version && row.contract_status
      ? { id: row.contract_id, version: row.contract_version, status: row.contract_status }
      : null;
  return {
    assignmentId: row.id,
    assignmentActive: row.status === 'active',
    firstAcceptance: Boolean(row.first_acceptance),
    learnerConfirmed: row.learner_confirmed_at !== null,
    contract,
    placementFeeMinor: row.placement_fee_amount_minor ?? estimatedFee,
    placementFeePaidAt: row.placement_fee_paid_at,
    completed: Boolean(row.completed),
    onlinePaymentReady: ONLINE_PAYMENT_READY,
  };
}

/** Adds the completion step to the tutor's own selected applications. */
export async function withAcceptances<T extends TutorApplication>(
  db: D1Database,
  tutorId: string,
  applications: T[],
): Promise<T[]> {
  const selected = applications.filter((item) => item.status === 'selected');
  if (selected.length === 0) return applications;
  const rows = await db
    .prepare(
      `${acceptanceSelect} WHERE a.tutor_user_id = ?
        AND a.application_id IN (${selected.map(() => '?').join(', ')})`,
    )
    .bind(tutorId, ...selected.map((item) => item.id))
    .all<AcceptanceRow>();
  return applications.map((item) => {
    const row = rows.results.find((candidate) => candidate.application_id === item.id);
    return row ? { ...item, acceptance: acceptanceOf(row, item.class.placementFeeMinor) } : item;
  });
}

/**
 * "Thanh toán phí nhận lớp" for a returning tutor. Every precondition is checked on the server;
 * then, with no gateway configured, the request fails honestly instead of faking a payment.
 */
export async function startPlacementFeePayment(
  db: D1Database,
  tutorId: string,
  assignmentId: string,
): Promise<never> {
  const row = await db
    .prepare(`${acceptanceSelect} WHERE a.id = ? AND a.tutor_user_id = ?`)
    .bind(assignmentId, tutorId)
    .first<AcceptanceRow>();
  if (!row || row.status !== 'active')
    throw new AppError(404, 'ASSIGNMENT_NOT_FOUND', 'Không tìm thấy lớp đã được duyệt.');
  if (row.placement_fee_paid_at)
    throw new AppError(409, 'PLACEMENT_FEE_ALREADY_PAID', 'Phí nhận lớp đã được thanh toán.');
  if (row.first_acceptance)
    throw new AppError(
      409,
      'FIRST_ACCEPTANCE_AT_CENTRE',
      'Lần nhận lớp đầu tiên cần ký hợp đồng và chuyển khoản phí môi giới tại trung tâm.',
    );
  if (!row.learner_confirmed_at || row.contract_status !== 'acknowledged')
    throw new AppError(
      409,
      'PLACEMENT_FEE_NOT_READY',
      'Cần người học xác nhận thuê và bạn xác nhận hợp đồng trước khi thanh toán.',
    );
  throw new AppError(
    503,
    'PAYMENT_GATEWAY_NOT_CONFIGURED',
    'Cổng thanh toán trực tuyến chưa được cấu hình. Vui lòng liên hệ trung tâm để thanh toán.',
  );
}

interface ProposalRow {
  id: string;
  request_id: string;
  request_code: string;
  subject_name: string;
  grade: string;
  mode: 'online' | 'offline';
  area: string | null;
  expected_budget_minor: number | null;
  sessions_per_week: number | null;
  fit_score: number;
  status: TutorProposalItem['status'];
  tutor_response: TutorProposalItem['tutorResponse'];
  tutor_responded_at: string | null;
  tutor_decline_reason: string | null;
  created_at: string;
}

const proposalSelect = `SELECT p.id, p.request_id, q.code AS request_code, s.name AS subject_name,
  q.grade, q.mode, q.area, q.expected_budget_minor, q.sessions_per_week, p.fit_score, p.status,
  p.tutor_response, p.tutor_responded_at, p.tutor_decline_reason, p.created_at
  FROM request_tutor_proposals p
  JOIN parent_requests q ON q.id = p.request_id
  JOIN subjects s ON s.id = q.subject_id`;

async function proposalItems(db: D1Database, rows: ProposalRow[]): Promise<TutorProposalItem[]> {
  if (rows.length === 0) return [];
  const windows = await db
    .prepare(
      `SELECT request_id, weekday, start_local AS startLocal, end_local AS endLocal
       FROM request_schedule_windows
       WHERE request_id IN (${rows.map(() => '?').join(', ')})
       ORDER BY weekday, start_local`,
    )
    .bind(...rows.map((row) => row.request_id))
    .all<ScheduleWindow & { request_id: string }>();
  return rows.map((row) => ({
    id: row.id,
    requestCode: row.request_code,
    subjectName: row.subject_name,
    grade: row.grade,
    mode: row.mode,
    area: row.area,
    expectedBudgetMinor: row.expected_budget_minor,
    sessionsPerWeek: row.sessions_per_week,
    schedule: windows.results
      .filter((window) => window.request_id === row.request_id)
      .map(({ weekday, startLocal, endLocal }) => ({ weekday, startLocal, endLocal })),
    fitScore: row.fit_score,
    status: row.status,
    tutorResponse: row.tutor_response,
    tutorRespondedAt: row.tutor_responded_at,
    tutorDeclineReason: row.tutor_decline_reason,
    createdAt: row.created_at,
  }));
}

export async function listProposals(
  db: D1Database,
  tutorId: string,
  page: number,
  pageSize: number,
): Promise<Page<TutorProposalItem>> {
  const [rows, total] = await Promise.all([
    db
      .prepare(
        `${proposalSelect} WHERE p.tutor_user_id = ?
         ORDER BY p.created_at DESC, p.id LIMIT ? OFFSET ?`,
      )
      .bind(tutorId, pageSize, (page - 1) * pageSize)
      .all<ProposalRow>(),
    db
      .prepare('SELECT count(*) AS count FROM request_tutor_proposals WHERE tutor_user_id = ?')
      .bind(tutorId)
      .first<{ count: number }>(),
  ]);
  return { items: await proposalItems(db, rows.results), page, pageSize, total: total?.count ?? 0 };
}

async function ownProposal(db: D1Database, tutorId: string, id: string) {
  const row = await db
    .prepare(`${proposalSelect} WHERE p.id = ? AND p.tutor_user_id = ?`)
    .bind(id, tutorId)
    .first<ProposalRow>();
  if (!row) throw new AppError(404, 'PROPOSAL_NOT_FOUND', 'Không tìm thấy lớp được đề xuất.');
  return row;
}

/** Confirms or declines a proposal once, while it is open; D1 re-checks the transition. */
export async function respondToProposal(
  db: D1Database,
  tutorId: string,
  id: string,
  response: { accept: true } | { accept: false; reason: string },
): Promise<TutorProposalItem> {
  const current = await ownProposal(db, tutorId, id);
  if (current.status !== 'proposed' || current.tutor_response !== null)
    throw new AppError(409, 'PROPOSAL_CLOSED', 'Đề xuất này đã được phản hồi hoặc đã đóng.');
  const now = new Date().toISOString();
  const value = response.accept ? 'accepted' : 'declined';
  const reason = response.accept ? null : response.reason;
  try {
    const [updated] = await db.batch([
      db
        .prepare(
          `UPDATE request_tutor_proposals
           SET tutor_response = ?, tutor_responded_at = ?, tutor_decline_reason = ?
           WHERE id = ? AND tutor_user_id = ? AND status = 'proposed' AND tutor_response IS NULL`,
        )
        .bind(value, now, reason, id, tutorId),
      db
        .prepare(
          `INSERT INTO audit_logs (id, actor_id, action, target_type, target_id, metadata, created_at)
           SELECT ?, ?, ?, 'request_tutor_proposal', ?, ?, ?
           WHERE EXISTS (SELECT 1 FROM request_tutor_proposals
             WHERE id = ? AND tutor_response = ? AND tutor_responded_at = ?)`,
        )
        .bind(
          crypto.randomUUID(),
          tutorId,
          `proposal.tutor_${value}`,
          id,
          JSON.stringify({ requestId: current.request_id }),
          now,
          id,
          value,
          now,
        ),
    ]);
    if (updated?.meta.changes !== 1)
      throw new AppError(409, 'PROPOSAL_CLOSED', 'Đề xuất này đã được phản hồi hoặc đã đóng.');
  } catch (error) {
    if (error instanceof AppError) throw error;
    if (String(error).includes('PROPOSAL_RESPONSE_INVALID'))
      throw new AppError(409, 'PROPOSAL_CLOSED', 'Đề xuất này đã được phản hồi hoặc đã đóng.');
    throw error;
  }
  const [item] = await proposalItems(db, [await ownProposal(db, tutorId, id)]);
  return item!;
}

export async function listCompleted(
  db: D1Database,
  tutorId: string,
  page: number,
  pageSize: number,
): Promise<Page<CompletedAcceptance>> {
  const from = `FROM class_assignments a
    JOIN class_listings c ON c.id = a.class_id
    JOIN parent_requests r ON r.id = c.source_request_id
    JOIN parent_request_private p ON p.request_id = r.id
    JOIN subjects s ON s.id = c.subject_id
    WHERE a.tutor_user_id = ? AND ${COMPLETED}`;
  const [rows, total] = await Promise.all([
    db
      .prepare(
        `SELECT a.id AS assignmentId, a.class_id AS classId, c.code AS classCode,
           s.name AS subjectName, c.grade, c.mode, c.public_area AS publicArea,
           a.agreed_tuition_per_session_minor AS agreedTuitionPerSessionMinor,
           a.placement_fee_amount_minor AS placementFeeAmountMinor,
           a.placement_fee_paid_at AS completedAt
         ${from} ORDER BY a.placement_fee_paid_at DESC, a.id LIMIT ? OFFSET ?`,
      )
      .bind(tutorId, pageSize, (page - 1) * pageSize)
      .all<CompletedAcceptance>(),
    db.prepare(`SELECT count(*) AS count ${from}`).bind(tutorId).first<{ count: number }>(),
  ]);
  return { items: rows.results, page, pageSize, total: total?.count ?? 0 };
}

/** Same gate as the learner contact; each read is audited. */
export async function getIntroductionLetter(
  db: D1Database,
  tutorId: string,
  assignmentId: string,
): Promise<IntroductionLetter> {
  const row = await db
    .prepare(
      `SELECT c.code AS classCode, s.name AS subjectName, c.grade, c.mode,
         c.public_area AS publicArea, r.sessions_per_week AS sessionsPerWeek,
         a.agreed_tuition_per_session_minor AS agreedTuitionPerSessionMinor,
         a.placement_fee_paid_at AS issuedAt, tu.display_name AS tutorDisplayName,
         lu.display_name AS learnerDisplayName, p.contact_phone AS learnerPhone,
         p.contact_address AS learnerAddress, a.class_id AS classId
       FROM class_assignments a
       JOIN class_listings c ON c.id = a.class_id
       JOIN parent_requests r ON r.id = c.source_request_id
       JOIN parent_request_private p ON p.request_id = r.id
       JOIN subjects s ON s.id = c.subject_id
       JOIN users tu ON tu.id = a.tutor_user_id
       JOIN users lu ON lu.id = r.parent_user_id
       WHERE a.id = ? AND a.tutor_user_id = ? AND ${COMPLETED}`,
    )
    .bind(assignmentId, tutorId)
    .first<
      Omit<IntroductionLetter, 'letterNumber' | 'learnerPhone'> & {
        classId: string;
        learnerPhone: string | null;
      }
    >();
  if (!row || !row.learnerPhone)
    throw new AppError(
      404,
      'INTRODUCTION_LETTER_NOT_FOUND',
      'Thư giới thiệu chỉ có sau khi bạn hoàn tất các điều kiện nhận lớp.',
    );
  await db
    .prepare(
      `INSERT INTO audit_logs (id, actor_id, action, target_type, target_id, metadata, created_at)
       VALUES (?, ?, 'assignment.introduction_letter_viewed', 'class_assignment', ?, ?, ?)`,
    )
    .bind(
      crypto.randomUUID(),
      tutorId,
      assignmentId,
      JSON.stringify({ classId: row.classId }),
      new Date().toISOString(),
    )
    .run();
  return {
    letterNumber: `TGT-${row.classCode}`,
    issuedAt: row.issuedAt,
    tutorDisplayName: row.tutorDisplayName,
    classCode: row.classCode,
    subjectName: row.subjectName,
    grade: row.grade,
    mode: row.mode,
    publicArea: row.publicArea,
    sessionsPerWeek: row.sessionsPerWeek,
    agreedTuitionPerSessionMinor: row.agreedTuitionPerSessionMinor,
    learnerDisplayName: row.learnerDisplayName,
    learnerPhone: row.learnerPhone,
    learnerAddress: row.learnerAddress,
  };
}
