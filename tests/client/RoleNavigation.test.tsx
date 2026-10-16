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

  it('has no "Khu vực người học" or "Khu vực gia sư" item', async () => {
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
    renderRoute('/tutor/pricing');
    await screen.findByLabelText('Tài khoản của Nguyễn An');
    expect(screen.queryByText('Khu vực gia sư', { ignore: false })).toBeNull();
    expect(
      screen.getByRole('link', { name: 'Gia Sư Đỗ Hằng — Trang chủ' }).getAttribute('href'),
    ).toBe('/tutor');
  });

  it('shows the tutor menu with collapsible groups and a nested contract group', async () => {
    mockApi((req) => {
      if (req.path === '/me') return sessionOf({ role: 'tutor' });
      if (req.path.startsWith('/content/contract/tutor-class-contract'))
        return {
          data: {
            id: 'c1',
            kind: 'contract',
            slug: 'tutor-class-contract',
            audience: 'tutor',
            title: 'Hợp đồng nhận lớp (mẫu)',
            summary: '',
            bodyText: 'Nội dung hợp đồng mẫu.',
            category: null,
            authorName: null,
            revision: 1,
            publishedAt: '2026-10-12T00:00:00.000Z',
          },
        };
      return undefined;
    });
    renderRoute('/tutor/hop-dong-mau');
    const user = userEvent.setup();
    const menu = await screen.findByRole('navigation', { name: 'Điều hướng Gia sư' });
    const topLevel = [...menu.querySelectorAll(':scope > ul > li')].map(
      (item) => item.querySelector('a, summary')?.textContent,
    );
    expect(topLevel).toEqual([
      'Tổng quan',
      'Hồ sơ gia sư',
      'Tìm kiếm lớp dạy',
      'Nội dung',
      'Bảng giá',
      'Cẩm nang',
      'Khiếu nại',
    ]);

    const search = within(menu).getByText('Tìm kiếm lớp dạy').closest('details')!;
    expect(search.open).toBe(false);
    await user.click(within(menu).getByText('Tìm kiếm lớp dạy'));
    expect(search.open).toBe(true);
    expect(
      within(search)
        .getAllByRole('link')
        .map((link) => [link.textContent, link.getAttribute('href')]),
    ).toEqual([
      ['Danh sách lớp mới', '/tutor/new-classes'],
      ['Yêu cầu nhận lớp', '/tutor/class-requests'],
    ]);
    await user.click(within(menu).getByText('Tìm kiếm lớp dạy'));
    expect(search.open).toBe(false);

    // The current page's group is highlighted and its nested group starts open.
    const content = within(menu).getByText('Nội dung').closest('details')!;
    expect(content.querySelector('summary')?.className).toContain('bg-accent');
    await user.click(within(menu).getByText('Nội dung'));
    const contracts = within(content).getByText('Hợp đồng').closest('details')!;
    expect(contracts.open).toBe(true);
    expect(
      within(contracts)
        .getAllByRole('link')
        .map((link) => [link.textContent, link.getAttribute('href')]),
    ).toEqual([
      ['Hợp đồng mẫu', '/tutor/hop-dong-mau'],
      ['Hợp đồng đã ký', '/tutor/contracts'],
    ]);
    expect(within(content).getByRole('link', { name: 'Cách thức nhận lớp' })).toBeTruthy();
    expect(await screen.findByText('Nội dung hợp đồng mẫu.')).toBeTruthy();
  });
});
