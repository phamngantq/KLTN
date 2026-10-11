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
    mockApi((req) => {
      if (req.path === '/me') return anonymous;
      if (req.path === '/subjects') return { data: [] };
      if (req.path === '/fee-options/published') return { data: [] };
      if (req.path === '/content/page/pricing?audience=public') {
        return { status: 404, error: { code: 'CONTENT_NOT_FOUND', message: 'Chưa có nội dung.' } };
      }
      if (req.path === '/content?kind=faq&audience=public&page=1&pageSize=12') {
        return { data: { items: [], page: 1, pageSize: 12, total: 0 } };
      }
      return undefined;
    });
    const { router } = renderRoute('/');
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'Mở menu' }));
    const menu = screen.getByRole('navigation', { name: 'Điều hướng di động' });
    await user.click(within(menu).getByRole('link', { name: 'Bảng giá' }));

    await waitFor(() => expect(router.state.location.pathname).toBe('/bang-gia'));
    expect(await screen.findByRole('heading', { name: 'Phí dịch vụ' })).toBeTruthy();
    expect(screen.queryByRole('navigation', { name: 'Điều hướng di động' })).toBeNull();
    expect(screen.getByRole('heading', { name: 'Miễn phí dịch vụ tìm gia sư' })).toBeTruthy();
  });

  it('keeps existing tutor discovery reachable and loads the public class list', async () => {
    mockApi((req) => {
      if (req.path === '/me') return anonymous;
      if (req.path === '/subjects') return { data: [] };
      if (req.path === '/classes?page=1&pageSize=12')
        return { data: { items: [], total: 0, page: 1, pageSize: 12 } };
      return undefined;
    });
    const { router } = renderRoute('/lop-hoc');
    expect(await screen.findByRole('heading', { name: 'Danh sách lớp học' })).toBeTruthy();
    expect(await screen.findByRole('heading', { name: 'Chưa có lớp phù hợp' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Tìm gia sư' }).getAttribute('href')).toBe('/tutors');
    expect(router.state.location.pathname).toBe('/lop-hoc');
  });

  it('maps the exported login path to real session authentication', async () => {
    mockApi((req) => (req.path === '/me' ? anonymous : undefined));
    const { router } = renderRoute('/login');
    expect(await screen.findByRole('heading', { name: 'Đăng nhập' })).toBeTruthy();
    expect(router.state.location.pathname).toBe('/sign-in');
  });

  it('does not display an article under the wrong category', async () => {
    mockApi((req) => (req.path === '/me' ? anonymous : undefined));
    const { router } = renderRoute('/blog/phu-huynh/unknown-article');
    expect(await screen.findByRole('heading', { name: 'Không tìm thấy bài viết' })).toBeTruthy();
    expect(router.state.location.pathname).toBe('/blog/phu-huynh/unknown-article');
  });
});
