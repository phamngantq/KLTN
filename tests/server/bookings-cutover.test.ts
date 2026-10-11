import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { api, errorCode, jsonInit, register } from './helpers';

describe('legacy booking cutover', () => {
  it('closes new booking creation without creating a booking, claim, or idempotency record', async () => {
    const parent = await register('parent');
    const tutor = await register('tutor');
    const body = {
      tutorId: tutor.userId,
      startUtc: '2099-01-01T10:00:00.000Z',
      durationMinutes: 60,
    };
    expect((await api('/bookings', jsonInit('POST', body))).status).toBe(401);
    expect((await api('/bookings', jsonInit('POST', body, tutor))).status).toBe(403);
    const response = await api(
      '/bookings',
      jsonInit('POST', body, parent, {
        'Idempotency-Key': `retired-${crypto.randomUUID()}`,
      }),
    );
    expect(response.status).toBe(410);
    expect(await errorCode(response)).toBe('LEGACY_BOOKING_CLOSED');
    for (const table of ['bookings', 'booking_slot_claims', 'idempotency_keys'] as const) {
      const count = await env.DB.prepare(`SELECT count(*) AS n FROM ${table}`).first<{
        n: number;
      }>();
      expect(count?.n).toBe(0);
    }
  });
});
