import type { ApplicationAcceptance, TutorApplication } from '../../../shared/schemas/classes';
import type {
  CompletedAcceptance,
  CompletedClassDetail,
  IntroductionLetter,
  PaymentInstructions,
  ScheduleWindow,
  ProposalFilter,
  TutorProposalItem,
} from '../../../shared/schemas/class-requests';
import type { Page } from '../../../shared/schemas/discovery';
import {
  feeSessionsPerWeek,
  PLACEMENT_FEE_OPTION_KEY,
  placementFee,
} from '../../../shared/schemas/classes';
import { vietQrPayload } from '../../../shared/vietqr';
import { AppError } from '../../lib/errors';
import { COMPLETED } from './sql';

/**
 * First-time acceptor: no other class of this tutor had its placement fee recorded before this
 * one. Based on completed acceptances, not on how many applications were sent.
 */
const FIRST_ACCEPTANCE = `NOT EXISTS (SELECT 1 FROM class_assignments o
  WHERE o.tutor_user_id = a.tutor_user_id AND o.id <> a.id AND o.placement_fee_paid_at IS NOT NULL
    AND (a.placement_fee_paid_at IS NULL OR o.placement_fee_paid_at < a.placement_fee_paid_at))`;

/** Rate of the placement-fee policy that applies to the request now (most specific first). */
export const PLACEMENT_RATE = `(SELECT f.rate_basis_points FROM fee_option_versions f
  WHERE f.option_key = '${PLACEMENT_FEE_OPTION_KEY}' AND f.status = 'published'
    AND f.published_at <= strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    AND (f.effective_from IS NULL OR f.effective_from <= strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    AND (f.effective_to IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', 'now') < f.effective_to)
    AND (f.scope_subject_id IS NULL OR f.scope_subject_id = q.subject_id)
    AND (f.scope_mode IS NULL OR f.scope_mode = q.mode)
  ORDER BY ((f.scope_subject_id IS NOT NULL) + (f.scope_mode IS NOT NULL)) DESC,
    f.version DESC LIMIT 1)`;

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
  placement_fee_reported_at: string | null;
  first_acceptance: number;
  completed: number;
}

