import { Hono } from 'hono';
import {
  catalogDiscardSchema,
  catalogPublishSchema,
  catalogRetireSchema,
  createClassFeeGuidanceSchema,
  createTuitionPriceSchema,
  updateClassFeeGuidanceSchema,
  updateTuitionPriceSchema,
  type ClassFeeGuidanceVersion,
  type LearnerPriceGuide,
  type LearnerPriceItem,
  type TuitionPriceVersion,
} from '../../../shared/schemas/pricing';
import { ok } from '../../lib/respond';
import { parseJsonBody } from '../../lib/validate';
import { authOf, requireRole } from '../../middleware/guards';
import type { AppEnv } from '../../types';
import * as service from './service';

/** Public reference prices. Only the latest released revision of each key is visible. */
export const publicPricingRoutes = new Hono<AppEnv>();
publicPricingRoutes.get('/tuition', async (c) =>
  ok<TuitionPriceVersion[]>(c, await service.listPublicTuition(c.env.DB)),
);
publicPricingRoutes.get('/class-fees', async (c) =>
  ok<ClassFeeGuidanceVersion[]>(c, await service.listPublicGuidance(c.env.DB)),
);
publicPricingRoutes.get('/learner-guides', async (c) =>
  ok<LearnerPriceGuide[]>(c, await service.listLearnerGuides(c.env.DB)),
);
publicPricingRoutes.get('/learner-items', async (c) =>
  ok<LearnerPriceItem[]>(c, await service.listLearnerItems(c.env.DB)),
);

/** Moderator-only catalog management. Published revisions are immutable. */
export const adminPricingRoutes = new Hono<AppEnv>();
adminPricingRoutes.use('*', requireRole('admin'));

adminPricingRoutes.get('/tuition', async (c) =>
  ok<TuitionPriceVersion[]>(c, await service.listAdminTuition(c.env.DB)),
);
adminPricingRoutes.post('/tuition', async (c) =>
  ok<TuitionPriceVersion>(
    c,
    await service.createTuition(
      c.env.DB,
      authOf(c).user.id,
      await parseJsonBody(c, createTuitionPriceSchema),
    ),
    201,
  ),
);
adminPricingRoutes.patch('/tuition/:id', async (c) =>
  ok<TuitionPriceVersion>(
    c,
    await service.updateTuition(
      c.env.DB,
      authOf(c).user.id,
      c.req.param('id'),
      await parseJsonBody(c, updateTuitionPriceSchema),
    ),
  ),
);
adminPricingRoutes.post('/tuition/:id/publish', async (c) => {
  const { editVersion } = await parseJsonBody(c, catalogPublishSchema);
  return ok<TuitionPriceVersion>(
    c,
    await service.publishTuition(c.env.DB, authOf(c).user.id, c.req.param('id'), editVersion),
  );
});
adminPricingRoutes.post('/tuition/:id/retire', async (c) => {
  const { version } = await parseJsonBody(c, catalogRetireSchema);
  return ok<TuitionPriceVersion>(
    c,
    await service.retireTuition(c.env.DB, authOf(c).user.id, c.req.param('id'), version),
    201,
  );
});
adminPricingRoutes.post('/tuition/:id/discard', async (c) => {
  const { editVersion } = await parseJsonBody(c, catalogDiscardSchema);
  return ok(
    c,
    await service.discardTuition(c.env.DB, authOf(c).user.id, c.req.param('id'), editVersion),
  );
});

adminPricingRoutes.get('/class-fees', async (c) =>
  ok<ClassFeeGuidanceVersion[]>(c, await service.listAdminGuidance(c.env.DB)),
);
adminPricingRoutes.post('/class-fees', async (c) =>
  ok<ClassFeeGuidanceVersion>(
    c,
    await service.createGuidance(
      c.env.DB,
      authOf(c).user.id,
      await parseJsonBody(c, createClassFeeGuidanceSchema),
    ),
    201,
  ),
);
adminPricingRoutes.patch('/class-fees/:id', async (c) =>
  ok<ClassFeeGuidanceVersion>(
    c,
    await service.updateGuidance(
      c.env.DB,
      authOf(c).user.id,
      c.req.param('id'),
      await parseJsonBody(c, updateClassFeeGuidanceSchema),
    ),
  ),
);
adminPricingRoutes.post('/class-fees/:id/publish', async (c) => {
  const { editVersion } = await parseJsonBody(c, catalogPublishSchema);
  return ok<ClassFeeGuidanceVersion>(
    c,
    await service.publishGuidance(c.env.DB, authOf(c).user.id, c.req.param('id'), editVersion),
  );
});
adminPricingRoutes.post('/class-fees/:id/retire', async (c) => {
  const { version } = await parseJsonBody(c, catalogRetireSchema);
  return ok<ClassFeeGuidanceVersion>(
    c,
    await service.retireGuidance(c.env.DB, authOf(c).user.id, c.req.param('id'), version),
    201,
  );
});
adminPricingRoutes.post('/class-fees/:id/discard', async (c) => {
  const { editVersion } = await parseJsonBody(c, catalogDiscardSchema);
  return ok(
    c,
    await service.discardGuidance(c.env.DB, authOf(c).user.id, c.req.param('id'), editVersion),
  );
});
