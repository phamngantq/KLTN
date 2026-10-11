import { Hono } from 'hono';
import type { HealthStatus } from '../shared/api';
import { AppError } from './lib/errors';
import { fail, ok } from './lib/respond';
import type { AppEnv } from './types';

export function createApp() {
  const app = new Hono<AppEnv>();

  app.use('*', async (c, next) => {
    c.set('requestId', `req_${crypto.randomUUID()}`);
    await next();
    c.header('X-Request-Id', c.get('requestId'));
  });

  const api = new Hono<AppEnv>();
  api.get('/health', (c) => ok<HealthStatus>(c, { status: 'ok' }));

  app.route('/api/v1', api);

  app.notFound((c) => fail(c, 404, 'NOT_FOUND', 'Không tìm thấy tài nguyên.'));

  app.onError((err, c) => {
    if (err instanceof AppError) {
      return fail(c, err.status, err.code, err.message, err.details);
    }
    // Log server-side only; never leak internals to the client.
    console.error(JSON.stringify({ requestId: c.get('requestId'), error: String(err) }));
    return fail(c, 500, 'INTERNAL_ERROR', 'Đã có lỗi xảy ra. Vui lòng thử lại sau.');
  });

  return app;
}
