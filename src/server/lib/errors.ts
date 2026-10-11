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
