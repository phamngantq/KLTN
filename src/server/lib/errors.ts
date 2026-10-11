import type { ContentfulStatusCode } from 'hono/utils/http-status';

/** Domain error mapped to a uniform JSON error response. Never carries stack traces to clients. */
export class AppError extends Error {
  constructor(
    readonly status: ContentfulStatusCode,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

/** Innermost error message. Drizzle wraps D1 errors and its own message embeds bound params. */
function rootMessage(err: unknown): string {
  let current: unknown = err;
  while (current instanceof Error && current.cause !== undefined) current = current.cause;
  return current instanceof Error ? current.message : String(current);
}

/** True when the D1 error is a UNIQUE/PRIMARY KEY violation on `table.column`. */
export function isUniqueViolation(err: unknown, tableColumn: string): boolean {
  const message = rootMessage(err);
  return /UNIQUE constraint failed|PRIMARY KEY/.test(message) && message.includes(tableColumn);
}

/**
 * Log-safe summary: error class + root cause only. Never includes query params, which may
 * contain password hashes, token hashes or PII.
 */
export function safeErrorSummary(err: unknown): string {
  const name = err instanceof Error ? err.name : typeof err;
  return `${name}: ${rootMessage(err).slice(0, 300)}`;
}
