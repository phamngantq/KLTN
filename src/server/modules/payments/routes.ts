import { Hono } from 'hono';
import type { Page } from '../../../shared/schemas/discovery';
import type { PaymentTransaction } from '../../../shared/schemas/payments';
import { AppError } from '../../lib/errors';
import { ok } from '../../lib/respond';
import { parseQuery } from '../../lib/validate';
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
  const env = c.env as PaymentEnv;
  // The raw bytes are what SePay signs; parse only after verifying them.
  const rawBody = await c.req.text();
  try {
    await sepay.assertSepayRequest(env, c.req.raw.headers, rawBody);
  } catch (error) {
    if (error instanceof AppError)
      return c.json({ success: false, message: error.message }, error.status as 401 | 503);
    throw error;
  }
  let payload: sepay.SepayWebhook;
  try {
    payload = await sepay.parseSepayBody(rawBody, c.req.header('Content-Type') ?? '');
  } catch (error) {
    if (error instanceof AppError)
      return c.json({ success: false, message: error.message }, error.status as 400 | 422);
    throw error;
  }
  await sepay.handleSepayWebhook(c.env.DB, env, payload);
  // SePay counts a delivery as done only for 200/201 with exactly {"success": true}.
  return c.json({ success: true }, 200);
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
