import { z } from 'zod';
import { feeSessionsPerWeek, placementFee } from '../../../shared/schemas/classes';
import type {
  PaymentTransaction,
  PaymentTransactionStatus,
} from '../../../shared/schemas/payments';
import type { Page } from '../../../shared/schemas/discovery';
import { timingSafeEqualStrings } from '../../lib/crypto';
import { AppError } from '../../lib/errors';
import { PLACEMENT_RATE, type PaymentEnv } from '../class-requests/service';

/**
 * SePay "webhook" body for one bank transaction (extra fields are ignored). SePay retries until
 * it gets HTTP 200/201 with {"success": true}; `id` makes every delivery idempotent.
 */
export const sepayWebhookSchema = z.object({
  id: z.union([z.number().int().nonnegative(), z.string().trim().min(1).max(64)]),
  gateway: z.string().max(100).nullish(),
  transactionDate: z.string().trim().min(1).max(40),
  accountNumber: z.string().max(40).nullish(),
  code: z.string().max(60).nullish(),
  content: z.string().max(1000).nullish(),
  transferType: z.enum(['in', 'out']),
  transferAmount: z.number().int().nonnegative().max(100_000_000_000),
  referenceCode: z.string().max(100).nullish(),
  description: z.string().max(1000).nullish(),
});
export type SepayWebhook = z.infer<typeof sepayWebhookSchema>;

/** SePay sends "Authorization: Apikey <key>"; compared in constant time. */
export function assertSepayAuth(env: PaymentEnv, header: string | undefined) {
  const key = env.SEPAY_WEBHOOK_API_KEY?.trim();
  if (!key) throw new AppError(503, 'SEPAY_NOT_CONFIGURED', 'Webhook SePay chưa được cấu hình.');
  const provided = (header ?? '').replace(/^apikey\s+/i, '').trim();
  if (!timingSafeEqualStrings(provided, key))
    throw new AppError(401, 'SEPAY_UNAUTHORIZED', 'Sai khóa xác thực webhook.');
}

/** Candidate payment codes ("PNL…") in the transfer content and SePay's detected code. */
export function paymentCodes(payload: Pick<SepayWebhook, 'code' | 'content' | 'description'>) {
  const text = [payload.code, payload.content, payload.description]
    .filter(Boolean)
    .join(' ')
    .toUpperCase()
    .replace(/-/g, '');
  return [...new Set(text.match(/PNL[A-Z0-9]{3,40}/g) ?? [])];
}

interface Target {
  id: string;
  status: 'active' | 'revoked';
  learner_confirmed_at: string | null;
  placement_fee_paid_at: string | null;
  placement_fee_amount_minor: number | null;
  contract_ok: number;
  code_alnum: string;
  expected_budget_minor: number | null;
  sessions_per_week: number | null;
  window_count: number;
  placement_rate_bp: number | null;
}

/** The class a code names: exact, or the code followed by other text glued on by the bank. */
async function findTarget(db: D1Database, codes: string[]): Promise<Target | null> {
  for (const token of codes) {
    const row = await db
      .prepare(
        `SELECT a.id, a.status, a.learner_confirmed_at, a.placement_fee_paid_at,
           a.placement_fee_amount_minor,
           EXISTS (SELECT 1 FROM class_contract_records k
             WHERE k.assignment_id = a.id AND k.status = 'acknowledged') AS contract_ok,
           upper(replace(c.code, '-', '')) AS code_alnum,
           q.expected_budget_minor, q.sessions_per_week,
           (SELECT count(*) FROM request_schedule_windows w WHERE w.request_id = q.id) AS window_count,
           ${PLACEMENT_RATE} AS placement_rate_bp
         FROM class_assignments a
         JOIN class_listings c ON c.id = a.class_id
         JOIN parent_requests q ON q.id = c.source_request_id
         WHERE ? LIKE 'PNL' || upper(replace(c.code, '-', '')) || '%'
         ORDER BY length(c.code) DESC, (a.status = 'active') DESC, a.assigned_at DESC
         LIMIT 1`,
      )
      .bind(token)
      .first<Target>();
    if (row) return row;
  }
  return null;
}

export interface WebhookOutcome {
  status: PaymentTransactionStatus;
  duplicate: boolean;
}

/**
 * Stores the transaction once and, when it pays a ready class in full, records the placement
 * fee in the same batch — the class then moves to "Lớp đã hoàn tất". Anything else is kept
 * for a moderator: unmatched, underpaid, not ready yet or already paid.
 */
