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
    expect(screen.queryByRole('navigation', { name: 'Điều hướng di động Người học' })).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Mở menu' }));
    const menu = screen.getByRole('navigation', { name: 'Điều hướng di động Người học' });
    expect(
      within(menu)
        .getAllByRole('link')
        .map((link) => link.textContent),
    ).toEqual(['Tổng quan', 'Tìm kiếm gia sư', 'Bảng giá', 'Cẩm nang', 'Khiếu nại']);
    expect(within(menu).getByRole('link', { name: 'Tìm kiếm gia sư' }).className).toContain(
      'bg-accent',
    );
    expect(within(menu).queryByRole('link', { name: 'Khu vực người học' })).toBeNull();

    await user.click(within(menu).getByRole('link', { name: 'Tìm kiếm gia sư' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/parent'));
    expect(screen.queryByRole('navigation', { name: 'Điều hướng di động Người học' })).toBeNull();
  });

  it('has no "Khu vực người học" item for parents but keeps the tutor portal link', async () => {
    mockApi((req) => {
      if (req.path === '/me') return sessionOf({ role: 'student' });
      return undefined;
    });
    renderRoute('/');
    expect(await screen.findByLabelText('Tài khoản của Nguyễn An')).toBeTruthy();
    expect(screen.queryByText('Khu vực người học', { ignore: false })).toBeNull();
    expect(
      screen.getByRole('link', { name: 'Gia Sư Đỗ Hằng — Trang chủ' }).getAttribute('href'),
    ).toBe('/parent/dashboard');
    cleanup();
    vi.unstubAllGlobals();

    mockApi((req) => (req.path === '/me' ? sessionOf({ role: 'tutor' }) : undefined));
    renderRoute('/');
    await screen.findByLabelText('Tài khoản của Nguyễn An');
    expect(screen.getAllByText('Khu vực gia sư', { ignore: false }).length).toBeGreaterThan(0);
  });
});
