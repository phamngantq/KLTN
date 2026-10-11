import { cleanup, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PublicTutor } from '../../src/shared/schemas/discovery';
import { anonymous, mockApi, renderRoute, sessionOf } from './helpers';

const demoTutor: PublicTutor = {
  id: 'demo-tutor',
  slug: 'demo-tutor',
  displayName: 'Gia sư minh họa',
  bio: 'Hồ sơ dùng để xem giao diện.',
  hourlyRateMinor: 123_000,
  currency: 'VND',
  teachesOnline: true,
  teachesOffline: false,
  subjects: [{ id: 'subj_math', slug: 'toan', name: 'Toán' }],
};

beforeEach(() => vi.stubEnv('VITE_PREVIEW_READ_ONLY', 'true'));
afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('read-only preview UI', () => {
  it('labels the demo and does not invite account registration', async () => {
    mockApi((req) =>
      req.path === '/me' ? anonymous : req.path === '/subjects' ? { data: [] } : undefined,
    );
    renderRoute('/');
    expect(await screen.findByRole('heading', { level: 1 })).toBeTruthy();
    expect(screen.getByRole('status').textContent).toContain('Bản xem trước chỉ đọc');
    expect(screen.queryByRole('link', { name: 'Tạo tài khoản' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Đăng ký' })).toBeNull();
  });

  it.each([
    ['/sign-in', 'Đăng nhập chưa mở'],
    ['/sign-up', 'Đăng ký chưa mở'],
  ])('replaces %s with an unavailable state', async (path, title) => {
    mockApi((req) => (req.path === '/me' ? anonymous : undefined));
    renderRoute(path);
    expect(await screen.findByRole('heading', { name: title })).toBeTruthy();
    expect(screen.queryByLabelText('Email')).toBeNull();
  });

  it('does not render parent request actions even with a session', async () => {
    mockApi((req) => (req.path === '/me' ? sessionOf({ role: 'student' }) : undefined));
    renderRoute('/parent/request');
    expect(await screen.findByRole('heading', { name: 'Khu vực tài khoản chưa mở' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Lưu bản nháp' })).toBeNull();
  });

  it('shows a sample tutor without a booking action, rate, or price filters', async () => {
    mockApi((req) => {
      if (req.path === '/me') return anonymous;
      if (req.path === '/subjects') return { data: demoTutor.subjects };
      if (req.path.startsWith('/tutors?')) {
        return { data: { items: [demoTutor], page: 1, pageSize: 12, total: 1 } };
      }
      return undefined;
    });
    renderRoute('/tutors');
    expect(await screen.findByRole('link', { name: demoTutor.displayName })).toBeTruthy();
    expect(screen.getByText('Hồ sơ minh họa · Học phí chưa công bố')).toBeTruthy();
    expect(screen.queryByLabelText(/Giá từ/)).toBeNull();
    expect(screen.queryByLabelText(/Sắp xếp/)).toBeNull();
    expect(screen.queryByText(/123\.000/)).toBeNull();
  });

  it('hides the booking picker on a direct sample tutor URL', async () => {
    mockApi((req) => {
      if (req.path === '/me') return anonymous;
      if (req.path === '/tutors/demo-tutor') return { data: demoTutor };
      return undefined;
    });
    renderRoute('/tutors/demo-tutor');
    expect(await screen.findByRole('heading', { name: demoTutor.displayName })).toBeTruthy();
    expect(screen.getByText('Hồ sơ minh họa · Học phí chưa công bố')).toBeTruthy();
    expect(screen.getByText(/Phụ huynh gửi môn học, lớp và lịch mong muốn/)).toBeTruthy();
    expect(screen.queryByText(/123\.000/)).toBeNull();
    expect(screen.queryByRole('button', { name: /Gửi yêu cầu đặt lịch/ })).toBeNull();
  });
});
