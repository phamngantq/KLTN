import type { Context } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { bytesToBase64Url, sha256 } from '../../lib/crypto';

export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const CSRF_HEADER = 'X-CSRF-Token';

/** `__Host-` requires Secure; plain-HTTP local dev falls back to an unprefixed name. */
function cookieSpec(c: Context) {
  const secure = new URL(c.req.url).protocol === 'https:';
  return { name: secure ? '__Host-tm_session' : 'tm_session', secure };
}

export function readSessionCookie(c: Context): string | undefined {
  return getCookie(c, cookieSpec(c).name);
}

export function writeSessionCookie(c: Context, token: string, expiresAt: Date): void {
  const { name, secure } = cookieSpec(c);
  setCookie(c, name, token, {
    httpOnly: true,
    secure,
    sameSite: 'Lax',
    path: '/',
    expires: expiresAt,
  });
}

export function clearSessionCookie(c: Context): void {
  const { name, secure } = cookieSpec(c);
  deleteCookie(c, name, { path: '/', secure, httpOnly: true, sameSite: 'Lax' });
}

/**
 * CSRF token bound to the session: derived from the raw (HttpOnly) session token, so a
 * cross-site attacker cannot compute it and the server needs no extra storage or secret.
 */
export async function deriveCsrfToken(sessionToken: string): Promise<string> {
  return bytesToBase64Url(await sha256(`csrf:${sessionToken}`));
}
