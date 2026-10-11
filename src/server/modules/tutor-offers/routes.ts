import { Hono } from 'hono';
import type { Page } from '../../../shared/schemas/discovery';
import {
  adminTutorOfferListSchema,
  closeTutorOfferSchema,
  createTutorOfferSchema,
  ownTutorOfferListSchema,
  publicTutorOfferListSchema,
  rejectTutorOfferSchema,
  reviewTutorOfferSchema,
  submitTutorOfferSchema,
  updateTutorOfferSchema,
  type PublicTutorOffer,
  type TutorOffer,
  type TutorOfferContract,
} from '../../../shared/schemas/tutor-offers';
import { ok } from '../../lib/respond';
import { parseJsonBody, parseQuery } from '../../lib/validate';
import { authOf, requireRole } from '../../middleware/guards';
import { rateLimit } from '../../middleware/rate-limit';
import type { AppEnv } from '../../types';
import * as service from './service';

/** Published, anonymized tutor-origin offers only. Mounted at /api/v1/tutor-offers. */
export const publicTutorOfferRoutes = new Hono<AppEnv>();
publicTutorOfferRoutes.get('/', async (c) =>
  ok<Page<PublicTutorOffer>>(
    c,
    await service.listPublic(c.env.DB, parseQuery(c, publicTutorOfferListSchema)),
  ),
);
publicTutorOfferRoutes.get('/:id', async (c) =>
  ok<PublicTutorOffer>(c, await service.getPublic(c.env.DB, c.req.param('id'))),
);

/** Signed-in tutor's own offer drafts, contract acknowledgement and listings. */
export const tutorOfferRoutes = new Hono<AppEnv>();
tutorOfferRoutes.use('*', requireRole('tutor'));
tutorOfferRoutes.get('/contract', async (c) =>
  ok<TutorOfferContract>(c, await service.getCurrentContract(c.env.DB)),
);
tutorOfferRoutes.get('/', async (c) =>
  ok<Page<TutorOffer>>(
    c,
    await service.listOwn(c.env.DB, authOf(c).user.id, parseQuery(c, ownTutorOfferListSchema)),
  ),
);
tutorOfferRoutes.post(
  '/',
  rateLimit('BOOKING_LIMITER', (c) => authOf(c).user.id),
  async (c) =>
    ok<TutorOffer>(
      c,
      await service.create(
        c.env.DB,
        authOf(c).user.id,
        await parseJsonBody(c, createTutorOfferSchema),
      ),
      201,
    ),
);
tutorOfferRoutes.get('/:id', async (c) =>
  ok<TutorOffer>(c, await service.getOwn(c.env.DB, authOf(c).user.id, c.req.param('id'))),
);
tutorOfferRoutes.patch('/:id', async (c) =>
  ok<TutorOffer>(
    c,
    await service.edit(
      c.env.DB,
      authOf(c).user.id,
      c.req.param('id'),
      await parseJsonBody(c, updateTutorOfferSchema),
    ),
  ),
);
tutorOfferRoutes.post('/:id/submit', async (c) =>
  ok<TutorOffer>(
    c,
    await service.submit(
      c.env.DB,
      authOf(c).user.id,
      c.req.param('id'),
      await parseJsonBody(c, submitTutorOfferSchema),
    ),
  ),
);
tutorOfferRoutes.post('/:id/close', async (c) => {
  const { version } = await parseJsonBody(c, closeTutorOfferSchema);
  return ok<TutorOffer>(
    c,
    await service.close(c.env.DB, authOf(c).user.id, c.req.param('id'), version),
  );
});

/** Moderator review. Mounted at /api/v1/admin/tutor-offers. */
export const adminTutorOfferRoutes = new Hono<AppEnv>();
adminTutorOfferRoutes.use('*', requireRole('admin'));
adminTutorOfferRoutes.get('/', async (c) =>
  ok<Page<TutorOffer>>(
    c,
    await service.listAdmin(c.env.DB, parseQuery(c, adminTutorOfferListSchema)),
  ),
);
adminTutorOfferRoutes.get('/:id', async (c) =>
  ok<TutorOffer>(c, await service.getAdmin(c.env.DB, c.req.param('id'))),
);
adminTutorOfferRoutes.post('/:id/approve', async (c) => {
  const { version } = await parseJsonBody(c, reviewTutorOfferSchema);
  return ok<TutorOffer>(
    c,
    await service.review(c.env.DB, authOf(c).user.id, c.req.param('id'), {
      version,
      decision: 'published',
    }),
  );
});
adminTutorOfferRoutes.post('/:id/reject', async (c) => {
  const { version, reason } = await parseJsonBody(c, rejectTutorOfferSchema);
  return ok<TutorOffer>(
    c,
    await service.review(c.env.DB, authOf(c).user.id, c.req.param('id'), {
      version,
      decision: 'rejected',
      reason,
    }),
  );
});
