import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { createApp } from '../../src/server/app';
import type { ApiErrorBody, ApiSuccess, HealthStatus } from '../../src/shared/api';
import type { Subject } from '../../src/shared/schemas/tutors';

const app = createApp();
const previewEnv: CloudflareBindings = { ...env, APP_ENV: 'preview' };

describe('public read-only preview', () => {
  it.each([
    ['POST', '/auth/register'],
    ['POST', '/auth/login'],
    ['POST', '/bookings'],
    ['POST', '/parent/requests'],
    ['PATCH', '/parent/requests/sample'],
    ['PUT', '/tutor/availability'],
    ['DELETE', '/tutor/availability/exceptions/sample'],
    ['POST', '/admin/tutors/sample/approve'],
  ])('blocks %s %s before authentication or database access', async (method, path) => {
    const res = await app.request(`http://preview.test/api/v1${path}`, { method }, {
      APP_ENV: 'preview',
    } as CloudflareBindings);
    expect(res.status).toBe(503);
    expect((await res.json<ApiErrorBody>()).error.code).toBe('PREVIEW_READ_ONLY');
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(res.headers.get('X-Request-Id')).toMatch(/^req_/);
  });

  it('keeps health and genuine read-only data available', async () => {
    const health = await app.request('http://preview.test/api/v1/health', {}, previewEnv);
    expect(health.status).toBe(200);
    expect((await health.json<ApiSuccess<HealthStatus>>()).data.status).toBe('ok');

    const subjects = await app.request('http://preview.test/api/v1/subjects', {}, previewEnv);
    expect(subjects.status).toBe(200);
    expect((await subjects.json<ApiSuccess<Subject[]>>()).data.length).toBeGreaterThan(0);
  });
});
