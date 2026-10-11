import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import type { ApiSuccess } from '../../src/shared/api';
import type { AdminUser } from '../../src/shared/schemas/admin-users';
import type { Page } from '../../src/shared/schemas/discovery';
import { api, errorCode, jsonInit, register, type Session } from './helpers';

async function makeModerator(): Promise<Session> {
  const account = await register('parent');
  await env.DB.prepare("UPDATE users SET role = 'admin' WHERE id = ?").bind(account.userId).run();
  return account;
}

async function getUser(moderator: Session, id: string): Promise<AdminUser> {
  const response = await api(`/admin/users/${id}`, { headers: { Cookie: moderator.cookie } });
  expect(response.status).toBe(200);
  return (await response.json<ApiSuccess<AdminUser>>()).data;
}

describe('moderator user management', () => {
  it('lists real accounts by role and search, with moderator-only access', async () => {
    const moderator = await makeModerator();
    const parent = await register('parent');
    const tutor = await register('tutor');
    expect((await api('/admin/users')).status).toBe(401);
    expect((await api('/admin/users', { headers: { Cookie: parent.cookie } })).status).toBe(403);
    const response = await api(
      `/admin/users?role=tutor&search=${encodeURIComponent(tutor.email.toUpperCase())}&pageSize=1`,
      {
        headers: { Cookie: moderator.cookie },
      },
    );
    expect(response.status).toBe(200);
    const page = (await response.json<ApiSuccess<Page<AdminUser>>>()).data;
    expect(page.items).toHaveLength(1);
    expect(page.items[0]).toMatchObject({
      id: tutor.userId,
      role: 'tutor',
      productRole: 'tutor',
      status: 'active',
    });
    expect(page.items[0]).not.toHaveProperty('passwordHash');
    expect(
      (await api('/admin/users?role=other', { headers: { Cookie: moderator.cookie } })).status,
    ).toBe(422);
  });

  it('suspends and reactivates a tutor with CAS, revokes sessions, and audits the change', async () => {
    const moderator = await makeModerator();
    const tutor = await register('tutor');
    const before = await getUser(moderator, tutor.userId);
    const suspend = await api(
      `/admin/users/${tutor.userId}/suspend`,
      jsonInit(
        'POST',
        {
          updatedAt: before.updatedAt,
          reason: 'Vi phạm quy định hồ sơ',
        },
        moderator,
      ),
    );
    expect(suspend.status).toBe(200);
    const suspended = (await suspend.json<ApiSuccess<AdminUser>>()).data;
    expect(suspended.status).toBe('suspended');
    expect(suspended.updatedAt).not.toBe(before.updatedAt);
    expect((await api('/me', { headers: { Cookie: tutor.cookie } })).status).toBe(401);
    expect(
      (await api('/auth/login', jsonInit('POST', { email: tutor.email, password: tutor.password })))
        .status,
    ).toBe(403);
    const repeat = await api(
      `/admin/users/${tutor.userId}/suspend`,
      jsonInit(
        'POST',
        {
          updatedAt: before.updatedAt,
          reason: 'Lặp lại',
        },
        moderator,
      ),
    );
    expect(repeat.status).toBe(409);
    expect(await errorCode(repeat)).toBe('STALE_USER');

    const reactivate = await api(
      `/admin/users/${tutor.userId}/reactivate`,
      jsonInit(
        'POST',
        {
          updatedAt: suspended.updatedAt,
          reason: 'Đã xử lý',
        },
        moderator,
      ),
    );
    expect(reactivate.status).toBe(200);
    expect((await reactivate.json<ApiSuccess<AdminUser>>()).data.status).toBe('active');
    expect((await api('/me', { headers: { Cookie: tutor.cookie } })).status).toBe(401);
    expect(
      (await api('/auth/login', jsonInit('POST', { email: tutor.email, password: tutor.password })))
        .status,
    ).toBe(200);
    const audit = await env.DB.prepare(
      "SELECT COUNT(*) AS total FROM audit_logs WHERE target_type = 'user' AND target_id = ? AND action = 'user.status_changed'",
    )
      .bind(tutor.userId)
      .first<{ total: number }>();
    expect(audit?.total).toBe(2);
  });

  it('protects moderator accounts and requires a reason', async () => {
    const moderator = await makeModerator();
    const tutor = await register('tutor');
    const moderatorAccount = await getUser(moderator, moderator.userId);
    const blocked = await api(
      `/admin/users/${moderator.userId}/suspend`,
      jsonInit(
        'POST',
        {
          updatedAt: moderatorAccount.updatedAt,
          reason: 'Không hợp lệ',
        },
        moderator,
      ),
    );
    expect(blocked.status).toBe(403);
    const target = await getUser(moderator, tutor.userId);
    expect(
      (
        await api(
          `/admin/users/${tutor.userId}/suspend`,
          jsonInit(
            'POST',
            {
              updatedAt: target.updatedAt,
              reason: '',
            },
            moderator,
          ),
        )
      ).status,
    ).toBe(422);
    expect((await getUser(moderator, tutor.userId)).status).toBe('active');
  });

  it('never reactivates an account after its owner deletes it', async () => {
    const moderator = await makeModerator();
    const tutor = await register('tutor');
    const deleted = await api(
      '/account/deletion',
      jsonInit('POST', { confirmation: 'DELETE' }, tutor),
    );
    expect(deleted.status).toBe(200);
    const tombstone = await getUser(moderator, tutor.userId);
    expect(tombstone.status).toBe('suspended');
    const response = await api(
      `/admin/users/${tutor.userId}/reactivate`,
      jsonInit('POST', { updatedAt: tombstone.updatedAt, reason: 'Thử kích hoạt lại' }, moderator),
    );
    expect(response.status).toBe(409);
    expect(await errorCode(response)).toBe('ACCOUNT_DELETED');
  });
});
