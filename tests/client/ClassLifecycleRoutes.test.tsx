import { cleanup, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  ClassLifecycle,
  TutorAssignmentHistory,
} from '../../src/shared/schemas/admin-assignments';
import type { AdminClass } from '../../src/shared/schemas/classes';
import { mockApi, renderRoute, sessionOf } from './helpers';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const classId = '00000000-0000-4000-8000-000000000001';
const assignmentId = '00000000-0000-4000-8000-000000000002';
const item: AdminClass = {
  id: classId,
  code: 'LH-ABCDEF123456',
  sourceRequestId: '00000000-0000-4000-8000-000000000003',
  sourceRequestVersion: 2,
  parentUserId: 'parent-1',
  subjectId: 'subj_math',
  subjectName: 'Toán',
  grade: 'Lớp 10',
  mode: 'offline',
  publicArea: 'Cầu Giấy',
  expectedBudgetMinor: 200_000,
  status: 'active',
  version: 3,
  schedule: { timezone: 'Asia/Ho_Chi_Minh', discussLater: true, windows: [] },
  publishedAt: '2026-10-11T00:00:00.000Z',
  createdAt: '2026-10-11T00:00:00.000Z',
  updatedAt: '2026-10-11T00:01:00.000Z',
  sessionsPerWeek: 2,
  tutorRequirements: null,
  studentTraits: null,
  placementFeeMinor: null,
};

describe('class lifecycle routes', () => {
  it('requires a moderator reason and sends version preconditions when revoking', async () => {
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
        return { data: { items: [item], page: 1, pageSize: 12, total: 1 } };
      if (req.path === `/admin/classes/${classId}/lifecycle`) return { data: lifecycle };
      if (req.path === `/admin/classes/${classId}/revoke` && req.method === 'POST') {
        lifecycle = {
          ...lifecycle,
          classStatus: 'open',
          classVersion: 4,
          requestStatus: 'sourcing',
          requestVersion: 5,
          assignmentId: null,
          assignmentVersion: null,
          tutorDisplayName: null,
          events: [
            {
              id: 'event-1',
              classId,
              assignmentId,
              eventType: 'revoked',
              agreedTuitionPerSessionMinor: null,
              actorId: 'admin-1',
              reason: 'Gia sư đổi lịch dạy.',
              createdAt: '2026-10-11T01:00:00.000Z',
            },
          ],
        };
        return { data: lifecycle };
      }
      return undefined;
    });
    renderRoute('/admin/classes');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Vòng đời và lịch sử' }));
    await user.click(await screen.findByRole('button', { name: 'Rút gán và tuyển lại' }));
    await user.click(screen.getByRole('button', { name: 'Rút gán và mở lại' }));
    expect(calls.some((call) => call.path.endsWith('/revoke'))).toBe(false);
    await user.type(screen.getByRole('textbox', { name: 'Lý do' }), 'Gia sư đổi lịch dạy.');
    await user.click(screen.getByRole('button', { name: 'Rút gán và mở lại' }));
    await waitFor(() => expect(screen.getByText(/Đã rút gán\. Lớp mở lại/)).toBeTruthy());
    expect(calls.find((call) => call.path.endsWith('/revoke'))?.body).toEqual({
      classVersion: 3,
      requestVersion: 4,
      assignmentId,
      assignmentVersion: 1,
      reason: 'Gia sư đổi lịch dạy.',
    });
  });

  it('cancels only an open class with a recorded reason', async () => {
    let lifecycle: ClassLifecycle = {
      classId,
      classStatus: 'open',
      classVersion: 3,
      requestStatus: 'sourcing',
      requestVersion: 4,
      assignmentId: null,
      assignmentVersion: null,
      tutorDisplayName: null,
      agreedTuitionPerSessionMinor: null,
      events: [],
    };
    const { calls } = mockApi((req) => {
      if (req.path === '/me') return sessionOf({ role: 'admin' });
      if (req.path === '/admin/classes?page=1')
        return {
          data: {
            items: [{ ...item, status: 'open' }],
            page: 1,
            pageSize: 12,
            total: 1,
          },
        };
      if (req.path === `/admin/classes/${classId}/lifecycle`) return { data: lifecycle };
      if (req.path === `/admin/classes/${classId}/cancel` && req.method === 'POST') {
        lifecycle = {
          ...lifecycle,
          classStatus: 'cancelled',
          classVersion: 4,
          requestStatus: 'cancelled',
          requestVersion: 5,
          events: [
            {
              id: 'event-cancel',
              classId,
              assignmentId: null,
              eventType: 'cancelled',
              agreedTuitionPerSessionMinor: null,
              actorId: 'admin-1',
              reason: 'Người học dừng tìm gia sư.',
              createdAt: '2026-10-11T01:00:00.000Z',
            },
          ],
        };
        return { data: lifecycle };
      }
      return undefined;
    });
    renderRoute('/admin/classes');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Vòng đời và lịch sử' }));
    await user.click(await screen.findByRole('button', { name: 'Hủy lớp đang tuyển' }));
    await user.type(screen.getByRole('textbox', { name: 'Lý do' }), 'Người học dừng tìm gia sư.');
    await user.click(screen.getByRole('button', { name: 'Hủy lớp và yêu cầu' }));
    await waitFor(() => expect(screen.getByText(/Đã hủy lớp và yêu cầu nguồn/)).toBeTruthy());
    expect(calls.find((call) => call.path.endsWith('/cancel'))?.body).toEqual({
      classVersion: 3,
      requestVersion: 4,
      reason: 'Người học dừng tìm gia sư.',
    });
  });

  it('shows own ended assignments without revealing parent contact', async () => {
    const history: TutorAssignmentHistory = {
      assignmentId,
      classId,
      classCode: item.code,
      subjectName: item.subjectName,
      grade: item.grade,
      mode: item.mode,
      outcome: 'completed',
      agreedTuitionPerSessionMinor: null,
      reason: 'Hai bên đã kết thúc lớp.',
      endedAt: '2026-10-11T01:00:00.000Z',
    };
    mockApi((req) => {
      if (req.path === '/me') return sessionOf({ role: 'tutor' });
      if (req.path === '/tutor/assignments?page=1')
        return { data: { items: [], page: 1, pageSize: 12, total: 0 } };
      if (req.path === '/tutor/assignments/history?page=1')
        return { data: { items: [history], page: 1, pageSize: 12, total: 1 } };
      return undefined;
    });
    renderRoute('/tutor/classes');
    expect(await screen.findByText('Hai bên đã kết thúc lớp.', { exact: false })).toBeTruthy();
    expect(screen.getByText('Đã hoàn tất')).toBeTruthy();
    expect(screen.queryByText(/số điện thoại|địa chỉ người học/i)).toBeNull();
  });
});
