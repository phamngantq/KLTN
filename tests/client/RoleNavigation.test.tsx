import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mockApi, renderRoute, sessionOf } from './helpers';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('role navigation', () => {
  it('opens the parent menu inside one header and closes it after role navigation', async () => {
    mockApi((req) => {
      if (req.path === '/me') return sessionOf({ role: 'student' });
      if (req.path === '/subjects') return { data: [{ id: 'math', slug: 'math', name: 'Toán' }] };
      if (req.path.startsWith('/parent/requests?')) {
        return { data: { items: [], page: 1, pageSize: 12, total: 0 } };
      }
      return undefined;
    });
    const { router } = renderRoute('/parent/request');
    const user = userEvent.setup();
    await screen.findByRole('heading', { name: 'Tạo yêu cầu tìm gia sư' });

    expect(document.querySelectorAll('header.sticky')).toHaveLength(1);
    expect(document.querySelector('[data-role-area="parent"] nav')).toBeNull();
    expect(screen.queryByRole('navigation', { name: 'Điều hướng di động Phụ huynh' })).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Mở menu' }));
    const menu = screen.getByRole('navigation', { name: 'Điều hướng di động Phụ huynh' });
    expect(within(menu).getByRole('link', { name: 'Thuê gia sư' })).toBeTruthy();
    await user.click(within(menu).getByText('Lịch cũ'));
    expect(within(menu).getByRole('link', { name: 'Lịch đã đặt' }).getAttribute('href')).toBe(
      '/student/bookings',
    );
    expect(within(menu).queryByRole('link', { name: 'Khu vực phụ huynh' })).toBeNull();

    await user.click(within(menu).getByRole('link', { name: 'Thuê gia sư' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/parent'));
    expect(screen.queryByRole('navigation', { name: 'Điều hướng di động Phụ huynh' })).toBeNull();
  });
});
