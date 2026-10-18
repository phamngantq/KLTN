import { describe, expect, it } from 'vitest';
import type { ApiSuccess } from '../../src/shared/api';
import type { SessionPayload } from '../../src/shared/schemas/auth';
import { api, errorCode, jsonInit, register, sessionCookieFrom, uniqueEmail } from './helpers';

const me = (cookie: string) => api('/me', { headers: { Cookie: cookie } });

async function login(email: string, password: string) {
  return api('/auth/login', jsonInit('POST', { email, password }));
}

describe('account management', () => {
  it('registers only learners and tutors, never a moderator', async () => {
    const admin = await api(
      '/auth/register',
      jsonInit('POST', {
        email: uniqueEmail('admin'),
        password: 'correct horse battery',
        displayName: 'Tự nhận quản lý',
        role: 'admin',
      }),
    );
    expect(admin.status).toBe(422);
    // Sign-up "parent" is stored as the learner (student) role.
    for (const [role, stored] of [
      ['parent', 'student'],
      ['tutor', 'tutor'],
    ] as const) {
      const account = await register(role);
      const body = await (await me(account.cookie)).json<ApiSuccess<SessionPayload>>();
      expect(body.data.user.role).toBe(stored);
    }
  });

  it('updates the display name of the signed-in account only', async () => {
    const account = await register('tutor');
    const anonymous = await api('/me', jsonInit('PATCH', { displayName: 'Ẩn danh' }));
    expect(anonymous.status).toBe(401);
    const blank = await api('/me', jsonInit('PATCH', { displayName: '   ' }, account));
    expect(blank.status).toBe(422);
    // Role and email are not editable from here.
    const sneaky = await api(
      '/me',
      jsonInit('PATCH', { displayName: 'Gia sư mới', role: 'admin' }, account),
    );
    expect(sneaky.status).toBe(422);
    const updated = await api('/me', jsonInit('PATCH', { displayName: '  Gia sư mới  ' }, account));
    expect(updated.status).toBe(200);
    expect((await updated.json<ApiSuccess<SessionPayload>>()).data.user).toMatchObject({
      displayName: 'Gia sư mới',
      role: 'tutor',
    });
    const body = await (await me(account.cookie)).json<ApiSuccess<SessionPayload>>();
    expect(body.data.user.displayName).toBe('Gia sư mới');
  });

  it('changes the password with the current one and signs out other sessions', async () => {
    const account = await register('parent');
    const second = sessionCookieFrom(await login(account.email, account.password));
    expect((await me(second)).status).toBe(200);

    const wrong = await api(
      '/me/password',
      jsonInit(
        'POST',
        { currentPassword: 'sai mat khau', newPassword: 'mat khau moi 123' },
        account,
      ),
    );
    expect(wrong.status).toBe(422);
    expect(await errorCode(wrong)).toBe('CURRENT_PASSWORD_INVALID');
    const short = await api(
      '/me/password',
      jsonInit('POST', { currentPassword: account.password, newPassword: 'ngan' }, account),
    );
    expect(short.status).toBe(422);
    const same = await api(
      '/me/password',
      jsonInit(
        'POST',
        { currentPassword: account.password, newPassword: account.password },
        account,
      ),
    );
    expect(await errorCode(same)).toBe('PASSWORD_UNCHANGED');

    const changed = await api(
      '/me/password',
      jsonInit(
        'POST',
        { currentPassword: account.password, newPassword: 'mat khau moi 123' },
        account,
      ),
    );
    expect(changed.status).toBe(200);
    // This session stays; the other one is signed out.
    expect((await me(account.cookie)).status).toBe(200);
    expect((await me(second)).status).toBe(401);
    expect((await login(account.email, account.password)).status).toBe(401);
    expect((await login(account.email, 'mat khau moi 123')).status).toBe(200);
  });

  it('logs out the session', async () => {
    const account = await register('tutor');
    const out = await api('/auth/logout', jsonInit('POST', {}, account));
    expect(out.status).toBe(200);
    expect((await me(account.cookie)).status).toBe(401);
  });
});
