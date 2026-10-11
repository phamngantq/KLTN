import { Hono } from 'hono';
import {
  adminClassListSchema,
  applyClassSchema,
  classRecommendationQuerySchema,
  classSearchSchema,
  createClassSchema,
  createFeeOptionSchema,
  feeOptionsForClassSchema,
  publishClassSchema,
  publishFeeOptionSchema,
  refreshClassSchema,
  tutorApplicationListSchema,
  withdrawApplicationSchema,
  type AdminClass,
  type ClassRecommendation,
  type FeeOptionVersion,
  type PublicClass,
  type TutorApplication,
} from '../../../shared/schemas/classes';
import type { Page } from '../../../shared/schemas/discovery';
import { AppError } from '../../lib/errors';
import { ok } from '../../lib/respond';
import { parseJsonBody, parseQuery } from '../../lib/validate';
import { authOf, requireRole } from '../../middleware/guards';
import { rateLimit } from '../../middleware/rate-limit';
import type { AppEnv } from '../../types';
import * as idempotency from '../idempotency/service';
import * as service from './service';
import * as matching from './matching';

/** Public, read-only policy revisions for the pricing page. */
export const publicFeeRoutes = new Hono<AppEnv>();
publicFeeRoutes.get('/published', async (c) =>
  ok<FeeOptionVersion[]>(c, await service.listPublishedFeeOptions(c.env.DB)),
);

/** Mounted at /api/v1/classes. Only open listings can be read publicly. */
export const classRoutes = new Hono<AppEnv>();
classRoutes.get('/', async (c) =>
  ok<Page<PublicClass>>(c, await service.searchClasses(c.var.db, parseQuery(c, classSearchSchema))),
);
classRoutes.get('/:id', async (c) =>
  ok<PublicClass>(c, await service.getPublicClass(c.var.db, c.req.param('id'))),
);
classRoutes.post(
  '/:id/applications',
  requireRole('tutor'),
  rateLimit('BOOKING_LIMITER', (c) => authOf(c).user.id),
  async (c) => {
    const input = await parseJsonBody(c, applyClassSchema);
    const tutorId = authOf(c).user.id;
    const classId = c.req.param('id');
    const key = c.req.header(idempotency.IDEMPOTENCY_HEADER);
    if (!key)
      throw new AppError(422, 'IDEMPOTENCY_KEY_REQUIRED', 'Cần Idempotency-Key để ứng tuyển lớp.');
    const context = await idempotency.buildContext(
      tutorId,
      `POST /classes/${classId}/applications`,
      key,
      input,
    );
    const claim = await idempotency.claim(c.var.db, context);
    if (claim.kind === 'replay') {
      const application = await service.getOwnApplication(c.var.db, tutorId, claim.resultRef);
      c.header('Idempotency-Replayed', 'true');
      return ok<TutorApplication>(c, application, 201);
    }
    try {
      const application = await service.applyToClass(
        c.var.db,
        c.env.DB,
        tutorId,
        classId,
        input,
        new Date(),
        (id) => ({
          before: [idempotency.assertOwnedStatement(c.var.db, context, claim)],
          after: [idempotency.completeStatement(c.var.db, context, claim, id, 201)],
        }),
      );
      return ok<TutorApplication>(c, application, 201);
    } catch (error) {
      await idempotency.releaseAfterFailure(c.var.db, context, claim, error);
    }
  },
);

/** Mounted at /api/v1/tutor; contains only tutor's own application data. */
export const tutorClassRoutes = new Hono<AppEnv>();
tutorClassRoutes.use('*', requireRole('tutor'));
tutorClassRoutes.get('/classes/matched', async (c) =>
  ok<Page<PublicClass>>(
    c,
    await service.matchedClasses(c.var.db, authOf(c).user.id, parseQuery(c, classSearchSchema)),
  ),
);
tutorClassRoutes.get('/classes/recommendations', async (c) =>
  ok<Page<ClassRecommendation>>(
    c,
    await matching.listRecommendations(c.var.db, authOf(c).user.id, {
      ...parseQuery(c, classRecommendationQuerySchema),
      sort: 'newest',
    }),
  ),
);
tutorClassRoutes.get('/classes/:id/recommendation', async (c) =>
  ok<ClassRecommendation>(
    c,
    await matching.getRecommendation(c.var.db, authOf(c).user.id, c.req.param('id')),
  ),
);
tutorClassRoutes.get('/fee-options', async (c) => {
  const { classId } = parseQuery(c, feeOptionsForClassSchema);
  return ok<FeeOptionVersion[]>(
    c,
    await service.availableFeeOptions(c.var.db, authOf(c).user.id, classId),
  );
});
tutorClassRoutes.get('/applications', async (c) =>
  ok<Page<TutorApplication>>(
    c,
    await service.listOwnApplications(
      c.var.db,
      authOf(c).user.id,
      parseQuery(c, tutorApplicationListSchema),
    ),
  ),
);
tutorClassRoutes.get('/applications/:id', async (c) =>
  ok<TutorApplication>(
    c,
    await service.getOwnApplication(c.var.db, authOf(c).user.id, c.req.param('id')),
  ),
);
tutorClassRoutes.post('/applications/:id/withdraw', async (c) => {
  const { version } = await parseJsonBody(c, withdrawApplicationSchema);
  return ok<TutorApplication>(
    c,
    await service.withdrawApplication(c.var.db, authOf(c).user.id, c.req.param('id'), version),
  );
});

/** Mounted at /api/v1/admin; admin DB role is the product moderator. */
export const adminClassRoutes = new Hono<AppEnv>();
adminClassRoutes.use('*', requireRole('admin'));
adminClassRoutes.get('/classes', async (c) =>
  ok<Page<AdminClass>>(
    c,
    await service.listAdminClasses(c.var.db, parseQuery(c, adminClassListSchema)),
  ),
);
adminClassRoutes.get('/classes/:id', async (c) =>
  ok<AdminClass>(c, await service.getAdminClass(c.var.db, c.req.param('id'))),
);
adminClassRoutes.post('/classes', async (c) =>
  ok<AdminClass>(
    c,
    await service.createClass(
      c.var.db,
      authOf(c).user.id,
      await parseJsonBody(c, createClassSchema),
    ),
    201,
  ),
);
adminClassRoutes.post('/classes/:id/publish', async (c) => {
  const { version } = await parseJsonBody(c, publishClassSchema);
  return ok<AdminClass>(
    c,
    await service.publishClass(c.var.db, authOf(c).user.id, c.req.param('id'), version),
  );
});
adminClassRoutes.post('/classes/:id/refresh', async (c) =>
  ok<AdminClass>(
    c,
    await service.refreshClass(
      c.var.db,
      authOf(c).user.id,
      c.req.param('id'),
      await parseJsonBody(c, refreshClassSchema),
    ),
  ),
);
adminClassRoutes.get('/fee-options', async (c) =>
  ok<FeeOptionVersion[]>(c, await service.listFeeOptions(c.var.db)),
);
adminClassRoutes.post('/fee-options', async (c) =>
  ok<FeeOptionVersion>(
    c,
    await service.createFeeOption(
      c.var.db,
      authOf(c).user.id,
      await parseJsonBody(c, createFeeOptionSchema),
    ),
    201,
  ),
);
adminClassRoutes.post('/fee-options/:id/publish', async (c) => {
  const { version } = await parseJsonBody(c, publishFeeOptionSchema);
  return ok<FeeOptionVersion>(
    c,
    await service.publishFeeOption(c.var.db, authOf(c).user.id, c.req.param('id'), version),
  );
});
