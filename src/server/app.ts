import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { secureHeaders } from 'hono/secure-headers';
import type { HealthStatus } from '../shared/api';
import { createDb } from './db/client';
import { AppError, safeErrorSummary } from './lib/errors';
import { fail, ok } from './lib/respond';
import { csrfMiddleware } from './middleware/csrf';
import { sessionMiddleware } from './middleware/session';
import { authRoutes, meRoutes } from './modules/auth/routes';
import { tutorAvailabilityRoutes } from './modules/availability/routes';
import { adminRoutes } from './modules/admin/routes';
import { accountDeletionRoutes } from './modules/account-deletion/routes';
import {
  adminAssignmentRoutes,
  adminAssignmentTuitionRoutes,
  tutorAssignmentRoutes,
} from './modules/admin/assignments-routes';
import { tutorClassRequestRoutes } from './modules/class-requests/routes';
import { adminContentRoutes, contentRoutes } from './modules/content/routes';
import { bookingRoutes } from './modules/bookings/routes';
import {
  adminClassRoutes,
  classRoutes,
  publicFeeRoutes,
  tutorClassRoutes,
} from './modules/classes/routes';
import { discoveryRoutes } from './modules/discovery/routes';
import { parentProfileRoutes } from './modules/parents/routes';
import { parentRequestRoutes } from './modules/parents/requests-routes';
import { adminPricingRoutes, publicPricingRoutes } from './modules/pricing/routes';
import {
  adminReportRoutes,
  parentDashboardRoutes,
  tutorDashboardRoutes,
} from './modules/reports/routes';
import {
  adminTermsContractRoutes,
  tutorTermsContractRoutes,
} from './modules/terms-contracts/routes';
import { subjectRoutes, tutorProfileRoutes } from './modules/tutors/routes';
import {
  adminTutorOfferRoutes,
  publicTutorOfferRoutes,
  tutorOfferRoutes,
} from './modules/tutor-offers/routes';
import {
  adminTutorOfferJoinRoutes,
  parentTutorOfferJoinRoutes,
  publicTutorOfferJoinRoutes,
  tutorOfferJoinRoutes,
} from './modules/tutor-offer-joins/routes';
import { adminComplaintRoutes, complaintRoutes } from './modules/support/complaints-routes';
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
  // JSON API responses never render HTML: deny everything (SPA headers live in public/_headers).
  api.use(
    '*',
    secureHeaders({
      contentSecurityPolicy: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] },
      xFrameOptions: 'DENY',
      referrerPolicy: 'no-referrer',
    }),
  );
  api.get('/health', (c) => ok<HealthStatus>(c, { status: 'ok' }));

  // A public preview may display real read-only projections, but must never
  // accept accounts, contact details, bookings, or any other mutation.
  api.use('*', async (c, next) => {
    if (c.env.APP_ENV === 'preview' && !['GET', 'HEAD', 'OPTIONS'].includes(c.req.method)) {
      c.header('Cache-Control', 'no-store');
      return fail(
        c,
        503,
        'PREVIEW_READ_ONLY',
        'Bản xem trước chỉ cho phép xem. Chức năng gửi và lưu dữ liệu chưa mở.',
      );
    }
    await next();
  });

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
  api.route('/parent/profile', parentProfileRoutes);
  api.route('/parent/requests', parentRequestRoutes);
  api.route('/parent/tutor-offer-joins', parentTutorOfferJoinRoutes);
  api.route('/parent/dashboard', parentDashboardRoutes);
  api.route('/account', accountDeletionRoutes);
  api.route('/tutor/availability', tutorAvailabilityRoutes);
  api.route('/tutor', tutorClassRoutes);
  api.route('/tutor', tutorTermsContractRoutes);
  api.route('/tutor/class-requests', tutorClassRequestRoutes);
  api.route('/tutor/assignments', tutorAssignmentRoutes);
  api.route('/tutor/dashboard', tutorDashboardRoutes);
  api.route('/subjects', subjectRoutes);
  api.route('/tutor/profile', tutorProfileRoutes);
  api.route('/tutor/offers', tutorOfferRoutes);
  api.route('/tutor/offers', tutorOfferJoinRoutes);
  api.route('/tutor-offers', publicTutorOfferRoutes);
  api.route('/tutor-offers', publicTutorOfferJoinRoutes);
  api.route('/tutors', discoveryRoutes);
  api.route('/bookings', bookingRoutes);
  api.route('/classes', classRoutes);
  api.route('/fee-options', publicFeeRoutes);
  api.route('/pricing', publicPricingRoutes);
  api.route('/content', contentRoutes);
  api.route('/complaints', complaintRoutes);
  api.route('/admin', adminRoutes);
  api.route('/admin', adminClassRoutes);
  api.route('/admin/pricing', adminPricingRoutes);
  api.route('/admin', adminTermsContractRoutes);
  api.route('/admin/classes', adminAssignmentRoutes);
  api.route('/admin/assignments', adminAssignmentTuitionRoutes);
  api.route('/admin/content', adminContentRoutes);
  api.route('/admin/reports', adminReportRoutes);
  api.route('/admin/complaints', adminComplaintRoutes);
  api.route('/admin/tutor-offers', adminTutorOfferRoutes);
  api.route('/admin/tutor-offer-joins', adminTutorOfferJoinRoutes);

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
