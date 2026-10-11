import { cleanup, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AdminUser } from '../../src/shared/schemas/admin-users';
import { mockApi, renderRoute, sessionOf } from './helpers';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const tutor: AdminUser = {
  id: '00000000-0000-4000-8000-000000000121',
  email: 'tutor@example.invalid',
  displayName: 'Gia sư A',
  role: 'tutor',
  productRole: 'tutor',
  status: 'active',
  createdAt: '2026-10-11T00:00:00.000Z',
  updatedAt: '2026-10-11T00:00:00.000Z',
};

describe('moderator user list', () => {
  it('shows API users and only supported account details', async () => {
    mockApi((req) => {
      if (req.path === '/me') return sessionOf({ role: 'admin' });
      if (req.path.startsWith('/admin/users?')) {
        return { data: { items: [tutor], total: 1, page: 1, pageSize: 20 } };
      }
      return undefined;
    });
    renderRoute('/admin/users');

    expect(await screen.findByText('1 tài khoản phù hợp · Trang 1')).toBeTruthy();
    expect(screen.getByText(tutor.displayName)).toBeTruthy();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Chi tiết' }));
    expect(screen.getByRole('heading', { name: 'Hồ sơ gia sư' })).toBeTruthy();
    expect(screen.getAllByText(tutor.id).length).toBeGreaterThan(0);
    expect(screen.queryByText('Số điện thoại')).toBeNull();
    expect(screen.queryByText('Địa chỉ')).toBeNull();
  });

  it('closes account details when the moderator changes the list filter', async () => {
    mockApi((req) => {
      if (req.path === '/me') return sessionOf({ role: 'admin' });
      if (req.path.startsWith('/admin/users?')) {
        const filtered = req.path.includes('role=student');
        return {
          data: { items: filtered ? [] : [tutor], total: filtered ? 0 : 1, page: 1, pageSize: 20 },
        };
      }
      return undefined;
    });
    renderRoute('/admin/users');
    const user = userEvent.setup();

    await screen.findByText(tutor.displayName);
    await user.click(screen.getByRole('button', { name: 'Chi tiết' }));
    expect(screen.getByRole('heading', { name: 'Hồ sơ gia sư' })).toBeTruthy();
    await user.selectOptions(screen.getByLabelText('Vai trò'), 'student');
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Hồ sơ gia sư' })).toBeNull());
  });
});
