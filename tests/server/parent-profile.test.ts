import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import type { ApiSuccess } from '../../src/shared/api';
import type { ParentProfile } from '../../src/shared/schemas/parents';
import { api, errorCode, jsonInit, register } from './helpers';

const ENDPOINT = '/parent/profile';

async function profile(cookie: string) {
  const response = await api(ENDPOINT, { headers: { Cookie: cookie } });
  expect(response.status).toBe(200);
  return (await response.json<ApiSuccess<ParentProfile>>()).data;
}

describe('parent profile', () => {
  it('requires a session and a parent storage role', async () => {
    expect((await api(ENDPOINT)).status).toBe(401);
    const tutor = await register('tutor');
    expect((await api(ENDPOINT, { headers: { Cookie: tutor.cookie } })).status).toBe(403);
    expect((await api(ENDPOINT, jsonInit('PATCH', { phone: '0912345678' }, tutor))).status).toBe(
      403,
    );

    const moderator = await register('parent');
    await env.DB.prepare("UPDATE users SET role = 'admin' WHERE id = ?")
      .bind(moderator.userId)
      .run();
    expect((await api(ENDPOINT, { headers: { Cookie: moderator.cookie } })).status).toBe(403);
  });

  it('reads and edits only the current parent, preserving legacy user ID and role', async () => {
    const owner = await register('parent');
    const other = await register('parent');
    const initial = await profile(owner.cookie);
    expect(initial).toMatchObject({ userId: owner.userId, email: owner.email, phone: null });

    const updated = await api(
      ENDPOINT,
      jsonInit('PATCH', { displayName: 'Người học An', phone: '+84912345678' }, owner),
    );
    expect(updated.status).toBe(200);
    expect((await updated.json<ApiSuccess<ParentProfile>>()).data).toMatchObject({
      userId: owner.userId,
      displayName: 'Người học An',
      phone: '+84912345678',
    });
    expect((await profile(other.cookie)).phone).toBeNull();
    const row = await env.DB.prepare('SELECT id, role FROM users WHERE id = ?')
      .bind(owner.userId)
      .first<{ id: string; role: string }>();
    expect(row).toMatchObject({ id: owner.userId, role: 'student' });
    const audit = await env.DB.prepare(
      "SELECT action, actor_id, metadata FROM audit_logs WHERE target_type = 'parent_profile' AND target_id = ? ORDER BY created_at DESC LIMIT 1",
    )
      .bind(owner.userId)
      .first<{ action: string; actor_id: string; metadata: string }>();
    expect(audit).toMatchObject({ action: 'parent_profile.updated', actor_id: owner.userId });
    expect(JSON.parse(audit!.metadata)).toEqual({ fields: ['displayName', 'phone'] });
    expect(audit!.metadata).not.toContain('0912345678');
  });

  it('supports an existing student account without a profile row and can clear phone', async () => {
    const legacy = await register('parent');
    await env.DB.prepare('DELETE FROM parent_profiles WHERE user_id = ?').bind(legacy.userId).run();
    expect((await profile(legacy.cookie)).phone).toBeNull();
    expect((await api(ENDPOINT, jsonInit('PATCH', { phone: '0912345678' }, legacy))).status).toBe(
      200,
    );
    expect((await api(ENDPOINT, jsonInit('PATCH', { phone: null }, legacy))).status).toBe(200);
    expect((await profile(legacy.cookie)).phone).toBeNull();
    const row = await env.DB.prepare('SELECT user_id FROM parent_profiles WHERE user_id = ?')
      .bind(legacy.userId)
      .first<{ user_id: string }>();
    expect(row?.user_id).toBe(legacy.userId);
  });

  it('preserves historical booking foreign keys when a parent edits account contact', async () => {
    const parent = await register('parent');
    const tutor = await register('tutor');
    const bookingId = crypto.randomUUID();
    const now = new Date().toISOString();
    await env.DB.prepare(
      `INSERT INTO bookings
       (id, tutor_id, student_id, starts_at_utc, ends_at_utc, duration_minutes,
        status, hourly_rate_minor, price_minor, created_at, updated_at)
       VALUES (?, ?, ?, '2026-11-02T11:00:00.000Z', '2026-11-02T12:00:00.000Z', 60,
               'CONFIRMED', 200000, 200000, ?, ?)`,
    )
      .bind(bookingId, tutor.userId, parent.userId, now, now)
      .run();

    expect((await api(ENDPOINT, jsonInit('PATCH', { phone: '0912345678' }, parent))).status).toBe(
      200,
    );
    const booking = await env.DB.prepare('SELECT student_id, status FROM bookings WHERE id = ?')
      .bind(bookingId)
      .first<{ student_id: string; status: string }>();
    expect(booking).toMatchObject({ student_id: parent.userId, status: 'CONFIRMED' });
  });

  it('rejects client-selected owner/role, invalid phone, empty input and missing CSRF', async () => {
    const owner = await register('parent');
    const other = await register('parent');
    for (const body of [
      { phone: '123' },
      { phone: '1'.repeat(16) },
      { displayName: ' ' },
      {},
      { phone: '0912345678', userId: other.userId },
      { phone: '0912345678', role: 'moderator' },
    ]) {
      const response = await api(ENDPOINT, jsonInit('PATCH', body, owner));
      expect(response.status).toBe(422);
      expect(await errorCode(response)).toBe('VALIDATION_ERROR');
    }
    const noCsrf = await api(ENDPOINT, {
      method: 'PATCH',
      headers: { Cookie: owner.cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: '0912345678' }),
    });
    expect(noCsrf.status).toBe(403);
    expect((await profile(owner.cookie)).phone).toBeNull();
  });
});
