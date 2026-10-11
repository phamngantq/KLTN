import { Hono } from 'hono';
import {
  adminApplicationListSchema,
  rejectApplicationSchema,
  type AdminApplication,
} from '../../../shared/schemas/admin-applications';
import type { Page } from '../../../shared/schemas/discovery';
import { ok } from '../../lib/respond';
import { parseJsonBody, parseQuery } from '../../lib/validate';
import { authOf, requireRole } from '../../middleware/guards';
import type { AppEnv } from '../../types';
import { getApplication, listApplications, rejectApplication } from './applications-service';

/** Mounted at /api/v1/admin/applications. */
export const adminApplicationRoutes = new Hono<AppEnv>();
adminApplicationRoutes.use('*', requireRole('admin'));

adminApplicationRoutes.get('/', async (c) =>
  ok<Page<AdminApplication>>(
    c,
    await listApplications(c.var.db, parseQuery(c, adminApplicationListSchema)),
  ),
);

adminApplicationRoutes.get('/:id', async (c) =>
  ok<AdminApplication>(c, await getApplication(c.var.db, c.req.param('id'))),
);

adminApplicationRoutes.post('/:id/reject', async (c) => {
  const { version, reason } = await parseJsonBody(c, rejectApplicationSchema);
  return ok<AdminApplication>(
    c,
    await rejectApplication(c.var.db, authOf(c).user.id, c.req.param('id'), version, reason),
  );
});
