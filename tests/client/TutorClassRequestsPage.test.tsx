import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  CompletedAcceptance,
  IntroductionLetter,
  TutorProposalItem,
} from '../../src/shared/schemas/class-requests';
import type {
  ApplicationAcceptance,
  PublicClass,
  TutorApplication,
} from '../../src/shared/schemas/classes';
import { mockApi, renderRoute, sessionOf } from './helpers';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function publicClass(id: string): PublicClass {
  return {
    id,
    code: `LH-${id}`,
    subjectId: 'subj_math',
    subjectName: 'Toán',
    grade: 'Lớp 9',
    mode: 'offline',
    publicArea: 'Cầu Giấy',
    expectedBudgetMinor: 200_000,
    status: 'active',
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
    placementFeeMinor: 640_000,
  };
}

const acceptance = (overrides: Partial<ApplicationAcceptance> = {}): ApplicationAcceptance => ({
  assignmentId: 'as-1',
  assignmentActive: true,
  firstAcceptance: true,
  learnerConfirmed: true,
  contract: null,
  placementFeeMinor: 640_000,
  placementFeePaidAt: null,
  completed: false,
  onlinePaymentReady: false,
  ...overrides,
});

function application(
  id: string,
  status: TutorApplication['status'],
  overrides: Partial<TutorApplication> = {},
): TutorApplication {
  return {
    id,
    classId: id,
    feeOptionVersionId: 'fee',
    status,
    rejectionReason: null,
    version: 1,
    createdAt: '2026-10-15T01:00:00.000Z',
    updatedAt: '2026-10-15T01:00:00.000Z',
    matchSnapshot: null,
    availability: null,
    class: publicClass(id),
    acceptance: null,
    ...overrides,
  };
}

const page = (items: unknown[]) => ({
  data: { items, total: items.length, page: 1, pageSize: 12 },
});

