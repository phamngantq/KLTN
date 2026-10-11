import { exports } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';

describe('GET /api/v1/health', () => {
  it('returns 200 with ok status and a request id', async () => {
    const res = await exports.default.fetch('http://example.com/api/v1/health');
    expect(res.status).toBe(200);
    const body = await res.json<{ data: { status: string }; meta: { requestId: string } }>();
    expect(body.data).toEqual({ status: 'ok' });
    expect(body.meta.requestId).toMatch(/^req_/);
    expect(res.headers.get('X-Request-Id')).toBe(body.meta.requestId);
  });

  it('returns a uniform 404 error for unknown api routes', async () => {
    const res = await exports.default.fetch('http://example.com/api/v1/does-not-exist');
    expect(res.status).toBe(404);
    const body = await res.json<{ error: { code: string } }>();
    expect(body.error.code).toBe('NOT_FOUND');
  });
});
