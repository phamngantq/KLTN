import { Hono } from 'hono';
import { deleteAccountSchema, type DeletedAccount } from '../../../shared/schemas/privacy';
import { ok } from '../../lib/respond';
import { parseJsonBody } from '../../lib/validate';
import { authOf, requireRole } from '../../middleware/guards';
import type { AppEnv } from '../../types';
import { clearSessionCookie } from '../auth/session';
import { deleteOwnAccount } from './service';

/** Mounted at /api/v1/account; deletion keeps a tombstone and removes private data. */
export const accountDeletionRoutes = new Hono<AppEnv>();
accountDeletionRoutes.use('*', requireRole('student', 'tutor'));

accountDeletionRoutes.post('/deletion', async (c) => {
  await parseJsonBody(c, deleteAccountSchema);
  const result = await deleteOwnAccount(c.var.db, authOf(c).user.id);
  clearSessionCookie(c);
  return ok<DeletedAccount>(c, result);
});
