import { cleanup, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AdminReportOverview } from '../../src/shared/schemas/reports';
import { mockApi, renderRoute, sessionOf } from './helpers';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const overview: AdminReportOverview = {
  range: { from: '2026-09-12', to: '2026-10-11', timeZone: 'Asia/Ho_Chi_Minh' },
  conversion: {
    range: { from: '2026-09-12', to: '2026-10-11', timeZone: 'Asia/Ho_Chi_Minh' },
    submittedRequests: 12,
    publishedClasses: 8,
    assignedClasses: 5,
    completedClasses: 3,
    publishRatePercent: 66.67,
    assignRatePercent: 41.67,
    completeRatePercent: 25,
  },
  openClasses: 4,
  openWithoutApplications: 2,
  activeClasses: 3,
  completedClasses: 1,
  revenue: {
    available: false,
    reason: 'NO_VERIFIED_PAYMENT_SOURCE',
    range: { from: '2026-09-12', to: '2026-10-11', timeZone: 'Asia/Ho_Chi_Minh' },
  },
};

describe('moderator dashboard', () => {
  it('renders Figma dashboard sections from real API totals without invented revenue', async () => {
    const { calls } = mockApi((req) => {
      if (req.path === '/me') return sessionOf({ role: 'admin' });
      if (req.path.startsWith('/admin/reports/overview?')) return { data: overview };
      if (req.path === '/admin/applications?status=submitted&pageSize=1') {
        return { data: { items: [], total: 4, page: 1, pageSize: 1 } };
      }
      if (req.path === '/admin/tutor-offers?status=pending&page=1&pageSize=1') {
        return { data: { items: [], total: 3, page: 1, pageSize: 1 } };
      }
      if (req.path === '/admin/tutor-offer-joins?status=submitted&page=1&pageSize=1') {
        return { data: { items: [], total: 2, page: 1, pageSize: 1 } };
      }
      return undefined;
    });

    renderRoute('/admin');
    expect(await screen.findByRole('heading', { name: 'Dashboard', level: 1 })).toBeTruthy();
    expect(
      await screen.findByRole('heading', { name: 'Biểu đồ chuyển đổi (Funnel)' }),
    ).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Trạng thái lớp học' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Cảnh báo vận hành' })).toBeTruthy();
    expect(screen.getByText('Yêu cầu nhận lớp').closest('a')?.getAttribute('href')).toBe(
      '/admin/requests/accept-class',
    );
    expect(screen.getByText('Yêu cầu nhận lớp').closest('a')?.textContent).toContain('4');
    expect(screen.getByText('Lớp mới').closest('a')?.textContent).toContain('8');
    expect(screen.getByText('Lớp chờ duyệt hợp đồng').closest('a')?.textContent).toContain('3');
    expect(screen.getByText('Yêu cầu tham gia lớp chờ duyệt').closest('a')?.textContent).toContain(
      '2',
    );
    expect(screen.getByText(/2 lớp đang tuyển được công bố trong kỳ/)).toBeTruthy();
    expect(screen.getByText(/4 đơn đang chờ kiểm duyệt viên xử lý/)).toBeTruthy();
    expect(screen.getByText('Doanh thu tháng này').closest('a')?.textContent).toContain(
      'Chưa có dữ liệu',
    );
    expect(screen.queryByText('45.2M')).toBeNull();
    expect(calls.some((call) => call.path.startsWith('/admin/reports/overview?'))).toBe(true);
  });

  it('shows honest empty states and retains the detailed report route', async () => {
    const { calls } = mockApi((req) => {
      if (req.path === '/me') return sessionOf({ role: 'admin' });
      if (req.path.startsWith('/admin/reports/overview?')) {
        return {
          data: {
            ...overview,
            conversion: {
              ...overview.conversion,
              submittedRequests: 0,
              publishedClasses: 0,
              assignedClasses: 0,
              completedClasses: 0,
              publishRatePercent: null,
              assignRatePercent: null,
              completeRatePercent: null,
            },
            openClasses: 0,
            openWithoutApplications: 0,
            activeClasses: 0,
            completedClasses: 0,
          },
        };
      }
      if (req.path === '/admin/applications?status=submitted&pageSize=1') {
        return { data: { items: [], total: 0, page: 1, pageSize: 1 } };
      }
      if (
        req.path === '/admin/tutor-offers?status=pending&page=1&pageSize=1' ||
        req.path === '/admin/tutor-offer-joins?status=submitted&page=1&pageSize=1'
      ) {
        return { data: { items: [], total: 0, page: 1, pageSize: 1 } };
      }
      return undefined;
    });

    renderRoute('/admin');
    expect(await screen.findByText('Chưa có yêu cầu được gửi trong kỳ.')).toBeTruthy();
    expect(screen.getByText('Chưa có lớp được công bố trong kỳ.')).toBeTruthy();
    expect(screen.getByText('Chưa có cảnh báo từ các chỉ số đang theo dõi.')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Xem báo cáo chi tiết' }).getAttribute('href')).toBe(
      '/admin/reports',
    );
    expect(calls).toHaveLength(5);
  });

  it('reports API failures instead of displaying placeholder KPIs', async () => {
    mockApi((req) => {
      if (req.path === '/me') return sessionOf({ role: 'admin' });
      if (req.path.startsWith('/admin/reports/overview?')) {
        return { status: 403, error: { code: 'FORBIDDEN', message: 'Không có quyền.' } };
      }
      if (req.path === '/admin/applications?status=submitted&pageSize=1') {
        return { data: { items: [], total: 0, page: 1, pageSize: 1 } };
      }
      if (
        req.path === '/admin/tutor-offers?status=pending&page=1&pageSize=1' ||
        req.path === '/admin/tutor-offer-joins?status=submitted&page=1&pageSize=1'
      ) {
        return { data: { items: [], total: 0, page: 1, pageSize: 1 } };
      }
      return undefined;
    });

    renderRoute('/admin');
    expect(await screen.findByRole('alert')).toHaveProperty(
      'textContent',
      expect.stringContaining('Không có quyền.'),
    );
    expect(screen.queryByRole('heading', { name: 'Biểu đồ chuyển đổi (Funnel)' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Thử lại' })).toBeTruthy();
  });
});
