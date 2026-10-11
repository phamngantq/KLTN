import { createMiddleware } from 'hono/factory';
import { resolveSession } from '../modules/auth/service';
import { deriveCsrfToken, readSessionCookie } from '../modules/auth/session';
import type { AppEnv } from '../types';

/** Resolves the session cookie into `c.var.auth` (null when absent, expired, revoked or suspended). */
export const sessionMiddleware = createMiddleware<AppEnv>(async (c, next) => {
  c.set('auth', null);
  const token = readSessionCookie(c);
  if (token) {
    const session = await resolveSession(c.var.db, token);
    if (session) {
      c.set('auth', {
        user: session.user,
        sessionId: session.sessionId,
        csrfToken: await deriveCsrfToken(token),
      });
    }
  }
  await next();
});
