import { Hono } from 'hono';
import {
  adminUserListSchema,
  changeUserStatusSchema,
  type AdminUser,
} from '../../../shared/schemas/admin-users';
import type { Page } from '../../../shared/schemas/discovery';
import { ok } from '../../lib/respond';
import { parseJsonBody, parseQuery } from '../../lib/validate';
import { authOf, requireRole } from '../../middleware/guards';
import type { AppEnv } from '../../types';
import { changeUserStatus, getAdminUser, listAdminUsers } from './users-service';

/** Mounted at /api/v1/admin/users. Roles and contact data are server owned. */
export const adminUserRoutes = new Hono<AppEnv>();
adminUserRoutes.use('*', requireRole('admin'));
adminUserRoutes.get('/', async (c) =>
  ok<Page<AdminUser>>(c, await listAdminUsers(c.var.db, parseQuery(c, adminUserListSchema))),
);
adminUserRoutes.get('/:id', async (c) =>
  ok<AdminUser>(c, await getAdminUser(c.var.db, c.req.param('id'))),
);
adminUserRoutes.post('/:id/:action{suspend|reactivate}', async (c) => {
  const { updatedAt, reason } = await parseJsonBody(c, changeUserStatusSchema);
  return ok<AdminUser>(
    c,
    await changeUserStatus(
      c.var.db,
      authOf(c).user.id,
      c.req.param('id'),
      updatedAt,
      reason,
      c.req.param('action') === 'suspend' ? 'suspended' : 'active',
    ),
  );
});
