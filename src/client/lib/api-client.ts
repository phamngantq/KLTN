/**
 * Typed client for the Worker API (`/api/v1`). Every component goes through this module —
 * no ad-hoc fetch calls. Holds no secrets: the session lives in an HttpOnly cookie and the
 * CSRF token (not a credential on its own) is kept in memory only.
 */
import type { ApiErrorBody, ApiSuccess } from '../../shared/api';

const BASE = '/api/v1';
const SAFE_METHODS = new Set(['GET', 'HEAD']);

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export function isApiError(err: unknown, code?: string): err is ApiError {
  return err instanceof ApiError && (code === undefined || err.code === code);
}

/** Field-level messages from a 422 VALIDATION_ERROR, keyed by dotted path. */
export function fieldErrors(err: unknown): Record<string, string> {
  if (!isApiError(err, 'VALIDATION_ERROR') || !Array.isArray(err.details)) return {};
  const out: Record<string, string> = {};
  for (const item of err.details as { path?: string; message?: string }[]) {
    if (item.path !== undefined && item.message && !(item.path in out))
      out[item.path] = item.message;
  }
  return out;
}

let csrfToken: string | null = null;

export function setCsrfToken(token: string | null): void {
  csrfToken = token;
}

interface RequestOptions {
  body?: unknown;
  headers?: Record<string, string>;
  signal?: AbortSignal;
}

async function request<T>(method: string, path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json', ...options.headers };
  const init: RequestInit = { method, headers, credentials: 'same-origin' };
  if (options.signal) init.signal = options.signal;
  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(options.body);
  }
  if (!SAFE_METHODS.has(method) && csrfToken) headers['X-CSRF-Token'] = csrfToken;

  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, init);
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err;
    throw new ApiError(0, 'NETWORK_ERROR', 'Không kết nối được máy chủ. Vui lòng kiểm tra mạng.');
  }

  const payload = (await res.json().catch(() => null)) as ApiSuccess<T> | ApiErrorBody | null;
  if (!res.ok) {
    const error = payload && 'error' in payload ? payload.error : undefined;
    throw new ApiError(
      res.status,
      error?.code ?? `HTTP_${res.status}`,
      error?.message ?? 'Đã có lỗi xảy ra. Vui lòng thử lại.',
      error?.details,
    );
  }
  if (!payload || !('data' in payload)) {
    throw new ApiError(res.status, 'INVALID_RESPONSE', 'Phản hồi từ máy chủ không hợp lệ.');
  }
  return payload.data;
}

export const api = {
  get: <T>(path: string, options?: Omit<RequestOptions, 'body'>) =>
    request<T>('GET', path, options),
  post: <T>(path: string, body: unknown = {}, options?: Omit<RequestOptions, 'body'>) =>
    request<T>('POST', path, { ...options, body }),
  put: <T>(path: string, body: unknown, options?: Omit<RequestOptions, 'body'>) =>
    request<T>('PUT', path, { ...options, body }),
  patch: <T>(path: string, body: unknown, options?: Omit<RequestOptions, 'body'>) =>
    request<T>('PATCH', path, { ...options, body }),
  delete: <T>(path: string, body?: unknown, options?: Omit<RequestOptions, 'body'>) =>
    request<T>('DELETE', path, body === undefined ? options : { ...options, body }),
};

/** Builds `?a=1&b=2`, skipping empty values. */
export function toQuery(
  params: Record<string, string | number | boolean | null | undefined>,
): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : '';
}
