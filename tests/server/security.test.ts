import { env } from 'cloudflare:workers';
import { beforeAll, describe, expect, it } from 'vitest';
import type { ApiSuccess } from '../../src/shared/api';
import type { TutorProfile } from '../../src/shared/schemas/tutors';
import { api, errorCode, jsonInit, register, type Session } from './helpers';

type Role = 'anon' | 'student' | 'tutor' | 'admin';
let sessions: Record<Exclude<Role, 'anon'>, Session>;

beforeAll(async () => {
  const admin = await register('student');
  await env.DB.prepare("UPDATE users SET role = 'admin' WHERE id = ?").bind(admin.userId).run();
  sessions = { student: await register('student'), tutor: await register('tutor'), admin };
});

function call(role: Role, method: string, path: string, body?: unknown) {
  const session = role === 'anon' ? undefined : sessions[role];
  if (method === 'GET') return api(path, { headers: session ? { Cookie: session.cookie } : {} });
  return api(path, jsonInit(method, body ?? {}, session));
}

/**
 * Ownership/role matrix for every protected endpoint (expected status per role).
 * Bodies are minimal: a 4xx validation code still proves the request passed authorization.
 */
const MATRIX: [string, string, unknown, Record<Role, number>][] = [
  ['GET', '/me', undefined, { anon: 401, student: 200, tutor: 200, admin: 200 }],
  ['GET', '/tutor/profile', undefined, { anon: 401, student: 403, tutor: 200, admin: 403 }],
  ['PATCH', '/tutor/profile', { bio: 'x' }, { anon: 401, student: 403, tutor: 200, admin: 403 }],
  ['POST', '/tutor/profile/submit', {}, { anon: 401, student: 403, tutor: 422, admin: 403 }],
  ['GET', '/tutor/availability', undefined, { anon: 401, student: 403, tutor: 200, admin: 403 }],
  [
    'PUT',
    '/tutor/availability',
    { rules: [] },
    { anon: 401, student: 403, tutor: 200, admin: 403 },
  ],
  [
    'GET',
    '/tutor/availability/exceptions',
    undefined,
    { anon: 401, student: 403, tutor: 200, admin: 403 },
  ],
  [
    'POST',
    '/tutor/availability/exceptions',
    {},
    { anon: 401, student: 403, tutor: 422, admin: 403 },
  ],
  ['GET', '/bookings', undefined, { anon: 401, student: 200, tutor: 200, admin: 403 }],
  ['POST', '/bookings', {}, { anon: 401, student: 422, tutor: 403, admin: 403 }],
  [
    'POST',
    `/bookings/${crypto.randomUUID()}/cancel`,
    {},
    { anon: 401, student: 404, tutor: 404, admin: 403 },
  ],
  ['GET', '/admin/tutors', undefined, { anon: 401, student: 403, tutor: 403, admin: 200 }],
  [
    'POST',
    `/admin/tutors/${crypto.randomUUID()}/approve`,
    {},
    { anon: 401, student: 403, tutor: 403, admin: 404 },
  ],
  ['GET', '/subjects', undefined, { anon: 200, student: 200, tutor: 200, admin: 200 }],
  ['GET', '/tutors', undefined, { anon: 200, student: 200, tutor: 200, admin: 200 }],
];

describe('authorization matrix', () => {
  for (const [method, path, body, expected] of MATRIX) {
    it(`${method} ${path.replace(/[0-9a-f-]{36}/, ':id')}`, async () => {
      for (const role of ['anon', 'student', 'tutor', 'admin'] as const) {
        const res = await call(role, method, path, body);
        expect({ role, status: res.status }).toEqual({ role, status: expected[role] });
      }
    });
  }
});

describe('security headers', () => {
  it('API responses carry strict headers and are not cacheable', async () => {
    const res = await api('/health');
    expect(res.headers.get('Content-Security-Policy')).toContain("default-src 'none'");
    expect(res.headers.get('Content-Security-Policy')).toContain("frame-ancestors 'none'");
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(res.headers.get('X-Frame-Options')).toBe('DENY');
    expect(res.headers.get('Referrer-Policy')).toBe('no-referrer');
    expect(res.headers.get('Strict-Transport-Security')).toMatch(/max-age=\d+/);
    expect((await api('/subjects')).headers.get('Cache-Control')).toBe('no-store');
  });

  it('does not enable CORS for foreign origins', async () => {
    const res = await api('/auth/login', {
      method: 'OPTIONS',
      headers: { Origin: 'https://evil.example', 'Access-Control-Request-Method': 'POST' },
    });
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
    expect(res.headers.get('Access-Control-Allow-Credentials')).toBeNull();
  });
});

describe('rate limiting', () => {
  it('limits sign-in attempts per client IP and answers 429 with Retry-After', async () => {
    const ip = '203.0.113.7';
    const attempt = (from: string) =>
      api(
        '/auth/login',
        jsonInit('POST', { email: 'nobody@example.com', password: 'wrong-password' }, undefined, {
          'CF-Connecting-IP': from,
        }),
      );
    const statuses: number[] = [];
    for (let i = 0; i < 11; i++) statuses.push((await attempt(ip)).status);
    expect(statuses.slice(0, 10).every((s) => s === 401)).toBe(true);
    const limited = await attempt(ip);
    expect(limited.status).toBe(429);
    expect(limited.headers.get('Retry-After')).toBe('60');
    expect(await errorCode(limited)).toBe('RATE_LIMITED');
    expect((await attempt('203.0.113.8')).status).toBe(401); // other clients unaffected
  });

  it('limits booking creation per student', async () => {
    const student = await register('student');
    const statuses: number[] = [];
    for (let i = 0; i < 21; i++)
      statuses.push((await api('/bookings', jsonInit('POST', {}, student))).status);
    expect(statuses.slice(0, 20).every((s) => s === 422)).toBe(true);
    expect(statuses[20]).toBe(429);
  });
});

describe('injection and input handling', () => {
  it('stores SQL-looking text verbatim (parameterised queries) without side effects', async () => {
    const before = await env.DB.prepare('SELECT count(*) AS n FROM users').first<{ n: number }>();
    const payload = "Robert'); DROP TABLE users;-- <script>alert(1)</script>";
    const res = await api('/tutor/profile', jsonInit('PATCH', { bio: payload }, sessions.tutor));
    expect(res.status).toBe(200);
    expect((await res.json<ApiSuccess<TutorProfile>>()).data.bio).toBe(payload);
    const after = await env.DB.prepare('SELECT count(*) AS n FROM users').first<{ n: number }>();
    expect(after?.n).toBe(before?.n);
  });

  it('rejects malformed path parameters without touching the database', async () => {
    expect((await api('/tutors/..%2F..%2Fadmin')).status).toBe(404);
    expect((await api("/tutors/x' OR '1'='1/slots")).status).toBe(404);
  });

  it('never returns stack traces or internal details in errors', async () => {
    const res = await api('/auth/login', {
      method: 'POST',
      body: '{"email":',
      headers: { 'Content-Type': 'application/json' },
    });
    const text = await res.text();
    expect(res.status).toBe(400);
    expect(text).not.toMatch(/at \w+ \(|node_modules|\.ts:\d+|SQLITE|D1_ERROR/);
  });

  it('only accepts cookies for the API origin (no session via query string)', async () => {
    const tokenLike = sessions.student.cookie.split('=')[1]!;
    const res = await api(`/me?session=${encodeURIComponent(tokenLike)}`);
    expect(res.status).toBe(401);
  });
});
