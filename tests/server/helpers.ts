import { exports } from 'cloudflare:workers';
import type { ApiErrorBody, ApiSuccess } from '../../src/shared/api';
import type { SessionPayload } from '../../src/shared/schemas/auth';

export const BASE = 'http://tutor.test';

export interface Session {
  cookie: string;
  csrfToken: string;
  userId: string;
}

/** A fresh client IP per call unless one is given, so per-IP rate limits only bite where a test means it. */
function randomIp(): string {
  const b = crypto.getRandomValues(new Uint8Array(3));
  return `10.${b[0]}.${b[1]}.${b[2]}`;
}

export function api(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  if (!headers.has('CF-Connecting-IP')) headers.set('CF-Connecting-IP', randomIp());
  return exports.default.fetch(`${BASE}/api/v1${path}`, { ...init, headers });
}

export function jsonInit(
  method: string,
  body: unknown,
  session?: Session,
  headers: Record<string, string> = {},
): RequestInit {
  return {
    method,
    body: JSON.stringify(body),
    headers: {
      'Content-Type': 'application/json',
      ...(session ? { Cookie: session.cookie, 'X-CSRF-Token': session.csrfToken } : {}),
      ...headers,
    },
  };
}

export function sessionCookieFrom(res: Response): string {
  const setCookie = res.headers.get('Set-Cookie') ?? '';
  const pair = setCookie.split(';')[0];
  if (!pair) throw new Error('No Set-Cookie header');
  return pair;
}

export function uniqueEmail(prefix = 'user') {
  return `${prefix}-${crypto.randomUUID()}@Example.com`;
}

export async function register(
  role: 'student' | 'tutor' = 'student',
  overrides: Record<string, unknown> = {},
): Promise<Session & { email: string; password: string }> {
  const email = uniqueEmail(role);
  const password = 'correct horse battery';
  const res = await api(
    '/auth/register',
    jsonInit('POST', { email, password, displayName: 'Người dùng thử', role, ...overrides }),
  );
  if (res.status !== 201) throw new Error(`register failed: ${res.status} ${await res.text()}`);
  const body = await res.json<ApiSuccess<SessionPayload>>();
  return {
    cookie: sessionCookieFrom(res),
    csrfToken: body.data.csrfToken,
    userId: body.data.user.id,
    email,
    password,
  };
}

export async function errorCode(res: Response): Promise<string> {
  return (await res.json<ApiErrorBody>()).error.code;
}

export interface PublicTutorFixture extends Session {
  slug: string;
}

/**
 * A tutor whose profile is complete and approved+public. Approval is simulated directly in
 * the DB (the admin moderation API is covered by its own tests).
 */
export async function createPublicTutor(
  profile: Record<string, unknown> = {},
): Promise<PublicTutorFixture> {
  const { env } = await import('cloudflare:workers');
  const tutor = await register('tutor');
  const res = await api(
    '/tutor/profile',
    jsonInit(
      'PATCH',
      {
        bio: 'Gia sư thử nghiệm',
        subjectIds: ['subj_math'],
        hourlyRateMinor: 200_000,
        teachesOnline: true,
        teachesOffline: false,
        ...profile,
      },
      tutor,
    ),
  );
  if (res.status !== 200) throw new Error(`profile failed: ${res.status} ${await res.text()}`);
  const { data } = await res.json<{ data: { slug: string } }>();
  await env.DB.prepare(
    "UPDATE tutor_profiles SET approval_status = 'approved', visibility = 'public' WHERE user_id = ?",
  )
    .bind(tutor.userId)
    .run();
  return { ...tutor, slug: data.slug };
}
