import { cleanup, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PublicClass } from '../../src/shared/schemas/classes';
import type { TutorDashboard } from '../../src/shared/schemas/reports';
import { mockApi, renderRoute, sessionOf } from './helpers';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const metrics: TutorDashboard = {
  submittedApplications: 2,
  selectedApplications: 1,
  activeAssignments: 1,
  registeredClasses: 3,
  acceptedClasses: 1,
};

function publicClass(id: string, overrides: Partial<PublicClass> = {}): PublicClass {
  return {
    id,
    code: `LH-${id}`,
    subjectId: 'subj_math',
    subjectName: 'Toán',
    grade: 'Lớp 9',
    mode: 'offline',
    publicArea: 'Cầu Giấy, Hà Nội',
    expectedBudgetMinor: 200_000,
    status: 'open',
    version: 1,
    schedule: {
      timezone: 'Asia/Ho_Chi_Minh',
      discussLater: false,
      windows: [{ weekday: 1, startLocal: '19:30', endLocal: '21:00' }],
    },
    publishedAt: '2026-10-15T01:00:00.000Z',
    createdAt: '2026-10-15T01:00:00.000Z',
    sessionsPerWeek: 2,
    tutorRequirements: null,
    studentTraits: null,
    placementFeeMinor: null,
    ...overrides,
  };
}

const page = (items: unknown[], total = items.length) => ({
  data: { items, total, page: 1, pageSize: 4 },
});

describe('tutor dashboard', () => {
  it('shows the three stats, shortcuts without a heading, matched classes and tips', async () => {
    const matched = [
      publicClass('m1', { subjectName: 'Vật lý', grade: 'Lớp 11' }),
      publicClass('m2', { mode: 'online', publicArea: null, expectedBudgetMinor: null }),
    ];
    const { calls } = mockApi((req) => {
      if (req.path === '/me') return sessionOf({ role: 'tutor' });
      if (req.path === '/tutor/dashboard') return { data: metrics };
      if (req.path.startsWith('/tutor/classes/recommendations'))
        return page(
          matched.map((item, index) => ({ class: item, match: { score: 92 - index } })),
          5,
        );
      return undefined;
    });

    renderRoute('/tutor');
    const registered = (await screen.findByText('Lớp đã đăng ký nhận')).closest('a')!;
    expect(registered.textContent).toContain('3');
    expect(registered.getAttribute('href')).toBe('/tutor/class-requests');
    expect((await screen.findByText('Lớp phù hợp')).closest('a')?.textContent).toContain('5');
    expect(screen.getByText('Lớp đã hoàn tất nhận').closest('a')?.textContent).toContain('1');

    // The shortcuts stay, without the "Lối tắt chức năng" heading.
    expect(screen.queryByText('Lối tắt chức năng')).toBeNull();
    const shortcuts = screen.getByRole('region', { name: 'Lối tắt' });
    expect(
      within(shortcuts)
        .getAllByRole('link')
        .map((link) => [link.querySelector('h3')?.textContent, link.getAttribute('href')]),
    ).toEqual([
      ['Tìm lớp học', '/tutor/new-classes'],
      ['Hồ sơ của tôi', '/tutor/profile'],
      ['Cẩm nang gia sư', '/tutor/cam-nang'],
    ]);

    // "Lớp học phù hợp" replaces "Lớp học mới": matched classes only, no fit percentage.
    expect(screen.queryByRole('region', { name: 'Lớp học mới' })).toBeNull();
    const classes = screen.getByRole('region', { name: 'Lớp học phù hợp' });
    const headings = await within(classes).findAllByRole('heading', { level: 3 });
    expect(headings.map((heading) => heading.textContent)).toEqual([
      'Vật lý - Lớp 11',
      'Toán - Lớp 9',
    ]);
    expect(within(classes).getByText('Lớp LH-m1')).toBeTruthy();
    expect(within(classes).queryByText(/Phù hợp \d+%/)).toBeNull();
    expect(within(classes).getByText('Trực tiếp · Cầu Giấy, Hà Nội')).toBeTruthy();
    expect(within(classes).getByText('Trực tuyến')).toBeTruthy();
    expect(within(classes).getByText('Thù lao thỏa thuận')).toBeTruthy();
    expect(within(classes).getAllByText(/Thứ Hai 19:30/).length).toBe(2);
    expect(
      within(classes).getByRole('link', { name: 'Xem chi tiết lớp LH-m1' }).getAttribute('href'),
    ).toBe('/tutor/new-classes/m1');
    expect(
      within(classes)
        .getByRole('link', { name: /Xem tất cả lớp phù hợp/ })
        .getAttribute('href'),
    ).toBe('/tutor/matched-classes');
    expect(calls.some((call) => call.path.startsWith('/classes?'))).toBe(false);

    const tips = screen.getByRole('region', { name: 'Mẹo tăng cơ hội nhận lớp' });
    expect(within(tips).getAllByRole('listitem')).toHaveLength(5);
    expect(calls.some((call) => call.path.includes('/contact'))).toBe(false);
  });

  it('shows an honest empty state and reports a failed class read', async () => {
    mockApi((req) => {
      if (req.path === '/me') return sessionOf({ role: 'tutor' });
      if (req.path === '/tutor/dashboard') return { data: metrics };
      if (req.path.startsWith('/tutor/classes/recommendations')) return page([]);
      if (req.path.startsWith('/classes?')) return page([]);
      return undefined;
    });
    renderRoute('/tutor');
    const classes = await screen.findByRole('region', { name: 'Lớp học phù hợp' });
    expect(
      await within(classes).findByText(/Hiện chưa có lớp phù hợp với hồ sơ của bạn/),
    ).toBeTruthy();
    expect(within(classes).getByRole('link', { name: 'Cập nhật hồ sơ' }).getAttribute('href')).toBe(
      '/tutor/profile',
    );
    cleanup();
    vi.unstubAllGlobals();

    mockApi((req) => {
      if (req.path === '/me') return sessionOf({ role: 'tutor' });
      if (req.path === '/tutor/dashboard') return { data: metrics };
      if (req.path.startsWith('/tutor/classes/recommendations'))
        return { status: 503, error: { code: 'UNAVAILABLE', message: 'Máy chủ tạm gián đoạn.' } };
      if (req.path.startsWith('/classes?')) return page([]);
      return undefined;
    });
    renderRoute('/tutor');
    const failed = await screen.findByRole('region', { name: 'Lớp học phù hợp' });
    expect(await within(failed).findByRole('alert')).toHaveProperty(
      'textContent',
      expect.stringContaining('Máy chủ tạm gián đoạn.'),
    );
    expect(within(failed).getByRole('button', { name: 'Thử lại' })).toBeTruthy();
  });
});
