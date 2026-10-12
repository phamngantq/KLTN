import { cleanup, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AdminApplication } from '../../src/shared/schemas/admin-applications';
import { MATCH_ALGORITHM_VERSION } from '../../src/shared/schemas/classes';
import { mockApi, renderRoute, sessionOf } from './helpers';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const matched: AdminApplication = {
  id: '00000000-0000-4000-8000-000000000001',
  classId: '00000000-0000-4000-8000-000000000002',
  classCode: 'LH-0001',
  classStatus: 'open',
  classVersion: 3,
  requestVersion: 2,
  tutorUserId: 'tutor-1',
  tutorDisplayName: 'Gia sư An',
  feeOptionVersionId: '00000000-0000-4000-8000-000000000003',
  feeOptionKey: 'first_lesson_percent',
  feeOptionVersion: 1,
  feeOptionTitle: 'Theo buổi đầu',
  rejectionReason: null,
  status: 'submitted',
  version: 1,
  createdAt: '2026-10-12T00:00:00.000Z',
  updatedAt: '2026-10-12T00:00:00.000Z',
  matchSnapshot: {
    algorithmVersion: MATCH_ALGORITHM_VERSION,
    classVersion: 3,
    score: 78,
    acceptedAdjustments: ['area'],
  },
};

const legacy: AdminApplication = {
  ...matched,
  id: '00000000-0000-4000-8000-000000000004',
  classCode: 'LH-0002',
  tutorUserId: 'tutor-2',
  tutorDisplayName: 'Gia sư Bình',
  matchSnapshot: null,
};

describe('AdminApplicationsPage match snapshot', () => {
  it('shows the submission score and tutor commitment as advice, including legacy applications', async () => {
    const { calls } = mockApi((req) => {
      if (req.path === '/me') return sessionOf({ role: 'admin' });
      if (req.path === '/admin/applications?page=1') {
        return { data: { items: [matched, legacy], page: 1, pageSize: 12, total: 2 } };
      }
      return undefined;
    });
    renderRoute('/admin/applications');
    const user = userEvent.setup();

    const matchedHeading = await screen.findByRole('heading', { name: 'LH-0001 · Gia sư An' });
    const matchedCard = matchedHeading.closest('article')!;
    expect(within(matchedCard).getByText('Điểm khi ứng tuyển: 78/100')).toBeTruthy();
    expect(within(matchedCard).getByText(/Dạy tại khu vực này/)).toBeTruthy();
    expect(within(matchedCard).getByText(/người học chưa xác nhận/)).toBeTruthy();
    expect(within(matchedCard).getByText(/không tự quyết định gán lớp/)).toBeTruthy();

    const legacyHeading = screen.getByRole('heading', { name: 'LH-0002 · Gia sư Bình' });
    const legacyCard = legacyHeading.closest('article')!;
    expect(within(legacyCard).getByText(/Đơn cũ chưa lưu điểm phù hợp/)).toBeTruthy();
    expect(calls.some((call) => call.method === 'POST')).toBe(false);

    await user.click(within(matchedCard).getByRole('button', { name: 'Gán gia sư' }));
    const dialog = screen.getByRole('dialog', { name: 'Gán gia sư cho lớp' });
    expect(within(dialog).getByText('Điểm khi ứng tuyển: 78/100')).toBeTruthy();
    expect(within(dialog).getByText(/người học chưa xác nhận/)).toBeTruthy();
    await user.click(within(dialog).getByRole('button', { name: 'Gán và kích hoạt lớp' }));
    expect(within(dialog).getByText(/Nhập học phí đã chốt/)).toBeTruthy();
    expect(calls.some((call) => call.method === 'POST')).toBe(false);
  });
});
