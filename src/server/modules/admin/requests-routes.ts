import { Hono } from 'hono';
import type {
  AdminRequestDetail,
  AdminRequestSummary,
} from '../../../shared/schemas/admin-requests';
import type { Page } from '../../../shared/schemas/discovery';
import { ok } from '../../lib/respond';
import { parseQuery } from '../../lib/validate';
import { requireRole } from '../../middleware/guards';
import type { AppEnv } from '../../types';
import { adminRequestListSchema, getRequest, listRequests } from './requests-service';

/** Mounted at /api/v1/admin/requests. Role check stays here even if mounted elsewhere. */
export const adminRequestRoutes = new Hono<AppEnv>();
adminRequestRoutes.use('*', requireRole('admin'));

adminRequestRoutes.get('/', async (c) =>
  ok<Page<AdminRequestSummary>>(
    c,
    await listRequests(c.var.db, parseQuery(c, adminRequestListSchema)),
  ),
);

adminRequestRoutes.get('/:id', async (c) =>
  ok<AdminRequestDetail>(c, await getRequest(c.var.db, c.req.param('id'))),
);
