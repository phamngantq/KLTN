import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import type { HealthStatus } from '../shared/api';
import { createDb } from './db/client';
import { AppError, safeErrorSummary } from './lib/errors';
import { fail, ok } from './lib/respond';
import { csrfMiddleware } from './middleware/csrf';
import { sessionMiddleware } from './middleware/session';
import { authRoutes, meRoutes } from './modules/auth/routes';
import { tutorAvailabilityRoutes } from './modules/availability/routes';
import { bookingRoutes } from './modules/bookings/routes';
import { discoveryRoutes } from './modules/discovery/routes';
import { subjectRoutes, tutorProfileRoutes } from './modules/tutors/routes';
import type { AppEnv } from './types';

const MAX_BODY_BYTES = 64 * 1024;

export function createApp() {
  const app = new Hono<AppEnv>();

  app.use('*', async (c, next) => {
    c.set('requestId', `req_${crypto.randomUUID()}`);
    await next();
    c.header('X-Request-Id', c.get('requestId'));
  });

  const api = new Hono<AppEnv>();
  api.get('/health', (c) => ok<HealthStatus>(c, { status: 'ok' }));

  api.use(
    '*',
    bodyLimit({
      maxSize: MAX_BODY_BYTES,
      onError: (c) => fail(c, 413, 'PAYLOAD_TOO_LARGE', 'Nội dung yêu cầu quá lớn.'),
    }),
    async (c, next) => {
      c.set('db', createDb(c.env.DB));
      await next();
      // API responses can carry session-bound data; never let shared caches store them.
      c.header('Cache-Control', 'no-store');
    },
    sessionMiddleware,
    csrfMiddleware,
  );
  api.route('/auth', authRoutes);
  api.route('/me', meRoutes);
  api.route('/tutor/availability', tutorAvailabilityRoutes);
  api.route('/subjects', subjectRoutes);
  api.route('/tutor/profile', tutorProfileRoutes);
  api.route('/tutors', discoveryRoutes);
  api.route('/bookings', bookingRoutes);

  app.route('/api/v1', api);

  app.notFound((c) => fail(c, 404, 'NOT_FOUND', 'Không tìm thấy tài nguyên.'));

  app.onError((err, c) => {
    if (err instanceof AppError) {
      return fail(c, err.status, err.code, err.message, err.details);
    }
    // Log server-side only (redacted); never leak internals to the client.
    console.error(JSON.stringify({ requestId: c.get('requestId'), error: safeErrorSummary(err) }));
    return fail(c, 500, 'INTERNAL_ERROR', 'Đã có lỗi xảy ra. Vui lòng thử lại sau.');
  });

  return app;
}