export async function handleSepayWebhook(
  db: D1Database,
  env: PaymentEnv,
  payload: SepayWebhook,
): Promise<WebhookOutcome> {
  const providerId = String(payload.id);
  const existing = await db
    .prepare(
      `SELECT status FROM payment_transactions WHERE provider = 'sepay' AND provider_transaction_id = ?`,
    )
    .bind(providerId)
    .first<{ status: PaymentTransactionStatus }>();
  if (existing) return { status: existing.status, duplicate: true };

  const codes = payload.transferType === 'in' ? paymentCodes(payload) : [];
  const ownAccount = env.PAYMENT_ACCOUNT_NUMBER?.trim();
  const toUs = !ownAccount || !payload.accountNumber || payload.accountNumber === ownAccount;
  const target = codes.length && toUs ? await findTarget(db, codes) : null;
  const expected = target
    ? (target.placement_fee_amount_minor ??
      placementFee(
        target.expected_budget_minor,
        feeSessionsPerWeek(target.sessions_per_week, target.window_count),
        target.placement_rate_bp,
      ))
    : null;
  let status: PaymentTransactionStatus =
    payload.transferType === 'out' ? 'outgoing' : target ? 'matched' : 'unmatched';
  if (target && status === 'matched') {
    if (target.placement_fee_paid_at) status = 'already_paid';
    else if (
      target.status !== 'active' ||
      !target.learner_confirmed_at ||
      !target.contract_ok ||
      expected === null
    )
      status = 'not_ready';
    else if (payload.transferAmount < expected) status = 'underpaid';
  }

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const insert = (finalStatus: PaymentTransactionStatus) =>
    db
      .prepare(
        `INSERT INTO payment_transactions (id, provider, provider_transaction_id, gateway,
           account_number, transfer_type, amount_minor, content, reference_code, transaction_at,
           payment_code, assignment_id, expected_amount_minor, status, received_at)
         VALUES (?, 'sepay', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (provider, provider_transaction_id) DO NOTHING`,
      )
      .bind(
        id,
        providerId,
        payload.gateway ?? null,
        payload.accountNumber ?? null,
        payload.transferType,
        payload.transferAmount,
        (payload.content ?? payload.description ?? '').slice(0, 1000),
        payload.referenceCode ?? null,
        payload.transactionDate,
        target ? `PNL${target.code_alnum}` : (codes[0] ?? null),
        finalStatus === 'unmatched' || finalStatus === 'outgoing' ? null : (target?.id ?? null),
        expected,
        finalStatus,
        now,
      );

  if (status === 'matched' && target && expected !== null) {
    try {
      await db.batch([
        insert('matched'),
        db
          .prepare(
            `UPDATE class_assignments SET placement_fee_paid_at = ?, placement_fee_amount_minor = ?,
               placement_fee_recorded_by = NULL, placement_fee_transaction_id = ?,
               version = version + 1
             WHERE id = ? AND placement_fee_paid_at IS NULL`,
          )
          .bind(now, expected, id, target.id),
        db
          .prepare(
            `INSERT INTO audit_logs (id, actor_id, action, target_type, target_id, metadata, created_at)
             VALUES (?, NULL, 'assignment.placement_fee_paid_online', 'class_assignment', ?, ?, ?)`,
          )
          .bind(
            crypto.randomUUID(),
            target.id,
            JSON.stringify({
              provider: 'sepay',
              transactionId: id,
              amountMinor: payload.transferAmount,
            }),
            now,
          ),
      ]);
      return { status: 'matched', duplicate: false };
    } catch {
      // A concurrent change made the class not payable: keep the money on record for review.
      status = 'not_ready';
    }
  }
  await insert(status).run();
  return { status, duplicate: false };
}

export const paymentListSchema = z.strictObject({
  page: z.coerce.number().int().min(1).max(1000).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
  status: z
    .enum(['matched', 'underpaid', 'not_ready', 'already_paid', 'unmatched', 'outgoing'])
    .optional(),
});

/** "Lịch sử giao dịch" for moderators, newest first. */
export async function listPayments(
  db: D1Database,
  query: z.infer<typeof paymentListSchema>,
): Promise<Page<PaymentTransaction>> {
  const where = query.status ? 'WHERE t.status = ?' : '';
  const params = query.status ? [query.status] : [];
  const [rows, total] = await Promise.all([
    db
      .prepare(
        `SELECT t.id, t.provider_transaction_id AS providerTransactionId, t.gateway,
           t.account_number AS accountNumber, t.transfer_type AS transferType,
           t.amount_minor AS amountMinor, t.content, t.reference_code AS referenceCode,
           t.transaction_at AS transactionAt, t.payment_code AS paymentCode,
           t.assignment_id AS assignmentId, t.expected_amount_minor AS expectedAmountMinor,
           t.status, t.received_at AS receivedAt, c.code AS classCode,
           u.display_name AS tutorDisplayName
         FROM payment_transactions t
         LEFT JOIN class_assignments a ON a.id = t.assignment_id
         LEFT JOIN class_listings c ON c.id = a.class_id
         LEFT JOIN users u ON u.id = a.tutor_user_id
         ${where} ORDER BY t.received_at DESC, t.id LIMIT ? OFFSET ?`,
      )
      .bind(...params, query.pageSize, (query.page - 1) * query.pageSize)
      .all<PaymentTransaction>(),
    db
      .prepare(`SELECT count(*) AS count FROM payment_transactions t ${where}`)
      .bind(...params)
      .first<{ count: number }>(),
  ]);
  return {
    items: rows.results,
    page: query.page,
    pageSize: query.pageSize,
    total: total?.count ?? 0,
  };
}
