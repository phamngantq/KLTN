import { cleanup, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  FeeOptionVersion,
  PublicClass,
  TutorApplication,
} from '../../src/shared/schemas/classes';
import { anonymous, mockApi, renderRoute, sessionOf } from './helpers';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const item: PublicClass = {
  id: '00000000-0000-4000-8000-000000000001',
  code: 'CL001',
  subjectId: 'math',
  subjectName: 'Toán',
  grade: 'Lớp 8',
  mode: 'offline',
  publicArea: 'Thanh Xuân, Hà Nội',
  expectedBudgetMinor: 200_000,
  status: 'open',
  version: 2,
  schedule: { timezone: 'Asia/Ho_Chi_Minh', discussLater: true, windows: [] },
  publishedAt: '2026-10-11T00:00:00.000Z',
  createdAt: '2026-10-10T00:00:00.000Z',
};

const feeOption: FeeOptionVersion = {
  id: '00000000-0000-4000-8000-000000000002',
  optionKey: 'first_lesson_percent',
  title: 'Phương án theo buổi đầu',
  policyText: 'Mức cụ thể do kiểm duyệt viên công bố cho phiên bản này.',
  version: 1,
  rateBasisPoints: 5000,
  depositBasisPoints: null,
  scopeSubjectId: null,
  scopeMode: null,
  status: 'published',
  effectiveFrom: null,
  effectiveTo: null,
  publishedAt: '2026-10-11T00:00:00.000Z',
};
const allFeeOptions: FeeOptionVersion[] = [
  feeOption,
  {
    ...feeOption,
    id: '00000000-0000-4000-8000-000000000004',
    optionKey: 'lesson_multiplier_with_deposit',
    title: 'Theo số buổi và đặt cọc',
    rateBasisPoints: 30_000,
    depositBasisPoints: 5000,
  },
  {
    ...feeOption,
    id: '00000000-0000-4000-8000-000000000005',
    optionKey: 'monthly_percent',
    title: 'Theo học phí tháng',
    rateBasisPoints: 3000,
  },
];

describe('class routes', () => {
  it('filters the public listing through the API and shows no private contact', async () => {
    const { calls } = mockApi((req) => {
      if (req.path === '/me') return anonymous;
      if (req.path === '/subjects') return { data: [{ id: 'math', slug: 'math', name: 'Toán' }] };
      if (req.path === '/classes?subjectId=math&page=1&pageSize=12')
        return { data: { items: [item], page: 1, pageSize: 12, total: 1 } };
      return undefined;
    });
    renderRoute('/lop-hoc?subjectId=math');

    expect(await screen.findByRole('heading', { name: 'Toán · Lớp 8' })).toBeTruthy();
    expect(screen.getByText('Thanh Xuân, Hà Nội')).toBeTruthy();
    expect(screen.queryByText(/số điện thoại|địa chỉ chi tiết|tên học sinh/i)).toBeNull();
    expect(calls.some((call) => call.path.includes('subjectId=math'))).toBe(true);
  });

  it('does not offer application when no fee option has been published', async () => {
    const { calls } = mockApi((req) => {
      if (req.path === '/me') return sessionOf({ role: 'tutor' });
      if (req.path === `/classes/${item.id}`) return { data: item };
      if (req.path === `/tutor/fee-options?classId=${item.id}`) return { data: [] };
      return undefined;
    });
    renderRoute(`/tutor/new-classes/${item.id}`);

    expect(
      await screen.findByText('Chưa có đủ ba phương án phí nhận lớp được công bố cho lớp này.'),
    ).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Gửi đơn ứng tuyển' })).toBeNull();
    expect(calls.some((call) => call.method === 'POST')).toBe(false);
  });

  it('sends the selected fee version and class version, then waits for server success', async () => {
    const application: TutorApplication = {
      id: '00000000-0000-4000-8000-000000000003',
      classId: item.id,
      feeOptionVersionId: feeOption.id,
      status: 'submitted',
      rejectionReason: null,
      version: 1,
      createdAt: '2026-10-11T01:00:00.000Z',
      updatedAt: '2026-10-11T01:00:00.000Z',
      class: item,
    };
    const { calls } = mockApi((req) => {
      if (req.path === '/me') return sessionOf({ role: 'tutor' });
      if (req.path === `/classes/${item.id}`) return { data: item };
      if (req.path === `/tutor/fee-options?classId=${item.id}`) return { data: allFeeOptions };
      if (req.path === `/classes/${item.id}/applications` && req.method === 'POST')
        return { status: 201, data: application };
      return undefined;
    });
    renderRoute(`/tutor/new-classes/${item.id}`);
    const user = userEvent.setup();

    const send = (await screen.findByRole('button', {
      name: 'Gửi đơn ứng tuyển',
    })) as HTMLButtonElement;
    expect(send.disabled).toBe(true);
    await user.selectOptions(
      screen.getByRole('combobox', { name: /Phương án phí nhận lớp/ }),
      feeOption.id,
    );
    await user.click(send);

    expect(await screen.findByText(/Hệ thống đã ghi nhận đơn của bạn/)).toBeTruthy();
    const posted = calls.find((call) => call.method === 'POST');
    expect(posted?.path).toBe(`/classes/${item.id}/applications`);
    expect(posted?.body).toEqual({ feeOptionVersionId: feeOption.id, classVersion: 2 });
    expect(posted?.headers.get('Idempotency-Key')).toBeTruthy();
    expect(posted?.headers.get('X-CSRF-Token')).toBe('csrf-test-token');
    await waitFor(() => expect(screen.queryByText(/thanh toán thành công/i)).toBeNull());
  });

  it('routes a tutor to the published terms flow when the server rejects an unacknowledged application', async () => {
    const { calls } = mockApi((req) => {
      if (req.path === '/me') return sessionOf({ role: 'tutor' });
      if (req.path === `/classes/${item.id}`) return { data: item };
      if (req.path === `/tutor/fee-options?classId=${item.id}`) return { data: allFeeOptions };
      if (req.path === `/classes/${item.id}/applications` && req.method === 'POST') {
        return {
          status: 409,
          error: {
            code: 'TERMS_ACK_REQUIRED',
            message: 'Cần hoàn thành điều khoản và bài kiểm tra hiện hành.',
          },
        };
      }
      return undefined;
    });
    renderRoute(`/tutor/new-classes/${item.id}`);
    const user = userEvent.setup();
    await user.selectOptions(
      await screen.findByRole('combobox', { name: /Phương án phí nhận lớp/ }),
      feeOption.id,
    );
    await user.click(screen.getByRole('button', { name: 'Gửi đơn ứng tuyển' }));
    expect(
      await screen.findByText(/Cần hoàn thành điều khoản và bài kiểm tra hiện hành/),
    ).toBeTruthy();
    expect(
      screen
        .getByRole('link', { name: 'Hoàn thành điều khoản và bài kiểm tra' })
        .getAttribute('href'),
    ).toBe('/tutor/terms');
    expect(screen.queryByText(/Hệ thống đã ghi nhận đơn của bạn/)).toBeNull();
    expect(calls.filter((call) => call.method === 'POST')).toHaveLength(1);
  });
});
