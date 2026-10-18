import { cleanup, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mockApi, renderRoute, sessionOf } from './helpers';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('account page', () => {
  it('edits the display name, changes the password and signs out', async () => {
    let name = 'Nguyễn An';
    const { calls } = mockApi((req) => {
      if (req.path === '/me' && req.method === 'GET')
        return sessionOf({ role: 'tutor', displayName: name });
      if (req.path === '/me' && req.method === 'PATCH') {
        name = (req.body as { displayName: string }).displayName;
        return sessionOf({ role: 'tutor', displayName: name });
      }
      if (req.path === '/me/password') {
        const body = req.body as { currentPassword: string };
        return body.currentPassword === 'mat khau cu'
          ? { data: { changed: true } }
          : {
              status: 422,
              error: { code: 'CURRENT_PASSWORD_INVALID', message: 'Mật khẩu hiện tại không đúng.' },
            };
      }
      if (req.path === '/auth/logout') return { data: { loggedOut: true } };
      if (req.path.startsWith('/content') || req.path.startsWith('/subjects')) return { data: [] };
      return undefined;
    });
    renderRoute('/account');
    const user = userEvent.setup();
    const nameField = await screen.findByLabelText(/Họ tên/);
    expect(screen.getByText('a@example.com')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Hồ sơ gia sư' }).getAttribute('href')).toBe(
      '/tutor/profile',
    );
    const save = screen.getByRole('button', { name: 'Lưu thay đổi' });
    expect((save as HTMLButtonElement).disabled).toBe(true);
    await user.clear(nameField);
    await user.type(nameField, 'Nguyễn Văn An');
    await user.click(save);
    expect(await screen.findByText('Đã lưu thông tin tài khoản.')).toBeTruthy();
    expect(calls.find((call) => call.method === 'PATCH')?.body).toEqual({
      displayName: 'Nguyễn Văn An',
    });

    await user.type(screen.getByLabelText(/Mật khẩu hiện tại/), 'sai');
    await user.type(screen.getByLabelText(/^Mật khẩu mới/), 'mat khau moi 123');
    await user.type(screen.getByLabelText(/Nhập lại mật khẩu mới/), 'khac nhau');
    await user.click(screen.getByRole('button', { name: 'Đổi mật khẩu' }));
    expect(await screen.findByText('Mật khẩu nhập lại không khớp.')).toBeTruthy();
    expect(calls.some((call) => call.path === '/me/password')).toBe(false);
    await user.clear(screen.getByLabelText(/Nhập lại mật khẩu mới/));
    await user.type(screen.getByLabelText(/Nhập lại mật khẩu mới/), 'mat khau moi 123');
    await user.click(screen.getByRole('button', { name: 'Đổi mật khẩu' }));
    expect(await screen.findByText('Mật khẩu hiện tại không đúng.')).toBeTruthy();
    await user.clear(screen.getByLabelText(/Mật khẩu hiện tại/));
    await user.type(screen.getByLabelText(/Mật khẩu hiện tại/), 'mat khau cu');
    await user.click(screen.getByRole('button', { name: 'Đổi mật khẩu' }));
    expect(await screen.findByText(/Đã đổi mật khẩu/)).toBeTruthy();

    await user.click(screen.getAllByRole('button', { name: 'Đăng xuất' }).at(-1)!);
    await waitFor(() => expect(calls.some((call) => call.path === '/auth/logout')).toBe(true));
  });
});
