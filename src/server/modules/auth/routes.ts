import { Hono } from 'hono';
import { loginSchema, registerSchema, type SessionPayload } from '../../../shared/schemas/auth';
import { ok } from '../../lib/respond';
import { parseJsonBody } from '../../lib/validate';
import { authOf, requireAuth } from '../../middleware/guards';
import { clientIp, rateLimit } from '../../middleware/rate-limit';
import type { AppEnv } from '../../types';
import * as service from './service';
import { clearSessionCookie, deriveCsrfToken, writeSessionCookie } from './session';

export const authRoutes = new Hono<AppEnv>();

async function sessionResponse(issued: service.IssuedSession): Promise<SessionPayload> {
  return { user: issued.user, csrfToken: await deriveCsrfToken(issued.token) };
}

authRoutes.post('/register', rateLimit('AUTH_LIMITER', clientIp), async (c) => {
  const input = await parseJsonBody(c, registerSchema);
  const issued = await service.register(c.var.db, input);
  writeSessionCookie(c, issued.token, issued.expiresAt);
  return ok(c, await sessionResponse(issued), 201);
});

authRoutes.post('/login', rateLimit('AUTH_LIMITER', clientIp), async (c) => {
  const input = await parseJsonBody(c, loginSchema);
  const issued = await service.login(c.var.db, input);
  writeSessionCookie(c, issued.token, issued.expiresAt);
  return ok(c, await sessionResponse(issued));
});

authRoutes.post('/logout', requireAuth, async (c) => {
  await service.logout(c.var.db, authOf(c).sessionId);
  clearSessionCookie(c);
  return ok(c, { loggedOut: true });
});

export const meRoutes = new Hono<AppEnv>();

meRoutes.get('/', requireAuth, (c) => {
  const { user, csrfToken } = authOf(c);
  return ok<SessionPayload>(c, { user, csrfToken });
});
