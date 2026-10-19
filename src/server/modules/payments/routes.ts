import { Hono } from 'hono';
import type { Page } from '../../../shared/schemas/discovery';
import type { PaymentTransaction } from '../../../shared/schemas/payments';
import { AppError } from '../../lib/errors';
import { ok } from '../../lib/respond';
import { parseJsonBody, parseQuery } from '../../lib/validate';
import { requireRole } from '../../middleware/guards';
import type { AppEnv } from '../../types';
import type { PaymentEnv } from '../class-requests/service';
import * as sepay from './sepay';

/**
 * Mounted at /api/v1/payments. SePay calls the webhook server to server (no session, no Origin),
 * authenticated by its API key. It answers {"success": true} once the transaction is stored, so
 * SePay stops retrying; a repeated delivery changes nothing.
 */
export const paymentWebhookRoutes = new Hono<AppEnv>();
paymentWebhookRoutes.post('/sepay/webhook', async (c) => {
  try {
    sepay.assertSepayAuth(c.env as PaymentEnv, c.req.header('Authorization'));
  } catch (error) {
    if (error instanceof AppError)
      return c.json({ success: false, message: error.message }, error.status as 401);
    throw error;
  }
  const payload = await parseJsonBody(c, sepay.sepayWebhookSchema);
  const outcome = await sepay.handleSepayWebhook(c.env.DB, c.env as PaymentEnv, payload);
  return c.json({ success: true, status: outcome.status, duplicate: outcome.duplicate }, 200);
});

/** Mounted at /api/v1/admin/payments: "Lịch sử giao dịch" for moderators. */
export const adminPaymentRoutes = new Hono<AppEnv>();
adminPaymentRoutes.use('*', requireRole('admin'));
adminPaymentRoutes.get('/', async (c) =>
  ok<Page<PaymentTransaction>>(
    c,
    await sepay.listPayments(c.env.DB, parseQuery(c, sepay.paymentListSchema)),
  ),
);
