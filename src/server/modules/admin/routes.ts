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
import * as service from './service';

/** Mounted at /api/v1/admin. Every route is admin-only. */
export const adminRoutes = new Hono<AppEnv>();

adminRoutes.use('*', requireRole('admin'));

adminRoutes.get('/tutors', async (c) => {
  const query = parseQuery(c, adminTutorListSchema);
  return ok<Page<AdminTutor>>(c, await service.listTutors(c.var.db, query));
});

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
