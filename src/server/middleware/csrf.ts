import { createMiddleware } from 'hono/factory';
import { timingSafeEqualStrings } from '../lib/crypto';
import { AppError } from '../lib/errors';
import { CSRF_HEADER } from '../modules/auth/session';
import type { AppEnv } from '../types';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

const forbidden = () => new AppError(403, 'CSRF_FAILED', 'Yêu cầu không hợp lệ (CSRF).');

/**
 * CSRF defence for cookie-authenticated unsafe requests (see docs/ADR_AUTH.md):
 * 1. Reject cross-origin browser requests via Origin / Sec-Fetch-Site.
 * 2. When a session exists, require the session-bound token in `X-CSRF-Token`.
 * JSON-only bodies (enforced by parseJsonBody) additionally force a CORS preflight cross-site.
 * Must run after sessionMiddleware.
 */
export const csrfMiddleware = createMiddleware<AppEnv>(async (c, next) => {
  if (SAFE_METHODS.has(c.req.method)) return next();

  const origin = c.req.header('Origin');
  if (origin && origin !== new URL(c.req.url).origin) throw forbidden();
  if (c.req.header('Sec-Fetch-Site') === 'cross-site') throw forbidden();

  const auth = c.var.auth;
  if (auth) {
    const provided = c.req.header(CSRF_HEADER) ?? '';
    if (!timingSafeEqualStrings(provided, auth.csrfToken)) throw forbidden();
  }
  return next();
});
