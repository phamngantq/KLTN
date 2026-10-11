import { cleanup, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TutorAssignment } from '../../src/shared/schemas/admin-assignments';
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
};

const assignment: TutorAssignment = {
  id: 'assignment-1',
  classId: 'class-1',
  classCode: 'L-001',
  applicationId: 'application-1',
  subjectName: 'Toán',
  grade: 'Lớp 10',
  mode: 'offline',
  publicArea: 'Thanh Xuân, Hà Nội',
  agreedTuitionPerSessionMinor: null,
  status: 'active',
  assignedAt: '2026-10-11T01:00:00.000Z',
};

describe('tutor dashboard', () => {
  it('shows assigned classes from the tutor API without exposing parent contact', async () => {
    const { calls } = mockApi((req) => {
      if (req.path === '/me') return sessionOf({ role: 'tutor' });
      if (req.path === '/tutor/dashboard') return { data: metrics };
      if (req.path === '/tutor/assignments?page=1&pageSize=2') {
        return { data: { items: [assignment], page: 1, pageSize: 2, total: 1 } };
      }
      return undefined;
    });

    renderRoute('/tutor');
    const recent = await screen.findByRole('region', { name: 'Lớp học gần đây' });
    expect(await within(recent).findByRole('heading', { name: 'Toán - Lớp 10' })).toBeTruthy();
    expect(within(recent).getByText('Mã lớp: L-001')).toBeTruthy();
    expect(within(recent).getByText('Trực tiếp · Thanh Xuân, Hà Nội')).toBeTruthy();
    expect(within(recent).getByRole('link', { name: 'Xem lớp' }).getAttribute('href')).toBe(
      '/tutor/classes',
    );
    expect(await screen.findByText('Đơn đang chờ')).toBeTruthy();
    expect(screen.getByText('Đơn đang chờ').closest('a')?.textContent).toContain('2');
    expect(screen.getByRole('link', { name: 'Xem hướng dẫn nhận lớp' })).toBeTruthy();
    expect(screen.queryByText(/thu nhập tháng|giờ dạy tuần|hệ thống AI/i)).toBeNull();
    expect(calls.some((call) => call.path === '/tutor/assignments?page=1&pageSize=2')).toBe(true);
    expect(calls.some((call) => call.path.includes('/contact'))).toBe(false);
  });

  it('shows an honest empty state when no class has been assigned', async () => {
    mockApi((req) => {
      if (req.path === '/me') return sessionOf({ role: 'tutor' });
      if (req.path === '/tutor/dashboard') return { data: { ...metrics, activeAssignments: 0 } };
      if (req.path === '/tutor/assignments?page=1&pageSize=2') {
        return { data: { items: [], page: 1, pageSize: 2, total: 0 } };
      }
      return undefined;
    });

    renderRoute('/tutor');
    const recent = await screen.findByRole('region', { name: 'Lớp học gần đây' });
    expect(await within(recent).findByText(/Chưa có lớp được gán/)).toBeTruthy();
    expect(within(recent).queryByRole('link', { name: 'Xem lớp' })).toBeNull();
  });

  it('reports a failed recent-class read instead of displaying sample classes', async () => {
    mockApi((req) => {
      if (req.path === '/me') return sessionOf({ role: 'tutor' });
      if (req.path === '/tutor/dashboard') return { data: metrics };
      if (req.path === '/tutor/assignments?page=1&pageSize=2') {
        return { status: 503, error: { code: 'UNAVAILABLE', message: 'Máy chủ tạm gián đoạn.' } };
      }
      return undefined;
    });

    renderRoute('/tutor');
    const recent = await screen.findByRole('region', { name: 'Lớp học gần đây' });
    expect(await within(recent).findByRole('alert')).toHaveProperty(
      'textContent',
      expect.stringContaining('Máy chủ tạm gián đoạn.'),
    );
    expect(within(recent).getByRole('button', { name: 'Thử lại' })).toBeTruthy();
    expect(within(recent).queryByText('Toán - Lớp 10')).toBeNull();
  });
});
