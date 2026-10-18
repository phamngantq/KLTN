import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mockApi, renderRoute, sessionOf } from './helpers';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('AccountPage deletion', () => {
  it('requires typed confirmation and keeps the account visible after an active-obligation 409', async () => {
    const { calls } = mockApi((req) => {
      if (req.path === '/me') return sessionOf({ role: 'student' });
      if (req.path === '/account/deletion' && req.method === 'POST')
        return {
          status: 409,
          error: {
            code: 'ACCOUNT_HAS_ACTIVE_OBLIGATIONS',
            message: 'Tài khoản còn lịch hoặc lớp đang xử lý.',
          },
        };
      return undefined;
    });
    renderRoute('/account');
    const user = userEvent.setup();
    expect(await screen.findByRole('heading', { name: 'Tài khoản' })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Yêu cầu xóa tài khoản' }));
    await user.click(screen.getByRole('button', { name: 'Xóa tài khoản' }));
    expect(await screen.findByText('Nhập đúng DELETE để xác nhận.')).toBeTruthy();
    expect(calls.some((call) => call.path === '/account/deletion')).toBe(false);

    await user.type(screen.getByLabelText('Nhập DELETE'), 'DELETE');
    await user.click(screen.getByRole('button', { name: 'Xóa tài khoản' }));
    expect(await screen.findAllByText('Tài khoản còn lịch hoặc lớp đang xử lý.')).toHaveLength(2);
    await waitFor(() =>
      expect(calls.find((call) => call.path === '/account/deletion')?.body).toEqual({
        confirmation: 'DELETE',
      }),
    );
    expect(within(screen.getByRole('main')).getByDisplayValue('Nguyễn An')).toBeTruthy();
  });
});