const acceptanceSelect = `SELECT a.id, a.application_id, a.status, a.learner_confirmed_at,
  a.placement_fee_paid_at, a.placement_fee_amount_minor, a.placement_fee_reported_at,
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
    paymentReportedAt: row.placement_fee_reported_at,
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

/** Account that receives placement fees; Worker vars, unset until the centre configures them. */
export interface PaymentEnv {
  PAYMENT_BANK_BIN?: string;
  PAYMENT_BANK_NAME?: string;
  PAYMENT_ACCOUNT_NUMBER?: string;
  PAYMENT_ACCOUNT_NAME?: string;
  /** SePay webhook API key; when set, transfers are confirmed automatically. */
  SEPAY_WEBHOOK_API_KEY?: string;
}

/**
 * Transfer content that identifies one class: "PNL" + the class code without separators, so a
 * bank that strips spaces or dashes still keeps it readable for the SePay webhook.
 */
export function paymentCodeFor(classCode: string): string {
  return `PNL${classCode.replace(/[^A-Za-z0-9]/g, '').toUpperCase()}`;
}

export const autoConfirmReady = (env: PaymentEnv) => Boolean(env.SEPAY_WEBHOOK_API_KEY?.trim());

function receivingAccount(env: PaymentEnv): PaymentInstructions['account'] {
  const bankBin = env.PAYMENT_BANK_BIN?.trim();
  const accountNumber = env.PAYMENT_ACCOUNT_NUMBER?.trim();
  const accountName = env.PAYMENT_ACCOUNT_NAME?.trim();
  if (
    !bankBin ||
    !/^\d{6}$/.test(bankBin) ||
    !accountNumber ||
    !/^[0-9A-Za-z]{4,19}$/.test(accountNumber) ||
    !accountName
  )
    return null;
  return {
    bankBin,
    bankName: env.PAYMENT_BANK_NAME?.trim() || bankBin,
    accountNumber,
    accountName,
  };
}

interface PaymentRow extends AcceptanceRow {
  class_code: string;
  expected_budget_minor: number | null;
  sessions_per_week: number | null;
  window_count: number;
  placement_rate_bp: number | null;
}

async function ownAcceptance(db: D1Database, tutorId: string, assignmentId: string) {
  const row = await db
    .prepare(
      `SELECT x.*, c.code AS class_code, q.expected_budget_minor, q.sessions_per_week,
         (SELECT count(*) FROM request_schedule_windows w WHERE w.request_id = q.id) AS window_count,
         ${PLACEMENT_RATE} AS placement_rate_bp
       FROM (${acceptanceSelect} WHERE a.id = ? AND a.tutor_user_id = ?) x
       JOIN class_assignments a ON a.id = x.id
       JOIN class_listings c ON c.id = a.class_id
       JOIN parent_requests q ON q.id = c.source_request_id`,
    )
    .bind(assignmentId, tutorId)
    .first<PaymentRow>();
  if (!row || row.status !== 'active')
    throw new AppError(404, 'ASSIGNMENT_NOT_FOUND', 'Không tìm thấy lớp đã được duyệt.');
  return row;
}

/**
 * "Thanh toán phí nhận lớp" for a returning tutor: the exact fee of this class, the transfer
 * content and a VietQR payload for the centre's account. No account configured → no QR.
 */
export async function getPaymentInstructions(
  db: D1Database,
  env: PaymentEnv,
  tutorId: string,
  assignmentId: string,
): Promise<PaymentInstructions> {
  const row = await ownAcceptance(db, tutorId, assignmentId);
  const amountMinor =
    row.placement_fee_amount_minor ??
    placementFee(
      row.expected_budget_minor,
      feeSessionsPerWeek(row.sessions_per_week, row.window_count),
      row.placement_rate_bp,
    );
  const transferContent = paymentCodeFor(row.class_code);
  const account = receivingAccount(env);
  return {
    assignmentId: row.id,
    classCode: row.class_code,
    firstAcceptance: Boolean(row.first_acceptance),
    amountMinor,
    transferContent,
    account,
    qrPayload:
      account && amountMinor !== null && amountMinor > 0
        ? vietQrPayload({
            bankBin: account.bankBin,
            accountNumber: account.accountNumber,
            amountMinor,
            content: transferContent,
          })
        : null,
    learnerConfirmed: row.learner_confirmed_at !== null,
    contract:
      row.contract_id && row.contract_version && row.contract_status
        ? { id: row.contract_id, version: row.contract_version, status: row.contract_status }
        : null,
    reportedAt: row.placement_fee_reported_at,
    paidAt: row.placement_fee_paid_at,
    completed: Boolean(row.completed),
    autoConfirm: autoConfirmReady(env),
  };
}

/** Preconditions shared by agreeing to the contract and reporting a transfer. */
function assertPayable(row: PaymentRow) {
  if (row.first_acceptance)
    throw new AppError(
      409,
      'FIRST_ACCEPTANCE_AT_CENTRE',
      'Lần nhận lớp đầu tiên cần ký hợp đồng và thanh toán phí tại trung tâm.',
    );
  if (row.placement_fee_paid_at)
    throw new AppError(409, 'PLACEMENT_FEE_ALREADY_PAID', 'Phí nhận lớp đã được thanh toán.');
  if (!row.learner_confirmed_at)
    throw new AppError(409, 'PLACEMENT_FEE_NOT_READY', 'Chờ người học xác nhận thuê gia sư.');
  if (!row.contract_id || !row.contract_version)
    throw new AppError(
      409,
      'CONTRACT_NOT_ISSUED',
      'Trung tâm đang chuẩn bị hợp đồng cho lớp này. Vui lòng quay lại sau.',
    );
}

/**
 * "Tôi đã đọc và đồng ý với các điều khoản trong hợp đồng" before paying by QR: acknowledges
 * the class contract, so the SePay webhook can record the fee as soon as the money arrives.
 */
export async function agreeContract(
  db: D1Database,
  env: PaymentEnv,
  tutorId: string,
  assignmentId: string,
): Promise<PaymentInstructions> {
  const row = await ownAcceptance(db, tutorId, assignmentId);
  assertPayable(row);
  if (row.contract_status === 'issued') {
    const now = new Date().toISOString();
    const mutationId = crypto.randomUUID();
    await db.batch([
      db
        .prepare(
          `UPDATE class_contract_records
           SET status = 'acknowledged', version = version + 1, acknowledged_at = ?, mutation_id = ?
           WHERE id = ? AND tutor_user_id = ? AND status = 'issued' AND version = ?`,
        )
        .bind(now, mutationId, row.contract_id, tutorId, row.contract_version),
      db
        .prepare(
          `INSERT INTO audit_logs (id, actor_id, action, target_type, target_id, metadata, created_at)
           SELECT ?, ?, 'class_contract.acknowledged', 'class_contract', ?, '{"via":"payment"}', ?
           WHERE EXISTS (SELECT 1 FROM class_contract_records WHERE id = ? AND mutation_id = ?)`,
        )
        .bind(crypto.randomUUID(), tutorId, row.contract_id, now, row.contract_id, mutationId),
    ]);
  }
  return getPaymentInstructions(db, env, tutorId, assignmentId);
}

/**
 * "Tôi đã chuyển khoản": with the contract agreement ticked, acknowledges the contract (when
 * still issued) and records the tutor's transfer report in one batch. Completion — learner
 * contact and the letter — still waits for the centre to record the fee as received.
 */
export async function reportTransfer(
  db: D1Database,
  env: PaymentEnv,
  tutorId: string,
  assignmentId: string,
): Promise<PaymentInstructions> {
  const row = await ownAcceptance(db, tutorId, assignmentId);
  if (row.placement_fee_reported_at)
    throw new AppError(409, 'TRANSFER_ALREADY_REPORTED', 'Bạn đã báo chuyển khoản cho lớp này.');
  assertPayable(row);
  const now = new Date().toISOString();
  const statements: D1PreparedStatement[] = [];
  if (row.contract_status === 'issued')
    statements.push(
      db
        .prepare(
          `UPDATE class_contract_records
           SET status = 'acknowledged', version = version + 1, acknowledged_at = ?, mutation_id = ?
           WHERE id = ? AND tutor_user_id = ? AND status = 'issued' AND version = ?`,
        )
        .bind(now, crypto.randomUUID(), row.contract_id, tutorId, row.contract_version),
    );
  statements.push(
    db
      .prepare(
        `UPDATE class_assignments SET placement_fee_reported_at = ?
         WHERE id = ? AND tutor_user_id = ? AND placement_fee_reported_at IS NULL
           AND placement_fee_paid_at IS NULL`,
      )
      .bind(now, assignmentId, tutorId),
    db
      .prepare(
        `INSERT INTO audit_logs (id, actor_id, action, target_type, target_id, metadata, created_at)
         SELECT ?, ?, 'assignment.fee_transfer_reported', 'class_assignment', ?, ?, ?
         WHERE EXISTS (SELECT 1 FROM class_assignments WHERE id = ? AND placement_fee_reported_at = ?)`,
      )
      .bind(
        crypto.randomUUID(),
        tutorId,
        assignmentId,
        JSON.stringify({ contractId: row.contract_id, contractAgreed: true }),
        now,
        assignmentId,
        now,
      ),
  );
  try {
    const results = await db.batch(statements);
    if (results[statements.length - 2]?.meta.changes !== 1)
      throw new AppError(409, 'TRANSFER_ALREADY_REPORTED', 'Bạn đã báo chuyển khoản cho lớp này.');
  } catch (error) {
    if (error instanceof AppError) throw error;
    if (String(error).includes('FEE_TRANSFER_REPORT_INVALID'))
      throw new AppError(409, 'PLACEMENT_FEE_NOT_READY', 'Chưa đủ điều kiện báo chuyển khoản.');
    throw error;
  }
  return getPaymentInstructions(db, env, tutorId, assignmentId);
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
  tutor_requirements: string;
  student_traits: string;
  placement_rate_bp: number | null;
  application_id: string | null;
}

const proposalSelect = `SELECT p.id, p.request_id, q.code AS request_code, s.name AS subject_name,
  q.grade, q.mode, q.area, q.expected_budget_minor, q.sessions_per_week, p.fit_score, p.status,
  p.tutor_response, p.tutor_responded_at, p.tutor_decline_reason, p.created_at,
  q.tutor_requirements, q.student_traits, ${PLACEMENT_RATE} AS placement_rate_bp,
  (SELECT a.application_id FROM class_assignments a JOIN class_listings c ON c.id = a.class_id
    WHERE c.source_request_id = p.request_id AND a.tutor_user_id = p.tutor_user_id
      AND a.status = 'active' LIMIT 1) AS application_id
  FROM request_tutor_proposals p
  JOIN parent_requests q ON q.id = p.request_id
  JOIN subjects s ON s.id = q.subject_id`;

/**
 * Tutors see only proposals they can still answer or have answered: "Đã đóng" ones (the learner
 * chose before this tutor replied) are left out of the list and the detail.
 */
const VISIBLE_PROPOSAL = `NOT (p.tutor_response IS NULL AND p.status <> 'proposed')`;

/** "Chờ phản hồi" / "Đã xác nhận" / "Đã từ chối" as SQL over the proposal `p`. */
const PROPOSAL_FILTERS: Record<ProposalFilter, string> = {
  pending: `p.tutor_response IS NULL AND p.status = 'proposed'`,
  accepted: `p.tutor_response = 'accepted'`,
  declined: `p.tutor_response = 'declined'`,
};

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
  return rows.map((row) => {
    const schedule = windows.results
      .filter((window) => window.request_id === row.request_id)
      .map(({ weekday, startLocal, endLocal }) => ({ weekday, startLocal, endLocal }));
    return {
      id: row.id,
      requestCode: row.request_code,
      subjectName: row.subject_name,
      grade: row.grade,
      mode: row.mode,
      area: row.area,
      expectedBudgetMinor: row.expected_budget_minor,
      sessionsPerWeek: row.sessions_per_week,
      schedule,
      fitScore: row.fit_score,
      status: row.status,
      tutorResponse: row.tutor_response,
      tutorRespondedAt: row.tutor_responded_at,
      tutorDeclineReason: row.tutor_decline_reason,
      createdAt: row.created_at,
      tutorRequirements: row.tutor_requirements.trim() || null,
      studentTraits: row.student_traits.trim() || null,
      placementRateBasisPoints: row.placement_rate_bp,
      applicationId: row.application_id,
      placementFeeMinor: placementFee(
        row.expected_budget_minor,
        feeSessionsPerWeek(row.sessions_per_week, schedule.length),
        row.placement_rate_bp,
      ),
    };
  });
}

export async function listProposals(
  db: D1Database,
  tutorId: string,
  query: {
    page: number;
    pageSize: number;
    q?: string | undefined;
    status?: ProposalFilter | undefined;
  },
): Promise<Page<TutorProposalItem>> {
  const conditions = ['p.tutor_user_id = ?', VISIBLE_PROPOSAL];
  const params: unknown[] = [tutorId];
  if (query.status) conditions.push(PROPOSAL_FILTERS[query.status]);
  if (query.q) {
    const pattern = `%${query.q.replace(/[!%_]/g, (char) => `!${char}`)}%`;
    conditions.push(`(q.code LIKE ? ESCAPE '!' OR s.name LIKE ? ESCAPE '!'
      OR q.grade LIKE ? ESCAPE '!' OR q.area LIKE ? ESCAPE '!')`);
    params.push(pattern, pattern, pattern, pattern);
  }
  const where = `WHERE ${conditions.join(' AND ')}`;
  const [rows, total] = await Promise.all([
    db
      .prepare(`${proposalSelect} ${where} ORDER BY p.created_at DESC, p.id LIMIT ? OFFSET ?`)
      .bind(...params, query.pageSize, (query.page - 1) * query.pageSize)
      .all<ProposalRow>(),
    db
      .prepare(
        `SELECT count(*) AS count FROM request_tutor_proposals p
         JOIN parent_requests q ON q.id = p.request_id
         JOIN subjects s ON s.id = q.subject_id ${where}`,
      )
      .bind(...params)
      .first<{ count: number }>(),
  ]);
  return {
    items: await proposalItems(db, rows.results),
    page: query.page,
    pageSize: query.pageSize,
    total: total?.count ?? 0,
  };
}

export async function getProposal(
  db: D1Database,
  tutorId: string,
  id: string,
): Promise<TutorProposalItem> {
  const [item] = await proposalItems(db, [await ownProposal(db, tutorId, id)]);
  return item!;
}

async function ownProposal(db: D1Database, tutorId: string, id: string) {
  const row = await db
    .prepare(`${proposalSelect} WHERE p.id = ? AND p.tutor_user_id = ? AND ${VISIBLE_PROPOSAL}`)
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
  /** Confirming needs the "Điều khoản trách nhiệm" agreement; declining needs a reason. */
  response: { accept: true; termsAgreed: true } | { accept: false; reason: string },
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
          JSON.stringify({
            requestId: current.request_id,
            ...(response.accept && { termsAgreed: true }),
          }),
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

/**
 * "Xem chi tiết" of a completed class: class facts, weekly schedule, learner contact, street
 * address and the introduction letter. Same completion gate as the contact; each read is audited.
 */
export async function getCompletedDetail(
  db: D1Database,
  tutorId: string,
  assignmentId: string,
): Promise<CompletedClassDetail> {
  const row = await db
    .prepare(
      `SELECT a.id AS assignmentId, c.code AS classCode, s.name AS subjectName, c.grade, c.mode,
         c.public_area AS publicArea, r.education_level AS educationLevel,
         r.sessions_per_week AS sessionsPerWeek, r.expected_budget_minor AS expectedBudgetMinor,
         r.tutor_requirements AS tutorRequirements, r.student_traits AS studentTraits,
         a.agreed_tuition_per_session_minor AS agreedTuitionPerSessionMinor,
         a.placement_fee_amount_minor AS placementFeeAmountMinor,
         a.placement_fee_paid_at AS completedAt, tu.display_name AS tutorDisplayName,
         lu.display_name AS learnerDisplayName, p.student_name AS studentName,
         p.contact_phone AS learnerPhone, p.contact_address AS learnerAddress,
         a.class_id AS classId, r.id AS requestId
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
    .first<{
      assignmentId: string;
      classCode: string;
      subjectName: string;
      grade: string;
      mode: 'online' | 'offline';
      publicArea: string | null;
      educationLevel: CompletedClassDetail['educationLevel'];
      sessionsPerWeek: number | null;
      expectedBudgetMinor: number | null;
      tutorRequirements: string;
      studentTraits: string;
      agreedTuitionPerSessionMinor: number | null;
      placementFeeAmountMinor: number;
      completedAt: string;
      tutorDisplayName: string;
      learnerDisplayName: string;
      studentName: string | null;
      learnerPhone: string | null;
      learnerAddress: string | null;
      classId: string;
      requestId: string;
    }>();
  if (!row || !row.learnerPhone)
    throw new AppError(
      404,
      'COMPLETED_CLASS_NOT_FOUND',
      'Chỉ xem được chi tiết khi lớp đã hoàn tất các điều kiện nhận lớp.',
    );
  const [windows] = await Promise.all([
    db
      .prepare(
        `SELECT weekday, start_local AS startLocal, end_local AS endLocal
         FROM request_schedule_windows WHERE request_id = ? ORDER BY weekday, start_local`,
      )
      .bind(row.requestId)
      .all<ScheduleWindow>(),
    db
      .prepare(
        `INSERT INTO audit_logs (id, actor_id, action, target_type, target_id, metadata, created_at)
         VALUES (?, ?, 'assignment.completed_detail_viewed', 'class_assignment', ?, ?, ?)`,
      )
      .bind(
        crypto.randomUUID(),
        tutorId,
        assignmentId,
        JSON.stringify({ classId: row.classId }),
        new Date().toISOString(),
      )
      .run(),
  ]);
  return {
    assignmentId: row.assignmentId,
    classCode: row.classCode,
    subjectName: row.subjectName,
    grade: row.grade,
    educationLevel: row.educationLevel,
    mode: row.mode,
    publicArea: row.publicArea,
    sessionsPerWeek: row.sessionsPerWeek,
    schedule: windows.results,
    expectedBudgetMinor: row.expectedBudgetMinor,
    agreedTuitionPerSessionMinor: row.agreedTuitionPerSessionMinor,
    placementFeeAmountMinor: row.placementFeeAmountMinor,
    tutorRequirements: row.tutorRequirements.trim() || null,
    studentTraits: row.studentTraits.trim() || null,
    completedAt: row.completedAt,
    contact: {
      learnerDisplayName: row.learnerDisplayName,
      studentName: row.studentName,
      phone: row.learnerPhone,
      address: row.learnerAddress,
    },
    letter: {
      letterNumber: `TGT-${row.classCode}`,
      issuedAt: row.completedAt,
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
    },
  };
}

