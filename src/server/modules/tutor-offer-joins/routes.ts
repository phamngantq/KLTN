import { Hono } from 'hono';
import type { Page } from '../../../shared/schemas/discovery';
import {
  approveTutorOfferJoinSchema,
  createTutorOfferJoinSchema,
  rejectTutorOfferJoinSchema,
  terminateTutorOfferJoinSchema,
  tutorOfferJoinListSchema,
  tutorOfferJoinTutorListSchema,
  withdrawTutorOfferJoinSchema,
  type AdminTutorOfferJoin,
  type AdminTutorOfferJoinDetail,
  type ParentTutorOfferJoin,
  type TutorOfferJoinContact,
  type TutorOfferJoinForTutor,
} from '../../../shared/schemas/tutor-offer-joins';
import { ok } from '../../lib/respond';
import { parseJsonBody, parseQuery } from '../../lib/validate';
import { authOf, requireRole } from '../../middleware/guards';
import { rateLimit } from '../../middleware/rate-limit';
import type { AppEnv } from '../../types';
import * as service from './service';

/** Mount at /api/v1/tutor-offers, alongside published offer reads. */
export const publicTutorOfferJoinRoutes = new Hono<AppEnv>();
publicTutorOfferJoinRoutes.post(
  '/:id/join-requests',
  requireRole('student'),
  rateLimit('BOOKING_LIMITER', (c) => authOf(c).user.id),
  async (c) =>
    ok<ParentTutorOfferJoin>(
      c,
      await service.create(
        c.env.DB,
        authOf(c).user.id,
        c.req.param('id'),
        await parseJsonBody(c, createTutorOfferJoinSchema),
      ),
      201,
    ),
);

/** Mount at /api/v1/parent/tutor-offer-joins. */
export const parentTutorOfferJoinRoutes = new Hono<AppEnv>();
parentTutorOfferJoinRoutes.use('*', requireRole('student'));
parentTutorOfferJoinRoutes.get('/', async (c) =>
  ok<Page<ParentTutorOfferJoin>>(
    c,
    await service.listParent(c.env.DB, authOf(c).user.id, parseQuery(c, tutorOfferJoinListSchema)),
  ),
);
parentTutorOfferJoinRoutes.get('/:id', async (c) =>
  ok<ParentTutorOfferJoin>(
    c,
    await service.getParent(c.env.DB, authOf(c).user.id, c.req.param('id')),
  ),
);
parentTutorOfferJoinRoutes.get('/:id/contact', async (c) =>
  ok<TutorOfferJoinContact>(
    c,
    await service.getTutorContactForParent(c.env.DB, authOf(c).user.id, c.req.param('id')),
  ),
);
parentTutorOfferJoinRoutes.post('/:id/withdraw', async (c) => {
  const { version } = await parseJsonBody(c, withdrawTutorOfferJoinSchema);
  return ok<ParentTutorOfferJoin>(
    c,
    await service.withdraw(c.env.DB, authOf(c).user.id, c.req.param('id'), version),
  );
});

/** Mount at /api/v1/tutor/offers, owner-only and anonymized. */
export const tutorOfferJoinRoutes = new Hono<AppEnv>();
tutorOfferJoinRoutes.use('*', requireRole('tutor'));
tutorOfferJoinRoutes.get('/:id/join-requests', async (c) =>
  ok<Page<TutorOfferJoinForTutor>>(
    c,
    await service.listTutor(
      c.env.DB,
      authOf(c).user.id,
      c.req.param('id'),
      parseQuery(c, tutorOfferJoinTutorListSchema),
    ),
  ),
);
tutorOfferJoinRoutes.get('/:id/join-requests/:joinId/contact', async (c) =>
  ok<TutorOfferJoinContact>(
    c,
    await service.getParentContactForTutor(
      c.env.DB,
      authOf(c).user.id,
      c.req.param('id'),
      c.req.param('joinId'),
    ),
  ),
);

/** Mount at /api/v1/admin/tutor-offer-joins. */
export const adminTutorOfferJoinRoutes = new Hono<AppEnv>();
adminTutorOfferJoinRoutes.use('*', requireRole('admin'));
adminTutorOfferJoinRoutes.get('/', async (c) =>
  ok<Page<AdminTutorOfferJoin>>(
    c,
    await service.listAdmin(c.env.DB, parseQuery(c, tutorOfferJoinListSchema)),
  ),
);
adminTutorOfferJoinRoutes.get('/:id', async (c) =>
  ok<AdminTutorOfferJoinDetail>(
    c,
    await service.getAdminDetail(c.env.DB, authOf(c).user.id, c.req.param('id')),
  ),
);
adminTutorOfferJoinRoutes.post('/:id/reject', async (c) =>
  ok<AdminTutorOfferJoin>(
    c,
    await service.reject(
      c.env.DB,
      authOf(c).user.id,
      c.req.param('id'),
      await parseJsonBody(c, rejectTutorOfferJoinSchema),
    ),
  ),
);
adminTutorOfferJoinRoutes.post('/:id/approve', async (c) => {
  return ok<AdminTutorOfferJoin>(
    c,
    await service.approve(
      c.env.DB,
      authOf(c).user.id,
      c.req.param('id'),
      await parseJsonBody(c, approveTutorOfferJoinSchema),
    ),
  );
});
adminTutorOfferJoinRoutes.post('/:id/complete', async (c) =>
  ok<AdminTutorOfferJoin>(
    c,
    await service.terminate(c.env.DB, authOf(c).user.id, c.req.param('id'), {
      ...(await parseJsonBody(c, terminateTutorOfferJoinSchema)),
      status: 'completed',
    }),
  ),
);
adminTutorOfferJoinRoutes.post('/:id/revoke', async (c) =>
  ok<AdminTutorOfferJoin>(
    c,
    await service.terminate(c.env.DB, authOf(c).user.id, c.req.param('id'), {
      ...(await parseJsonBody(c, terminateTutorOfferJoinSchema)),
      status: 'revoked',
    }),
  ),
);
