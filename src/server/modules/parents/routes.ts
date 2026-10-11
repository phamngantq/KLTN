import { Hono } from 'hono';
import { updateParentProfileSchema, type ParentProfile } from '../../../shared/schemas/parents';
import { ok } from '../../lib/respond';
import { parseJsonBody } from '../../lib/validate';
import { authOf, requireRole } from '../../middleware/guards';
import type { AppEnv } from '../../types';
import * as service from './service';

/** Mounted at /api/v1/parent/profile. The owner is always the trusted session user. */
export const parentProfileRoutes = new Hono<AppEnv>();

parentProfileRoutes.use('*', requireRole('student'));

parentProfileRoutes.get('/', async (c) =>
  ok<ParentProfile>(c, await service.getOwnProfile(c.var.db, authOf(c).user.id)),
);

parentProfileRoutes.patch('/', async (c) => {
  const input = await parseJsonBody(c, updateParentProfileSchema);
  return ok<ParentProfile>(c, await service.updateOwnProfile(c.var.db, authOf(c).user.id, input));
});
