import { cleanup, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AdminApplication } from '../../src/shared/schemas/admin-applications';
import type { ClassLifecycle, TutorAssignment } from '../../src/shared/schemas/admin-assignments';
import type { AdminClass } from '../../src/shared/schemas/classes';
import type { OwnParentRequest } from '../../src/shared/schemas/requests';
import { mockApi, renderRoute, sessionOf } from './helpers';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const classId = '00000000-0000-4000-8000-000000000001';
const applicationId = '00000000-0000-4000-8000-000000000002';
const assignmentId = '00000000-0000-4000-8000-000000000003';

const application: AdminApplication = {
  id: applicationId,
  classId,
  classCode: 'LH-ABC123',
  classStatus: 'open',
  classVersion: 2,
  requestVersion: 3,
  tutorUserId: 'tutor-1',
  tutorDisplayName: 'Gia sư A',
  feeOptionVersionId: '00000000-0000-4000-8000-000000000004',
  feeOptionKey: 'first_lesson_percent',
  feeOptionVersion: 1,
  feeOptionTitle: 'Theo buổi đầu',
  rejectionReason: null,
  status: 'submitted',
  version: 1,
  createdAt: '2026-10-11T00:00:00.000Z',
  updatedAt: '2026-10-11T00:00:00.000Z',
};

const adminClass: AdminClass = {
  id: classId,
  code: application.classCode,
  sourceRequestId: '00000000-0000-4000-8000-000000000005',
  sourceRequestVersion: 3,
  parentUserId: 'parent-1',
  subjectId: 'math',
  subjectName: 'Toán',
  grade: 'Lớp 8',
  mode: 'online',
  publicArea: null,
  expectedBudgetMinor: 200_000,
  status: 'active',
  version: 3,
  schedule: { timezone: 'Asia/Ho_Chi_Minh', discussLater: true, windows: [] },
  publishedAt: '2026-10-11T00:00:00.000Z',
  createdAt: '2026-10-11T00:00:00.000Z',
  updatedAt: '2026-10-11T01:00:00.000Z',
};

