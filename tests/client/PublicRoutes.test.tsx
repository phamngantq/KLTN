import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { anonymous, mockApi, renderRoute } from './helpers';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('public product foundation', () => {
  it('opens a Figma public route from the mobile menu and closes the menu', async () => {
    mockApi((req) =>
      req.path === '/me' ? anonymous : req.path === '/subjects' ? { data: [] } : undefined,
    );
    const { router } = renderRoute('/');
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'Mở menu' }));
    const menu = screen.getByRole('navigation', { name: 'Điều hướng di động' });
    await user.click(within(menu).getByRole('link', { name: 'Bảng giá' }));

    await waitFor(() => expect(router.state.location.pathname).toBe('/bang-gia'));
    expect(screen.getByRole('heading', { name: 'Bảng giá đang được xác nhận' })).toBeTruthy();
    expect(screen.queryByRole('navigation', { name: 'Điều hướng di động' })).toBeNull();
    expect(screen.getByText(/chưa có bảng giá chính thức/i)).toBeTruthy();
  });

  it('keeps existing tutor discovery reachable and labels the new class list unavailable', async () => {
    mockApi((req) => (req.path === '/me' ? anonymous : undefined));
    const { router } = renderRoute('/lop-hoc');
    expect(await screen.findByRole('heading', { name: 'Danh sách lớp học' })).toBeTruthy();
    expect(screen.getByText(/chưa có danh sách lớp để đăng ký trực tuyến/i)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Tìm gia sư' }).getAttribute('href')).toBe('/tutors');
    expect(router.state.location.pathname).toBe('/lop-hoc');
  });

  it('maps the exported login path to real session authentication', async () => {
    mockApi((req) => (req.path === '/me' ? anonymous : undefined));
    const { router } = renderRoute('/login');
    expect(await screen.findByRole('heading', { name: 'Đăng nhập' })).toBeTruthy();
    expect(router.state.location.pathname).toBe('/sign-in');
  });

  it('shows an honest state for an exported article detail path', async () => {
    mockApi((req) => (req.path === '/me' ? anonymous : undefined));
    const { router } = renderRoute('/blog/phu-huynh/unknown-article');
    expect(await screen.findByRole('heading', { name: 'Bài viết chưa khả dụng' })).toBeTruthy();
    expect(
      screen.getByText('Chưa có nội dung bài viết để hiển thị tại đường dẫn này.'),
    ).toBeTruthy();
    expect(router.state.location.pathname).toBe('/blog/phu-huynh/unknown-article');
  });
});
