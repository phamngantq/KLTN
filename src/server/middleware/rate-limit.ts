import type { Context } from 'hono';
import { createMiddleware } from 'hono/factory';
import { AppError } from '../lib/errors';
import type { AppEnv } from '../types';

type LimiterBinding = 'AUTH_LIMITER' | 'BOOKING_LIMITER';

/** Cloudflare sets CF-Connecting-IP at the edge (clients cannot override it there). */
export function clientIp(c: Context<AppEnv>): string {
  return c.req.header('CF-Connecting-IP') ?? 'unknown';
}

/**
 * Workers Rate Limiting binding. Limits are per Cloudflare location and best-effort by design —
 * an abuse brake, not an accounting system. Keys never contain secrets.
 */
export function rateLimit(binding: LimiterBinding, key: (c: Context<AppEnv>) => string) {
  return createMiddleware<AppEnv>(async (c, next) => {
    const { success } = await c.env[binding].limit({ key: `${c.req.path}:${key(c)}` });
    if (!success) {
      c.header('Retry-After', '60');
      throw new AppError(
        429,
        'RATE_LIMITED',
        'Bạn thao tác quá nhanh. Vui lòng thử lại sau một phút.',
      );
    }
    await next();
  });
}
