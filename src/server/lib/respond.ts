import type { Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import type { ApiErrorBody, ApiSuccess } from '../../shared/api';
import type { AppEnv } from '../types';

export function ok<T>(c: Context<AppEnv>, data: T, status: ContentfulStatusCode = 200) {
  const body: ApiSuccess<T> = { data, meta: { requestId: c.get('requestId') } };
  return c.json(body, status);
}

export function fail(
  c: Context<AppEnv>,
  status: ContentfulStatusCode,
  code: string,
  message: string,
  details?: unknown,
) {
  // JSON serialisation drops `details` when it is undefined.
  const body: ApiErrorBody = {
    error: { code, message, details },
    meta: { requestId: c.get('requestId') },
  };
  return c.json(body, status);
}
