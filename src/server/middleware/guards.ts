import type { Context } from 'hono';
import { createMiddleware } from 'hono/factory';
import type { UserRole } from '../../shared/schemas/auth';
import { AppError } from '../lib/errors';
import type { AppEnv, AuthContext } from '../types';

export const requireAuth = createMiddleware<AppEnv>(async (c, next) => {
  if (!c.var.auth) throw new AppError(401, 'UNAUTHENTICATED', 'Vui lòng đăng nhập.');
  await next();
});

/** 401 when anonymous, 403 when the role is not allowed. Ownership checks stay in services. */
export function requireRole(...roles: UserRole[]) {
  return createMiddleware<AppEnv>(async (c, next) => {
    const auth = c.var.auth;
    if (!auth) throw new AppError(401, 'UNAUTHENTICATED', 'Vui lòng đăng nhập.');
    if (!roles.includes(auth.user.role)) {
      throw new AppError(403, 'FORBIDDEN', 'Bạn không có quyền thực hiện thao tác này.');
    }
    await next();
  });
}

/** Auth context for handlers mounted behind requireAuth/requireRole. */
export function authOf(c: Context<AppEnv>): AuthContext {
  const auth = c.var.auth;
  if (!auth) throw new AppError(401, 'UNAUTHENTICATED', 'Vui lòng đăng nhập.');
  return auth;
}
