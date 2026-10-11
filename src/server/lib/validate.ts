import type { Context } from 'hono';
import type { z } from 'zod';
import { AppError } from './errors';

/** Parses a JSON request body with a Zod schema. 415 for non-JSON, 400 for bad JSON, 422 for invalid data. */
export async function parseJsonBody<S extends z.ZodType>(
  c: Context,
  schema: S,
): Promise<z.output<S>> {
  const contentType = c.req.header('Content-Type') ?? '';
  if (!/^application\/json\b/i.test(contentType)) {
    throw new AppError(
      415,
      'UNSUPPORTED_MEDIA_TYPE',
      'Yêu cầu phải có Content-Type: application/json.',
    );
  }
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    throw new AppError(400, 'INVALID_JSON', 'Nội dung JSON không hợp lệ.');
  }
  const result = schema.safeParse(body);
  if (!result.success) {
    throw new AppError(
      422,
      'VALIDATION_ERROR',
      'Dữ liệu không hợp lệ.',
      result.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }
  return result.data;
}
