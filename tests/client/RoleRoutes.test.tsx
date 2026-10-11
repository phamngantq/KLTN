import { cleanup, screen, waitFor } from '@testing-library/react';
import { matchRoutes } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { routes } from '../../src/client/app/router';
import { anonymous, mockApi, renderRoute, sessionOf } from './helpers';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const parentPaths = [
  '/parent',
  '/parent/trang-chu',
  '/parent/gioi-thieu',
  '/parent/dich-vu',
  '/parent/bang-gia',
  '/parent/lop-hoc',
  '/parent/blog',
  '/parent/lien-he',
  '/parent/request',
  '/parent/profile',
  '/parent/khieu-nai',
];
const tutorPaths = [
  '/tutor',
  '/tutor/classes',
  '/tutor/profile',
  '/tutor/contracts',
  '/tutor/signed-contracts',
  '/tutor/pricing',
  '/tutor/blog',
  '/tutor/new-classes',
  '/tutor/matched-classes',
  '/tutor/how-to-accept',
  '/tutor/tutor-blog',
  '/tutor/class-history',
  '/tutor/responsibility-terms',
  '/tutor/contact',
  '/tutor/class-requests',
  '/tutor/khieu-nai',
];
const moderatorPaths = [
  '/admin',
  '/admin/users',
  '/admin/requests',
  '/admin/requests/find-tutor',
  '/admin/requests/accept-class',
  '/admin/classes',
  '/admin/tutor-approval',
  '/admin/services',
  '/admin/pricing',
  '/admin/content/blog',
  '/admin/content/faq',
  '/admin/content/contracts',
  '/admin/content/terms',
  '/admin/content/how-to-accept',
  '/admin/support',
  '/admin/reports',
  '/admin/reports/conversion',
  '/admin/reports/no-tutor',
  '/admin/reports/revenue',
  '/admin/settings',
];

describe('Figma role route matrix', () => {
  it('maps every exported parent, tutor and moderator path before the wildcard', () => {
    for (const path of [...parentPaths, ...tutorPaths, ...moderatorPaths]) {
      const matches = matchRoutes(routes, path);
      expect(matches?.at(-1)?.route.path, path).not.toBe('*');
      expect(matches?.length, path).toBeGreaterThan(2);
    }
  });

  it('shows the exported home screen at the parent home route', async () => {
    mockApi((req) => (req.path === '/me' ? sessionOf({ role: 'student' }) : undefined));
    renderRoute('/parent/trang-chu');
    expect(await screen.findByRole('heading', { name: 'Gia Sư Đỗ Hằng', level: 1 })).toBeTruthy();
  });

  it('keeps parent pages behind the trusted student session role', async () => {
    mockApi((req) => {
      if (req.path === '/me') return sessionOf({ role: 'student' });
      if (req.path === '/subjects') return { data: [{ id: 'math', slug: 'math', name: 'Toán' }] };
      return undefined;
    });
    const { router } = renderRoute('/parent/request');
    expect(await screen.findByRole('heading', { name: 'Tạo yêu cầu tìm gia sư' })).toBeTruthy();
    await waitFor(() => expect(router.state.location.pathname).toBe('/parent/request'));
    expect(screen.getByRole('navigation', { name: 'Điều hướng Phụ huynh' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Lưu bản nháp' })).toBeTruthy();
  });

  it('shows tutor pages only to tutors and does not offer a fake application', async () => {
    mockApi((req) => {
      if (req.path === '/me') return sessionOf({ role: 'tutor' });
      if (req.path === '/subjects') return { data: [] };
      if (req.path.startsWith('/classes?')) {
        return { data: { items: [], page: 1, pageSize: 12, total: 0 } };
      }
      return undefined;
    });
    renderRoute('/tutor/new-classes');
    expect(await screen.findByRole('heading', { name: 'Lớp mới' })).toBeTruthy();
    expect(await screen.findByRole('heading', { name: 'Chưa có lớp phù hợp' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /ứng tuyển/i })).toBeNull();
    expect(screen.getByRole('navigation', { name: 'Điều hướng Gia sư' })).toBeTruthy();
  });

  it('rejects cross-role access to moderator routes', async () => {
    mockApi((req) => (req.path === '/me' ? sessionOf({ role: 'tutor' }) : undefined));
    renderRoute('/admin/requests/find-tutor');
    expect(
      await screen.findByRole('heading', { name: 'Bạn không có quyền truy cập trang này' }),
    ).toBeTruthy();
    expect(screen.queryByRole('navigation', { name: 'Điều hướng Kiểm duyệt viên' })).toBeNull();
  });

  it('redirects guests to real sign-in with the target route', async () => {
    mockApi((req) => (req.path === '/me' ? anonymous : undefined));
    const { router } = renderRoute('/parent/profile');
    expect(await screen.findByRole('heading', { name: 'Đăng nhập' })).toBeTruthy();
    expect(router.state.location.pathname).toBe('/sign-in');
    expect(router.state.location.search).toBe(`?next=${encodeURIComponent('/parent/profile')}`);
  });
});
