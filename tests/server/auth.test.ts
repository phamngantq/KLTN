import { env, exports } from 'cloudflare:workers';
import { Hono } from 'hono';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ApiSuccess } from '../../src/shared/api';
import type { SessionPayload } from '../../src/shared/schemas/auth';
import { createDb } from '../../src/server/db/client';
import { sha256Hex } from '../../src/server/lib/crypto';
import { AppError } from '../../src/server/lib/errors';
import { fail, ok } from '../../src/server/lib/respond';
import { requireRole } from '../../src/server/middleware/guards';
import { sessionMiddleware } from '../../src/server/middleware/session';
import type { AppEnv } from '../../src/server/types';
import {
  api,
  BASE,
  errorCode,
  jsonInit,
  register,
  sessionCookieFrom,
  uniqueEmail,
} from './helpers';

afterEach(() => vi.restoreAllMocks());

describe('POST /auth/register', () => {
  it('creates a student, sets an HttpOnly session cookie and returns a csrf token', async () => {
    const email = uniqueEmail();
    const res = await api(
      '/auth/register',
      jsonInit('POST', { email, password: 'longenough1', displayName: 'An', role: 'student' }),
    );
    expect(res.status).toBe(201);
    const setCookie = res.headers.get('Set-Cookie') ?? '';
    expect(setCookie).toMatch(/^tm_session=/);
    expect(setCookie).toMatch(/HttpOnly/i);
    expect(setCookie).toMatch(/SameSite=Lax/i);
    expect(res.headers.get('Cache-Control')).toBe('no-store');

    const body = await res.json<ApiSuccess<SessionPayload>>();
    expect(body.data.user).toMatchObject({ email, displayName: 'An', role: 'student' });
    expect(body.data.csrfToken).toMatch(/^[\w-]{43}$/);
    expect(JSON.stringify(body)).not.toMatch(/password|hash/i);
  });

  it('uses a Secure __Host- cookie over https', async () => {
    const res = await exports.default.fetch(
      'https://tutor.test/api/v1/auth/register',
      jsonInit('POST', {
        email: uniqueEmail(),
        password: 'longenough1',
        displayName: 'An',
        role: 'tutor',
      }),
    );
    expect(res.status).toBe(201);
    const setCookie = res.headers.get('Set-Cookie') ?? '';
    expect(setCookie).toMatch(/^__Host-tm_session=/);
    expect(setCookie).toMatch(/Secure/);
    expect(setCookie).toMatch(/Path=\//);
  });

  it('stores only a salted, versioned password hash and a hashed session token', async () => {
    const s = await register();
    const cred = await env.DB.prepare(
      'SELECT password_hash FROM auth_credentials WHERE user_id = ?',
    )
      .bind(s.userId)
      .first<{ password_hash: string }>();
    expect(cred?.password_hash).toMatch(/^pbkdf2-sha256\$100000\$[\w-]{22}\$[\w-]{43}$/);
    expect(cred?.password_hash).not.toContain(s.password);

    const rawToken = s.cookie.split('=')[1]!;
    const session = await env.DB.prepare('SELECT token_hash FROM auth_sessions WHERE user_id = ?')
      .bind(s.userId)
      .first<{ token_hash: string }>();
    expect(session?.token_hash).toBe(await sha256Hex(rawToken));
    expect(session?.token_hash).not.toContain(rawToken);
  });

  it('rejects duplicate emails case-insensitively with 409', async () => {
    const s = await register();
    const res = await api(
      '/auth/register',
      jsonInit('POST', {
        email: s.email.toUpperCase(),
        password: 'longenough1',
        displayName: 'B',
        role: 'student',
      }),
    );
    expect(res.status).toBe(409);
    expect(await errorCode(res)).toBe('EMAIL_TAKEN');
  });

  it('rejects self-assigned admin role and unknown fields (no role escalation)', async () => {
    const base = { email: uniqueEmail(), password: 'longenough1', displayName: 'X' };
    const asAdmin = await api('/auth/register', jsonInit('POST', { ...base, role: 'admin' }));
    expect(asAdmin.status).toBe(422);
    const extra = await api(
      '/auth/register',
      jsonInit('POST', { ...base, role: 'student', status: 'active', isAdmin: true }),
    );
    expect(extra.status).toBe(422);
    const row = await env.DB.prepare('SELECT count(*) AS n FROM users WHERE email_normalized = ?')
      .bind(base.email.toLowerCase())
      .first<{ n: number }>();
    expect(row?.n).toBe(0);
  });

  it('validates input: 422 for bad email/short password, 415 for non-JSON, 400 for bad JSON', async () => {
    const bad = await api(
      '/auth/register',
      jsonInit('POST', { email: 'nope', password: 'short', displayName: '', role: 'student' }),
    );
    expect(bad.status).toBe(422);
    expect(await errorCode(bad)).toBe('VALIDATION_ERROR');

    const form = await api('/auth/register', {
      method: 'POST',
      body: 'email=a@b.c',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });
    expect(form.status).toBe(415);

    const broken = await api('/auth/register', {
      method: 'POST',
      body: '{not json',
      headers: { 'Content-Type': 'application/json' },
    });
    expect(broken.status).toBe(400);
  });

  it('rejects oversized bodies with 413', async () => {
    const res = await api(
      '/auth/register',
      jsonInit('POST', {
        email: uniqueEmail(),
        password: 'x'.repeat(70_000),
        displayName: 'X',
        role: 'student',
      }),
    );
    expect(res.status).toBe(413);
  });
});

describe('POST /auth/login', () => {
  it('logs in with correct credentials (email case-insensitive)', async () => {
    const s = await register('tutor');
    const res = await api(
      '/auth/login',
      jsonInit('POST', { email: s.email.toLowerCase(), password: s.password }),
    );
    expect(res.status).toBe(200);
    const body = await res.json<ApiSuccess<SessionPayload>>();
    expect(body.data.user).toMatchObject({ id: s.userId, role: 'tutor' });
    expect(sessionCookieFrom(res)).not.toBe(s.cookie);
  });

  it('returns the same 401 for wrong password and unknown email', async () => {
    const s = await register();
    const wrong = await api(
      '/auth/login',
      jsonInit('POST', { email: s.email, password: 'wrong-password' }),
    );
    const unknown = await api(
      '/auth/login',
      jsonInit('POST', { email: uniqueEmail(), password: 'whatever1' }),
    );
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(await errorCode(wrong)).toBe('INVALID_CREDENTIALS');
    expect(await errorCode(unknown)).toBe('INVALID_CREDENTIALS');
  });

  it('refuses suspended accounts', async () => {
    const s = await register();
    await env.DB.prepare("UPDATE users SET status = 'suspended' WHERE id = ?").bind(s.userId).run();
    const res = await api(
      '/auth/login',
      jsonInit('POST', { email: s.email, password: s.password }),
    );
    expect(res.status).toBe(403);
    const me = await api('/me', { headers: { Cookie: s.cookie } });
    expect(me.status).toBe(401);
  });
});

describe('GET /me and sessions', () => {
  it('returns the current user for a valid session', async () => {
    const s = await register();
    const res = await api('/me', { headers: { Cookie: s.cookie } });
    expect(res.status).toBe(200);
    const body = await res.json<ApiSuccess<SessionPayload>>();
    expect(body.data.user.id).toBe(s.userId);
    expect(body.data.csrfToken).toBe(s.csrfToken);
  });

  it('returns 401 without a session or with an unknown token', async () => {
    expect((await api('/me')).status).toBe(401);
    const res = await api('/me', { headers: { Cookie: 'tm_session=forged-token' } });
    expect(res.status).toBe(401);
    expect(await errorCode(res)).toBe('UNAUTHENTICATED');
  });

  it('rejects expired sessions', async () => {
    const s = await register();
    await env.DB.prepare(
      "UPDATE auth_sessions SET expires_at = '2000-01-01T00:00:00.000Z' WHERE user_id = ?",
    )
      .bind(s.userId)
      .run();
    expect((await api('/me', { headers: { Cookie: s.cookie } })).status).toBe(401);
  });

  it('logout revokes the session and clears the cookie', async () => {
    const s = await register();
    const res = await api('/auth/logout', jsonInit('POST', {}, s));
    expect(res.status).toBe(200);
    expect(res.headers.get('Set-Cookie')).toMatch(/tm_session=;.*Max-Age=0/i);
    expect((await api('/me', { headers: { Cookie: s.cookie } })).status).toBe(401);
    const row = await env.DB.prepare('SELECT revoked_at FROM auth_sessions WHERE user_id = ?')
      .bind(s.userId)
      .first<{ revoked_at: string | null }>();
    expect(row?.revoked_at).not.toBeNull();
  });

  it('logout without a session is 401', async () => {
    expect((await api('/auth/logout', jsonInit('POST', {}))).status).toBe(401);
  });
});

describe('CSRF protection', () => {
  it('rejects authenticated unsafe requests without the session-bound token', async () => {
    const s = await register();
    const missing = await api('/auth/logout', {
      method: 'POST',
      body: '{}',
      headers: { 'Content-Type': 'application/json', Cookie: s.cookie },
    });
    expect(missing.status).toBe(403);
    expect(await errorCode(missing)).toBe('CSRF_FAILED');

    const other = await register();
    const wrong = await api(
      '/auth/logout',
      jsonInit('POST', {}, { ...s, csrfToken: other.csrfToken }),
    );
    expect(wrong.status).toBe(403);
    // Session still valid after the rejected attempts.
    expect((await api('/me', { headers: { Cookie: s.cookie } })).status).toBe(200);
  });

  it('rejects cross-origin unsafe requests even without a session', async () => {
    const body = {
      email: uniqueEmail(),
      password: 'longenough1',
      displayName: 'X',
      role: 'student',
    };
    const crossOrigin = await api(
      '/auth/register',
      jsonInit('POST', body, undefined, { Origin: 'https://evil.example' }),
    );
    expect(crossOrigin.status).toBe(403);
    const crossSite = await api(
      '/auth/register',
      jsonInit('POST', body, undefined, { 'Sec-Fetch-Site': 'cross-site' }),
    );
    expect(crossSite.status).toBe(403);
    const sameOrigin = await api(
      '/auth/register',
      jsonInit('POST', body, undefined, { Origin: BASE }),
    );
    expect(sameOrigin.status).toBe(201);
  });
});

describe('role guard', () => {
  function guardedApp() {
    const app = new Hono<AppEnv>();
    app.use('*', async (c, next) => {
      c.set('db', createDb(c.env.DB));
      await next();
    });
    app.use('*', sessionMiddleware);
    app.get('/admin-only', requireRole('admin'), (c) => ok(c, { ok: true }));
    app.onError((err, c) =>
      err instanceof AppError ? fail(c, err.status, err.code, err.message) : fail(c, 500, 'X', 'x'),
    );
    return app;
  }

  it('returns 401 anonymous, 403 for other roles and 200 for the allowed role', async () => {
    const app = guardedApp();
    const call = (cookie?: string) =>
      app.request(
        '/admin-only',
        { headers: cookie ? { Cookie: cookie } : {} },
        env as unknown as CloudflareBindings,
      );
    expect((await call()).status).toBe(401);
    const student = await register('student');
    expect((await call(student.cookie)).status).toBe(403);
    // Admins are provisioned server-side only; simulate the operator step directly in the DB.
    await env.DB.prepare("UPDATE users SET role = 'admin' WHERE id = ?").bind(student.userId).run();
    expect((await call(student.cookie)).status).toBe(200);
  });
});

describe('secret hygiene', () => {
  it('never logs passwords or session tokens', async () => {
    const logs: string[] = [];
    for (const method of ['log', 'info', 'warn', 'error', 'debug'] as const) {
      vi.spyOn(console, method).mockImplementation((...args: unknown[]) => {
        logs.push(args.map(String).join(' '));
      });
    }
    const s = await register();
    await api('/auth/login', jsonInit('POST', { email: s.email, password: s.password }));
    await api('/auth/login', jsonInit('POST', { email: s.email, password: 'wrong-password' }));
    await api('/auth/logout', jsonInit('POST', {}, s));
    const output = logs.join('\n');
    expect(output).not.toContain(s.password);
    expect(output).not.toContain(s.cookie.split('=')[1]!);
  });
});
