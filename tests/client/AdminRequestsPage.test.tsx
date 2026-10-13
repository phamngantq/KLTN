import { cleanup, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  AdminRequestDetail,
  AdminRequestSummary,
} from '../../src/shared/schemas/admin-requests';
import type { AdminClass } from '../../src/shared/schemas/classes';
import { mockApi, renderRoute, sessionOf } from './helpers';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const request: AdminRequestSummary = {
  id: '00000000-0000-4000-8000-000000000001',
  code: 'YC-000000000001',
  subjectId: 'subj_math',
  subjectName: 'Toán',
  grade: 'Lớp 10',
  mode: 'offline',
  area: 'Cầu Giấy, Hà Nội',
  expectedBudgetMinor: 250_000,
  description: 'Cần gia sư buổi tối.',
  educationLevel: 'upper_secondary',
  sessionsPerWeek: 3,
  tutorRequirements: 'Có kinh nghiệm luyện thi.',
  studentTraits: '',
  status: 'submitted',
  version: 2,
  schedule: { timezone: 'Asia/Ho_Chi_Minh', discussLater: true, windows: [] },
  createdAt: '2026-10-11T00:00:00.000Z',
  updatedAt: '2026-10-11T01:00:00.000Z',
};
const detail: AdminRequestDetail = {
  ...request,
  agreedTuitionPerSessionMinor: null,
  publishedClassId: null,
  publishedClassCode: null,
  parentUserId: 'parent-1',
  parentDisplayName: 'Người học thử',
  studentName: 'Học sinh thử',
  contactPhone: '0912345678',
  contactAddress: 'Số 10, đường thử nghiệm',
  contactConsentAt: '2026-10-11T01:00:00.000Z',
  contactConsentVersion: '2026-10-11-v1',
  stage: 'searching',
  tutor: null,
};
const createdClass: AdminClass = {
  id: '00000000-0000-4000-8000-000000000002',
  code: 'LH-000000000001',
  sourceRequestId: request.id,
  sourceRequestVersion: request.version,
  parentUserId: detail.parentUserId,
  subjectId: request.subjectId,
  subjectName: request.subjectName,
  grade: request.grade,
  mode: request.mode,
  publicArea: 'Cầu Giấy',
  expectedBudgetMinor: request.expectedBudgetMinor,
  status: 'draft',
  version: 1,
  schedule: request.schedule,
  publishedAt: null,
  createdAt: '2026-10-11T01:00:00.000Z',
  updatedAt: '2026-10-11T01:00:00.000Z',
};

describe('AdminRequestsPage', () => {
  it('loads contact only after opening detail, then creates a class from the versioned request', async () => {
    const { calls } = mockApi((req) => {
      if (req.path === '/me') return sessionOf({ role: 'admin' });
      if (req.path === '/admin/requests?page=1')
        return { data: { items: [request], page: 1, pageSize: 12, total: 1 } };
      if (req.path === `/admin/requests/${request.id}`) return { data: detail };
      if (req.path === '/admin/classes' && req.method === 'POST')
        return { status: 201, data: createdClass };
      return undefined;
    });
    const { router } = renderRoute('/admin/requests');
    const user = userEvent.setup();

    expect(await screen.findByText(/YC-000000000001/)).toBeTruthy();
    expect(screen.queryByText(/0912345678/)).toBeNull();
    expect(calls.some((call) => call.path === `/admin/requests/${request.id}`)).toBe(false);
    await user.click(screen.getByRole('button', { name: 'Xem chi tiết' }));
    expect(await screen.findByText(/0912345678/)).toBeTruthy();
    expect(router.state.location.search).toContain(`selected=${request.id}`);

    await user.click(screen.getByRole('button', { name: 'Tạo lớp từ yêu cầu' }));
    await user.type(await screen.findByLabelText(/Khu vực công khai/), 'Cầu Giấy');
    await user.click(screen.getByRole('button', { name: 'Tạo lớp' }));
    expect(await screen.findByText(/Đã tạo bản nháp lớp LH-000000000001/)).toBeTruthy();
    await waitFor(() =>
      expect(
        calls.find((call) => call.path === '/admin/classes' && call.method === 'POST')?.body,
      ).toEqual({
        sourceRequestId: request.id,
        requestVersion: request.version,
        publicArea: 'Cầu Giấy',
      }),
    );
  });
});