describe('agreed tuition UI', () => {
  it('requires a tuition amount and confirmation before assigning a tutor', async () => {
    const { calls } = mockApi((req) => {
      if (req.path === '/me') return sessionOf({ role: 'admin' });
      if (req.path === '/admin/applications?page=1')
        return { data: { items: [application], page: 1, pageSize: 12, total: 1 } };
      if (req.path === `/admin/classes/${classId}/assign` && req.method === 'POST')
        return { data: { id: assignmentId, classId } };
      return undefined;
    });
    renderRoute('/admin/applications');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Gán gia sư' }));
    await user.click(screen.getByRole('button', { name: 'Gán và kích hoạt lớp' }));
    expect(calls.some((call) => call.path.endsWith('/assign'))).toBe(false);

    await user.type(screen.getByRole('spinbutton', { name: /Học phí đã chốt/ }), '250000');
    await user.click(screen.getByRole('button', { name: 'Gán và kích hoạt lớp' }));
    expect(calls.some((call) => call.path.endsWith('/assign'))).toBe(false);

    await user.click(
      screen.getByRole('checkbox', {
        name: 'Tôi xác nhận phụ huynh và gia sư đã thống nhất mức học phí này.',
      }),
    );
    await user.click(screen.getByRole('button', { name: 'Gán và kích hoạt lớp' }));
    expect(await screen.findByText(/Đã gán lớp LH-ABC123/)).toBeTruthy();
    expect(calls.find((call) => call.path.endsWith('/assign'))?.body).toEqual({
      applicationId,
      classVersion: 2,
      applicationVersion: 1,
      requestVersion: 3,
      agreedTuitionPerSessionMinor: 250_000,
      partiesAgreed: true,
    });
  });

  it('records agreed tuition for a legacy active assignment and shows the saved value', async () => {
    let lifecycle: ClassLifecycle = {
      classId,
      classStatus: 'active',
      classVersion: 3,
      requestStatus: 'assigned',
      requestVersion: 4,
      assignmentId,
      assignmentVersion: 1,
      tutorDisplayName: 'Gia sư A',
      agreedTuitionPerSessionMinor: null,
      events: [],
    };
    const { calls } = mockApi((req) => {
      if (req.path === '/me') return sessionOf({ role: 'admin' });
      if (req.path === '/admin/classes?page=1')
        return { data: { items: [adminClass], page: 1, pageSize: 12, total: 1 } };
      if (req.path === `/admin/classes/${classId}/lifecycle`) return { data: lifecycle };
      if (req.path === `/admin/assignments/${assignmentId}/tuition` && req.method === 'POST') {
        lifecycle = { ...lifecycle, agreedTuitionPerSessionMinor: 220_000, assignmentVersion: 2 };
        return { data: { id: assignmentId, agreedTuitionPerSessionMinor: 220_000 } };
      }
      return undefined;
    });
    renderRoute('/admin/classes');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Vòng đời và lịch sử' }));
    await user.click(await screen.findByRole('button', { name: 'Ghi học phí đã chốt cho lớp cũ' }));
    await user.type(screen.getByRole('spinbutton', { name: /Học phí đã chốt/ }), '220000');
    await user.click(screen.getByRole('button', { name: 'Lưu học phí đã chốt' }));
    expect(calls.some((call) => call.path.endsWith('/tuition'))).toBe(false);
    await user.click(
      screen.getByRole('checkbox', {
        name: 'Tôi xác nhận phụ huynh và gia sư đã thống nhất mức học phí này.',
      }),
    );
    await user.click(screen.getByRole('button', { name: 'Lưu học phí đã chốt' }));
    await waitFor(() => expect(screen.getByText(/Đã ghi học phí đã chốt 220\.000/)).toBeTruthy());
    expect(calls.find((call) => call.path.endsWith('/tuition'))?.body).toEqual({
      assignmentVersion: 1,
      agreedTuitionPerSessionMinor: 220_000,
      partiesAgreed: true,
    });
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Ghi học phí đã chốt cho lớp cũ' })).toBeNull(),
    );
    expect(screen.getAllByText(/220\.000/).length).toBeGreaterThanOrEqual(2);
  });

  it('shows agreed tuition only in an owner request detail', async () => {
    const ownRequest: OwnParentRequest = {
      id: 'req-1',
      code: 'YC-0001',
      subjectId: 'math',
      subjectName: 'Toán',
      grade: 'Lớp 8',
      mode: 'online',
      area: null,
      expectedBudgetMinor: 200_000,
      agreedTuitionPerSessionMinor: 230_000,
      publishedClassId: null,
      publishedClassCode: null,
      description: '',
      status: 'assigned',
      version: 4,
      schedule: { timezone: 'Asia/Ho_Chi_Minh', discussLater: true, windows: [] },
      contactPhone: '0912345678',
      contactAddress: null,
      contactConsentAt: '2026-10-11T00:00:00.000Z',
      contactConsentVersion: 'v1',
      createdAt: '2026-10-11T00:00:00.000Z',
      updatedAt: '2026-10-11T01:00:00.000Z',
    };
    mockApi((req) => {
      if (req.path === '/me') return sessionOf({ role: 'student' });
      if (req.path === '/parent/requests/req-1') return { data: ownRequest };
      return undefined;
    });
    renderRoute('/parent/requests/req-1');
    expect(await screen.findByText(/230\.000/)).toBeTruthy();
    expect(screen.getByText(/200\.000/)).toBeTruthy();
  });

  it('shows the agreed tuition to the currently assigned tutor', async () => {
    const assignment: TutorAssignment = {
      id: assignmentId,
      classId,
      classCode: 'LH-ABC123',
      applicationId,
      subjectName: 'Toán',
      grade: 'Lớp 8',
      mode: 'online',
      publicArea: null,
      agreedTuitionPerSessionMinor: 240_000,
      status: 'active',
      assignedAt: '2026-10-11T00:00:00.000Z',
    };
    mockApi((req) => {
      if (req.path === '/me') return sessionOf({ role: 'tutor' });
      if (req.path === '/tutor/assignments?page=1')
        return { data: { items: [assignment], page: 1, pageSize: 12, total: 1 } };
      if (req.path === '/tutor/assignments/history?page=1')
        return { data: { items: [], page: 1, pageSize: 12, total: 0 } };
      return undefined;
    });
    renderRoute('/tutor/classes');
    expect(await screen.findByText(/Học phí đã chốt:.*240\.000/)).toBeTruthy();
  });
});