describe('tutor class requests page', () => {
  it('lists registered classes with search, status filter and per-status actions', async () => {
    const items = [
      application('a1', 'submitted'),
      application('a2', 'rejected', { rejectionReason: 'Lịch dạy không phù hợp.' }),
      application('a3', 'selected', { acceptance: acceptance() }),
      application('a4', 'selected', {
        acceptance: acceptance({
          assignmentId: 'as-2',
          firstAcceptance: false,
          contract: { id: 'ct-2', version: 1, status: 'acknowledged' },
        }),
      }),
    ];
    const { calls } = mockApi((req) => {
      if (req.path === '/me') return sessionOf({ role: 'tutor' });
      if (req.path.startsWith('/tutor/applications')) return page(items);
      return undefined;
    });
    renderRoute('/tutor/class-requests');

    expect(await screen.findByRole('tab', { name: 'Lớp đã đăng ký', selected: true })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Lớp được đề xuất' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Lớp đã hoàn tất' })).toBeTruthy();
    const cards = await screen.findAllByRole('article');
    expect(cards).toHaveLength(4);
    const [pending, rejected, first, returning] = cards as [
      HTMLElement,
      HTMLElement,
      HTMLElement,
      HTMLElement,
    ];

    // Only classes whose acceptance is not complete are asked for.
    expect(calls.find((call) => call.path.startsWith('/tutor/applications'))?.path).toContain(
      'stage=registered',
    );

    // Chờ duyệt: detail page + "Hủy nhận lớp".
    expect(within(pending).getByText('Chờ duyệt')).toBeTruthy();
    expect(within(pending).getByRole('link', { name: 'Xem chi tiết' }).getAttribute('href')).toBe(
      '/tutor/class-requests/chi-tiet/a1',
    );
    expect(within(pending).getByRole('button', { name: 'Hủy nhận lớp' })).toBeTruthy();
    expect(within(pending).queryByRole('button', { name: 'Hoàn tất nhận lớp' })).toBeNull();

    // Bị từ chối: detail only; the reason is on the detail page.
    expect(within(rejected).getByText('Bị từ chối')).toBeTruthy();
    expect(within(rejected).getByRole('link', { name: 'Xem chi tiết' })).toBeTruthy();
    expect(within(rejected).queryByRole('button', { name: 'Hủy nhận lớp' })).toBeNull();
    expect(within(rejected).queryByRole('button', { name: 'Hoàn tất nhận lớp' })).toBeNull();

    // Đã duyệt, lần đầu: centre guidance, no online payment.
    fireEvent.click(within(first).getByRole('button', { name: 'Hoàn tất nhận lớp' }));
    expect(within(first).getByText('Đến trung tâm ký hợp đồng')).toBeTruthy();
    expect(within(first).getByText('Số 41 Khuất Duy Tiến, Thanh Xuân, Hà Nội')).toBeTruthy();
    expect(within(first).getByText('Hướng dẫn thanh toán phí nhận lớp')).toBeTruthy();
    expect(within(first).getAllByText('640.000 ₫').length).toBeGreaterThan(0);
    expect(within(first).queryByRole('button', { name: /Thanh toán phí nhận lớp/ })).toBeNull();

    // Đã duyệt, từ lần hai: online payment, disabled until a gateway is configured.
    fireEvent.click(within(returning).getByRole('button', { name: 'Hoàn tất nhận lớp' }));
    expect(within(returning).getByText('Bạn đã xác nhận hợp đồng.')).toBeTruthy();
    const pay = within(returning).getByRole('button', { name: /Thanh toán phí nhận lớp/ });
    expect((pay as HTMLButtonElement).disabled).toBe(true);
    expect(
      within(returning).getByText(/Cổng thanh toán trực tuyến chưa được cấu hình/),
    ).toBeTruthy();
    expect(calls.some((call) => call.path.includes('/contact'))).toBe(false);

    fireEvent.change(screen.getByLabelText('Trạng thái'), { target: { value: 'rejected' } });
    await waitFor(() =>
      expect(calls.some((call) => call.path.includes('status=rejected'))).toBe(true),
    );
    fireEvent.change(screen.getByLabelText('Từ khóa'), { target: { value: 'LH-a2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Tìm kiếm' }));
    await waitFor(() => expect(calls.some((call) => call.path.includes('q=LH-a2'))).toBe(true));
  });

  it('opens a full detail page with the rejection reason and no learner contact', async () => {
    const rejected = application('a2', 'rejected', {
      rejectionReason: 'Lịch dạy không phù hợp.',
      class: {
        ...publicClass('a2'),
        tutorRequirements: 'Có kinh nghiệm ôn thi',
        studentTraits: 'Học sinh chăm',
      },
    });
    const pending = application('a1', 'submitted');
    const { calls } = mockApi((req) => {
      if (req.path === '/me') return sessionOf({ role: 'tutor' });
      if (req.path === '/tutor/applications/a2') return { data: rejected };
      if (req.path === '/tutor/applications/a1') return { data: pending };
      if (req.path === '/tutor/applications/a1/withdraw')
        return { data: { ...pending, status: 'withdrawn', version: 2 } };
      return undefined;
    });
    const { router } = renderRoute('/tutor/class-requests/chi-tiet/a2');
    expect(await screen.findByRole('heading', { name: 'Chi tiết lớp đã đăng ký' })).toBeTruthy();
    expect(screen.getByText('Lý do từ chối của trung tâm')).toBeTruthy();
    expect(screen.getByText('Lịch dạy không phù hợp.')).toBeTruthy();
    expect(screen.getByText('Có kinh nghiệm ôn thi')).toBeTruthy();
    expect(screen.getByText('Học sinh chăm')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Hủy nhận lớp' })).toBeNull();

    await router.navigate('/tutor/class-requests/chi-tiet/a1');
    expect(await screen.findByRole('button', { name: 'Hủy nhận lớp' })).toBeTruthy();
    expect(screen.queryByText('Lý do từ chối của trung tâm')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Hủy nhận lớp' }));
    const dialog = await screen.findByRole('dialog', { hidden: true });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Hủy nhận lớp', hidden: true }));
    await waitFor(() =>
      expect(calls.find((call) => call.path.endsWith('/withdraw'))?.body).toEqual({ version: 1 }),
    );
    expect(calls.some((call) => call.path.includes('/contact'))).toBe(false);
  });

  it('confirms or declines a centre proposal, requiring a reason to decline', async () => {
    const proposal: TutorProposalItem = {
      id: 'p1',
      requestCode: 'YC-1',
      subjectName: 'Hóa học',
      grade: 'Lớp 11',
      mode: 'offline',
      area: 'Đống Đa',
      expectedBudgetMinor: 250_000,
      sessionsPerWeek: 2,
      schedule: [{ weekday: 3, startLocal: '18:00', endLocal: '19:30' }],
      fitScore: 92,
      status: 'proposed',
      tutorResponse: null,
      tutorRespondedAt: null,
      tutorDeclineReason: null,
      createdAt: '2026-10-15T01:00:00.000Z',
    };
    const { calls } = mockApi((req) => {
      if (req.path === '/me') return sessionOf({ role: 'tutor' });
      if (req.path.startsWith('/tutor/class-requests/proposals?')) return page([proposal]);
      if (req.path === '/tutor/class-requests/proposals/p1/decline')
        return { data: { ...proposal, tutorResponse: 'declined', tutorDeclineReason: 'Bận' } };
      return undefined;
    });
    renderRoute('/tutor/class-requests?tab=de-xuat');
    const card = await screen.findByRole('article');
    expect(within(card).getByText('Phù hợp 92%')).toBeTruthy();
    expect(within(card).getByText('Chờ bạn phản hồi')).toBeTruthy();
    expect(within(card).getByRole('button', { name: 'Xác nhận nhận lớp' })).toBeTruthy();
    fireEvent.click(within(card).getByRole('button', { name: 'Từ chối' }));
    const dialog = await screen.findByRole('dialog', { hidden: true });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Từ chối', hidden: true }));
    expect(await within(dialog).findByText('Vui lòng nhập lý do từ chối.')).toBeTruthy();
    expect(calls.some((call) => call.path.endsWith('/decline'))).toBe(false);
    fireEvent.change(within(dialog).getByLabelText(/Lý do từ chối/), { target: { value: 'Bận' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Từ chối', hidden: true }));
    await waitFor(() =>
      expect(calls.find((call) => call.path.endsWith('/decline'))?.body).toEqual({ reason: 'Bận' }),
    );
  });

  it('shows completed classes with contact on demand and a printable letter', async () => {
    const done: CompletedAcceptance = {
      assignmentId: 'as-9',
      classId: 'c9',
      classCode: 'LH-9',
      subjectName: 'Toán',
      grade: 'Lớp 9',
      mode: 'offline',
      publicArea: 'Cầu Giấy',
      agreedTuitionPerSessionMinor: 220_000,
      placementFeeAmountMinor: 640_000,
      completedAt: '2026-10-16T01:00:00.000Z',
    };
    const letter: IntroductionLetter = {
      letterNumber: 'TGT-LH-9',
      issuedAt: '2026-10-16T01:00:00.000Z',
      tutorDisplayName: 'Gia sư A',
      classCode: 'LH-9',
      subjectName: 'Toán',
      grade: 'Lớp 9',
      mode: 'offline',
      publicArea: 'Cầu Giấy',
      sessionsPerWeek: 2,
      agreedTuitionPerSessionMinor: 220_000,
      learnerDisplayName: 'Phụ huynh B',
      learnerPhone: '0912345678',
      learnerAddress: 'Số 10',
    };
    mockApi((req) => {
      if (req.path === '/me') return sessionOf({ role: 'tutor' });
      if (req.path.startsWith('/tutor/class-requests/completed')) return page([done]);
      if (req.path === '/tutor/assignments/as-9/contact')
        return {
          data: {
            assignmentId: 'as-9',
            classId: 'c9',
            parentDisplayName: 'Phụ huynh B',
            phone: '0912345678',
            address: 'Số 10',
          },
        };
      if (req.path === '/tutor/class-requests/acceptances/as-9/letter') return { data: letter };
      return undefined;
    });
    const { router } = renderRoute('/tutor/class-requests?tab=hoan-tat');
    const card = await screen.findByRole('article');
    expect(screen.queryByText('0912345678')).toBeNull();
    fireEvent.click(within(card).getByRole('button', { name: 'Xem liên hệ người học' }));
    expect(await within(card).findByText('0912345678')).toBeTruthy();
    const link = within(card).getByRole('link', { name: 'Thư giới thiệu' });
    expect(link.getAttribute('href')).toBe('/tutor/class-requests/as-9/thu-gioi-thieu');

    await router.navigate('/tutor/class-requests/as-9/thu-gioi-thieu');
    expect(await screen.findByRole('heading', { name: 'THƯ GIỚI THIỆU GIA SƯ' })).toBeTruthy();
    expect(screen.getByText(/TGT-LH-9/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'In / Lưu PDF' })).toBeTruthy();
  });
});
