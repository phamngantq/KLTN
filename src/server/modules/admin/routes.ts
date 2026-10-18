import { Hono } from 'hono';
import {
  adminTutorListSchema,
  moderationSchemas,
  type AdminTutor,
  type ModerationAction,
} from '../../../shared/schemas/admin';
import type { Page } from '../../../shared/schemas/discovery';
import { ok } from '../../lib/respond';
import { parseJsonBody, parseQuery } from '../../lib/validate';
import { authOf, requireRole } from '../../middleware/guards';
import type { AppEnv } from '../../types';
import type { TutorVerification } from '../../../shared/schemas/admin';
import type { SignedContractScan } from '../../../shared/schemas/tutors';
import * as documents from '../tutors/documents';
import * as signedContract from '../tutors/signed-contract';
import * as photos from '../tutors/photos';
import { tutorVerification } from '../tutors/service';
import * as service from './service';
import { adminRequestRoutes } from './requests-routes';
import { adminApplicationRoutes } from './applications-routes';
import { adminUserRoutes } from './users-routes';

/** Mounted at /api/v1/admin. Every route is admin-only. */
export const adminRoutes = new Hono<AppEnv>();

adminRoutes.use('*', requireRole('admin'));
adminRoutes.route('/requests', adminRequestRoutes);
adminRoutes.route('/applications', adminApplicationRoutes);
adminRoutes.route('/users', adminUserRoutes);

adminRoutes.get('/tutors', async (c) => {
  const query = parseQuery(c, adminTutorListSchema);
  return ok<Page<AdminTutor>>(c, await service.listTutors(c.var.db, query));
});

adminRoutes.get('/tutors/:id/photo', (c) => photos.photoResponse(c.env.DB, c.req.param('id')));

/** Private contact, citizen-ID facts and uploaded documents, for verifying a tutor. */
adminRoutes.get('/tutors/:id/verification', async (c) =>
  ok<TutorVerification>(c, await tutorVerification(c.var.db, c.env.DB, c.req.param('id'))),
);
adminRoutes.get('/tutors/:id/signed-contract', async (c) =>
  ok<SignedContractScan | null>(
    c,
    await signedContract.getSignedContract(c.env.DB, c.req.param('id')),
  ),
);
adminRoutes.get('/tutors/:id/signed-contract/file', (c) =>
  signedContract.signedContractResponse(c.env.DB, c.req.param('id'), true),
);
adminRoutes.post('/tutors/:id/signed-contract', async (c) =>
  ok<SignedContractScan>(
    c,
    await signedContract.saveSignedContract(
      c.env.DB,
      authOf(c).user.id,
      c.req.param('id'),
      await signedContract.scanFromRequest(c.req.raw),
    ),
    201,
  ),
);
adminRoutes.get('/tutors/:id/documents/:documentId', (c) =>
  documents.documentResponse(c.env.DB, c.req.param('id'), c.req.param('documentId')),
);

adminRoutes.post('/tutors/:id/:action{approve|reject|hide}', async (c) => {
  const action = c.req.param('action') as ModerationAction;
  const { reason } = await parseJsonBody(c, moderationSchemas[action]);
  const result = await service.moderate(
    c.var.db,
    authOf(c).user.id,
    c.req.param('id'),
    action,
    reason,
  );
  return ok<AdminTutor>(c, result);
});
