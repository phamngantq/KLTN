import { exports } from 'cloudflare:workers';
import type { ApiErrorBody, ApiSuccess } from '../../src/shared/api';
import type { SessionPayload } from '../../src/shared/schemas/auth';

export const BASE = 'http://tutor.test';

export interface Session {
  cookie: string;
  csrfToken: string;
  userId: string;
}

export function api(path: string, init: RequestInit = {}) {
  return exports.default.fetch(`${BASE}/api/v1${path}`, init);
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