/**
 * "Hoàn tất nhận lớp" from a proposal the learner chose, before the centre set up the class:
 * the same payment screen data (fee, transfer content, VietQR). Without a class contract yet,
 * the transfer cannot be reported; the screen says the centre is preparing the contract.
 */
export async function getProposalPayment(
  db: D1Database,
  env: PaymentEnv,
  tutorId: string,
  proposalId: string,
): Promise<PaymentInstructions> {
  const row = await ownProposal(db, tutorId, proposalId);
  if (row.tutor_response !== 'accepted' || row.status !== 'selected')
    throw new AppError(
      409,
      'PROPOSAL_NOT_CHOSEN',
      'Bước hoàn tất nhận lớp chỉ có khi bạn đã xác nhận và người học đã chọn bạn.',
    );
  const [item] = await proposalItems(db, [row]);
  const previous = await db
    .prepare(
      `SELECT 1 AS done FROM class_assignments
       WHERE tutor_user_id = ? AND placement_fee_paid_at IS NOT NULL LIMIT 1`,
    )
    .bind(tutorId)
    .first<{ done: number }>();
  const amountMinor = item!.placementFeeMinor;
  const transferContent = paymentCodeFor(row.request_code);
  const account = receivingAccount(env);
  return {
    assignmentId: null,
    classCode: row.request_code,
    firstAcceptance: !previous,
    amountMinor,
    transferContent,
    account,
    qrPayload:
      account && amountMinor !== null && amountMinor > 0
        ? vietQrPayload({
            bankBin: account.bankBin,
            accountNumber: account.accountNumber,
            amountMinor,
            content: transferContent,
          })
        : null,
    learnerConfirmed: true,
    contract: null,
    reportedAt: null,
    paidAt: null,
    completed: false,
    autoConfirm: autoConfirmReady(env),
  };
}
