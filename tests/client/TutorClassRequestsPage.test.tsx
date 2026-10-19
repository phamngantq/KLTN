import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  CompletedAcceptance,
  CompletedClassDetail,
  IntroductionLetter,
  PaymentInstructions,
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
  paymentReportedAt: null,
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

function proposalItem(id: string, overrides: Partial<TutorProposalItem> = {}): TutorProposalItem {
  return {
    id,
    requestCode: `YC-${id}`,
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
    tutorRequirements: 'Ôn thi học kỳ',
    studentTraits: null,
    placementRateBasisPoints: 4000,
    placementFeeMinor: 800_000,
    applicationId: null,
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

    // Chờ duyệt: submitted message and the full class facts on the card.
    expect(
      within(pending).getByText(
        'Yêu cầu nhận lớp của bạn đã được gửi thành công. Vui lòng chờ trung tâm xem xét và phản hồi.',
      ),
    ).toBeTruthy();
    expect(within(pending).getByText('2 buổi/tuần')).toBeTruthy();
    expect(within(pending).getByText(/lúc/)).toBeTruthy();

    // Đã duyệt: "Hoàn tất nhận lớp" opens the full-body completion screen.
    expect(
      within(first).getByRole('link', { name: 'Hoàn tất nhận lớp' }).getAttribute('href'),
    ).toBe('/tutor/class-requests/hoan-tat/a3');
    expect(
      within(returning).getByRole('link', { name: 'Hoàn tất nhận lớp' }).getAttribute('href'),
    ).toBe('/tutor/class-requests/hoan-tat/a4');
    expect(calls.some((call) => call.path.includes('/contact'))).toBe(false);

    fireEvent.change(screen.getByLabelText('Trạng thái'), { target: { value: 'rejected' } });
    await waitFor(() =>
      expect(calls.some((call) => call.path.includes('status=rejected'))).toBe(true),
    );
    fireEvent.change(screen.getByLabelText('Từ khóa'), { target: { value: 'LH-a2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Tìm kiếm' }));
    await waitFor(() => expect(calls.some((call) => call.path.includes('q=LH-a2'))).toBe(true));
  });

  it('guides a first-time tutor to the centre on the completion screen', async () => {
    mockApi((req) => {
      if (req.path === '/me') return sessionOf({ role: 'tutor' });
      if (req.path === '/tutor/applications/a3')
        return { data: application('a3', 'selected', { acceptance: acceptance() }) };
      return undefined;
    });
    renderRoute('/tutor/class-requests/hoan-tat/a3');
    expect(
      await screen.findByRole('heading', { name: 'Hoàn tất nhận lớp', level: 1 }),
    ).toBeTruthy();
    expect(screen.getByText('Đến trung tâm ký hợp đồng')).toBeTruthy();
    const guide = screen.getByRole('region', { name: 'Hoàn tất nhận lớp' });
    expect(within(guide).getByText('Số 41 Khuất Duy Tiến, Thanh Xuân, Hà Nội')).toBeTruthy();
    expect(within(guide).getByText('Hướng dẫn thanh toán phí nhận lớp')).toBeTruthy();
    expect(screen.queryByRole('img', { name: /Mã VietQR/ })).toBeNull();
  });

  it('lets a returning tutor pay by VietQR, agreeing to the contract before reporting', async () => {
    const payment: PaymentInstructions = {
      assignmentId: 'as-2',
      classCode: 'LH-a4',
      firstAcceptance: false,
      amountMinor: 640_000,
      transferContent: 'PNLLHa4',
      account: {
        bankBin: '970436',
        bankName: 'Ngân hàng thử nghiệm',
        accountNumber: '0123456789',
        accountName: 'TRUNG TAM THU NGHIEM',
      },
      qrPayload:
        '00020101021238540010A00000072701240006970436011001234567890208QRIBFTTA53037045406640000',
      learnerConfirmed: true,
      contract: { id: 'ct-2', version: 1, status: 'issued' },
      reportedAt: null,
      paidAt: null,
      completed: false,
      autoConfirm: false,
    };
    let current = payment;
    const writeText = vi.fn(async () => undefined);
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
    const { calls } = mockApi((req) => {
      if (req.path === '/me') return sessionOf({ role: 'tutor' });
      if (req.path === '/tutor/applications/a4')
        return {
          data: application('a4', 'selected', {
            acceptance: acceptance({ assignmentId: 'as-2', firstAcceptance: false }),
          }),
        };
      if (req.path === '/tutor/class-requests/acceptances/as-2/payment') return { data: current };
      if (req.path === '/tutor/class-requests/acceptances/as-2/payment/report') {
        current = {
          ...payment,
          reportedAt: '2026-10-18T02:00:00.000Z',
          contract: { id: 'ct-2', version: 2, status: 'acknowledged' },
        };
        return { data: current };
      }
      return undefined;
    });
    renderRoute('/tutor/class-requests/hoan-tat/a4');
    expect(await screen.findByRole('heading', { name: 'Hướng dẫn thanh toán' })).toBeTruthy();
    // No progress checklist on the completion screen.
    expect(screen.queryByText('Trung tâm xác nhận đã nhận phí')).toBeNull();
    expect(screen.queryByText('Người học xác nhận thuê gia sư')).toBeNull();
    expect(screen.getByRole('img', { name: /Mã VietQR chuyển 640.000/ })).toBeTruthy();
    expect(screen.getAllByText('640.000 ₫').length).toBeGreaterThan(0);
    expect(screen.getByText('PNLLHa4')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Sao chép nội dung chuyển khoản' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('PNLLHa4'));

    const finish = screen.getByRole('button', { name: /Tôi đã chuyển khoản/ });
    expect((finish as HTMLButtonElement).disabled).toBe(true);
    expect(
      screen.getByText('Vui lòng tích chọn đồng ý với các điều khoản trong hợp đồng để tiếp tục.'),
    ).toBeTruthy();
    fireEvent.click(
      screen.getByLabelText('Tôi đã đọc và đồng ý với các điều khoản trong hợp đồng'),
    );
    expect((finish as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(finish);
    await waitFor(() =>
      expect(calls.find((call) => call.path.endsWith('/payment/report'))?.body).toEqual({
        contractAgreed: true,
      }),
    );
    expect(await screen.findByText('Đã ghi nhận bạn chuyển khoản phí nhận lớp')).toBeTruthy();
    // Contact stays with the centre until it confirms receipt.
    expect(calls.some((call) => call.path.includes('/contact'))).toBe(false);
  });

  it('with SePay, shows the QR after the contract agreement and confirms the payment by itself', async () => {
    const base: PaymentInstructions = {
      assignmentId: 'as-2',
      classCode: 'LH-a4',
      firstAcceptance: false,
      amountMinor: 640_000,
      transferContent: 'PNLLHa4',
      account: {
        bankBin: '970436',
        bankName: 'Ngân hàng thử nghiệm',
        accountNumber: '0123456789',
        accountName: 'TRUNG TAM THU NGHIEM',
      },
      qrPayload: '00020101021238540010A000000727',
      learnerConfirmed: true,
      contract: { id: 'ct-2', version: 1, status: 'issued' },
      reportedAt: null,
      paidAt: null,
      completed: false,
      autoConfirm: true,
    };
    let current = base;
    const { calls } = mockApi((req) => {
      if (req.path === '/me') return sessionOf({ role: 'tutor' });
      if (req.path === '/tutor/applications/a4')
        return {
          data: application('a4', 'selected', {
            acceptance: acceptance({ assignmentId: 'as-2', firstAcceptance: false }),
          }),
        };
      if (req.path === '/tutor/class-requests/acceptances/as-2/payment') return { data: current };
      if (req.path === '/tutor/class-requests/acceptances/as-2/payment/agree') {
        current = { ...base, contract: { id: 'ct-2', version: 2, status: 'acknowledged' } };
        return { data: current };
      }
      return undefined;
    });
    renderRoute('/tutor/class-requests/hoan-tat/a4');
    expect(await screen.findByRole('heading', { name: 'Hướng dẫn thanh toán' })).toBeTruthy();
    // No QR until the contract is agreed, and no manual "Tôi đã chuyển khoản".
    expect(screen.queryByRole('img', { name: /Mã VietQR/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Tôi đã chuyển khoản/ })).toBeNull();
    const show = screen.getByRole('button', { name: 'Đồng ý hợp đồng & hiện mã QR' });
    expect((show as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(
      screen.getByLabelText('Tôi đã đọc và đồng ý với các điều khoản trong hợp đồng'),
    );
    fireEvent.click(show);
    expect(await screen.findByRole('img', { name: /Mã VietQR/ })).toBeTruthy();
    expect(screen.getByText(/Đang chờ thanh toán/)).toBeTruthy();
    expect(calls.find((call) => call.path.endsWith('/payment/agree'))?.body).toEqual({
      contractAgreed: true,
    });

    // SePay reports the transfer: the next poll shows the success screen.
    current = { ...current, paidAt: '2026-10-19T03:00:00.000Z', completed: true };
    expect(
      await screen.findByRole('region', { name: 'Thanh toán thành công' }, { timeout: 8000 }),
    ).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Xem lớp đã hoàn tất' }).getAttribute('href')).toBe(
      '/tutor/class-requests?tab=hoan-tat',
    );
  }, 15_000);

  it('shows no QR and blocks reporting while the centre account is not configured', async () => {
    mockApi((req) => {
      if (req.path === '/me') return sessionOf({ role: 'tutor' });
      if (req.path === '/tutor/applications/a4')
        return {
          data: application('a4', 'selected', {
            acceptance: acceptance({ assignmentId: 'as-2', firstAcceptance: false }),
          }),
        };
      if (req.path === '/tutor/class-requests/acceptances/as-2/payment')
        return {
          data: {
            assignmentId: 'as-2',
            classCode: 'LH-a4',
            firstAcceptance: false,
            amountMinor: 640_000,
            transferContent: 'PNLLHa4',
            account: null,
            qrPayload: null,
            learnerConfirmed: true,
            contract: { id: 'ct-2', version: 1, status: 'issued' },
            reportedAt: null,
            paidAt: null,
            completed: false,
            autoConfirm: false,
          } satisfies PaymentInstructions,
        };
      return undefined;
    });
    renderRoute('/tutor/class-requests/hoan-tat/a4');
    expect(
      await screen.findByText(/chưa cấu hình tài khoản nhận thanh toán nên chưa tạo được mã QR/),
    ).toBeTruthy();
    expect(screen.queryByRole('img', { name: /Mã VietQR/ })).toBeNull();
    fireEvent.click(
      screen.getByLabelText('Tôi đã đọc và đồng ý với các điều khoản trong hợp đồng'),
    );
    expect(
      (screen.getByRole('button', { name: /Tôi đã chuyển khoản/ }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it('shows the same completion screen for a chosen proposal as for an approved class', async () => {
    const chosen = proposalItem('p3', {
      status: 'selected',
      tutorResponse: 'accepted',
      tutorRespondedAt: '2026-10-16T01:00:00.000Z',
    });
    const payment = (firstAcceptance: boolean): PaymentInstructions => ({
      assignmentId: null,
      classCode: 'YC-p3',
      firstAcceptance,
      amountMinor: 800_000,
      transferContent: 'PNLYCp3',
      account: null,
      qrPayload: null,
      learnerConfirmed: true,
      contract: null,
      reportedAt: null,
      paidAt: null,
      completed: false,
      autoConfirm: false,
    });
    let first = false;
    mockApi((req) => {
      if (req.path === '/me') return sessionOf({ role: 'tutor' });
      if (req.path === '/tutor/class-requests/proposals/p3') return { data: chosen };
      if (req.path === '/tutor/class-requests/proposals/p3/payment')
        return { data: payment(first) };
      return undefined;
    });
    const { unmount } = renderRoute('/tutor/class-requests/de-xuat/p3/hoan-tat');
    expect(
      await screen.findByRole('heading', { name: 'Hoàn tất nhận lớp', level: 1 }),
    ).toBeTruthy();
    // Returning tutor: payment guide, amount, content and contract agreement.
    expect(await screen.findByRole('heading', { name: 'Hướng dẫn thanh toán' })).toBeTruthy();
    expect(screen.getAllByText('800.000 ₫').length).toBeGreaterThan(0);
    expect(screen.getByText('PNLYCp3')).toBeTruthy();
    expect(screen.getByText('Đã từng nhận lớp')).toBeTruthy();
    expect(
      screen.getByLabelText('Tôi đã đọc và đồng ý với các điều khoản trong hợp đồng'),
    ).toBeTruthy();
    // No class contract yet: the transfer cannot be reported.
    expect(screen.getByText(/Trung tâm đang chuẩn bị hợp đồng/)).toBeTruthy();
    unmount();

    // First-time tutor: the centre guidance, as on an approved class.
    first = true;
    renderRoute('/tutor/class-requests/de-xuat/p3/hoan-tat');
    const guide = await screen.findByRole('region', { name: 'Hoàn tất nhận lớp' });
    expect(within(guide).getByText('Đến trung tâm ký hợp đồng')).toBeTruthy();
    expect(within(guide).getByText('Hướng dẫn thanh toán phí nhận lớp')).toBeTruthy();
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
    const pending = application('a1', 'submitted', {
      availability: { windows: [{ weekday: 2, startLocal: '19:30', endLocal: '21:00' }] },
    });
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
    expect(screen.getByRole('heading', { name: /Trạng thái xử lý/ })).toBeTruthy();
    expect(
      screen.getByText(
        'Yêu cầu nhận lớp của bạn đã được gửi thành công. Vui lòng chờ trung tâm xem xét và phản hồi.',
      ),
    ).toBeTruthy();
    // Free time as the Monday–Sunday matrix.
    const matrix = screen.getByRole('table', { name: /Thời gian rảnh bạn đã gửi/ });
    expect(within(matrix).getByText('CN')).toBeTruthy();
    expect(screen.queryByText('Lý do từ chối của trung tâm')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Hủy nhận lớp' }));
    const dialog = await screen.findByRole('dialog', { hidden: true });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Hủy nhận lớp', hidden: true }));
    await waitFor(() =>
      expect(calls.find((call) => call.path.endsWith('/withdraw'))?.body).toEqual({ version: 1 }),
    );
    expect(calls.some((call) => call.path.includes('/contact'))).toBe(false);
  });

  it('lists proposals with search and status filter, declining only with a reason', async () => {
    const pending = proposalItem('p1');
    const chosen = proposalItem('p3', {
      status: 'selected',
      tutorResponse: 'accepted',
      tutorRespondedAt: '2026-10-16T01:00:00.000Z',
      applicationId: 'app-9',
    });
    const accepted = proposalItem('p2', {
      subjectName: 'Toán',
      tutorResponse: 'accepted',
      tutorRespondedAt: '2026-10-16T01:00:00.000Z',
    });
    const { calls } = mockApi((req) => {
      if (req.path === '/me') return sessionOf({ role: 'tutor' });
      if (req.path.startsWith('/tutor/class-requests/proposals?'))
        return page([pending, accepted, chosen]);
      if (req.path === '/tutor/class-requests/proposals/p1/decline')
        return { data: { ...pending, tutorResponse: 'declined', tutorDeclineReason: 'Bận' } };
      return undefined;
    });
    renderRoute('/tutor/class-requests?tab=de-xuat');
    const [open, done, picked] = (await screen.findAllByRole('article')) as [
      HTMLElement,
      HTMLElement,
      HTMLElement,
    ];
    // The fit score stays internal to the centre on the tutor side.
    expect(within(open).queryByText(/Phù hợp/)).toBeNull();
    expect(within(open).getByText('Chờ phản hồi')).toBeTruthy();
    expect(within(open).getByRole('link', { name: 'Xem chi tiết' }).getAttribute('href')).toBe(
      '/tutor/class-requests/de-xuat/p1',
    );
    expect(within(open).getByRole('link', { name: 'Xác nhận nhận lớp' }).getAttribute('href')).toBe(
      '/tutor/class-requests/de-xuat/p1?xac-nhan=1',
    );
    // Actions only while the proposal waits for the tutor.
    expect(within(done).getByText('Đã xác nhận')).toBeTruthy();
    // Confirmed, learner not decided yet: wait message, no completion button.
    expect(
      within(done).getByText('Vui lòng chờ trung tâm liên hệ với người học và cập nhật kết quả.'),
    ).toBeTruthy();
    expect(within(done).queryByRole('link', { name: 'Hoàn tất nhận lớp' })).toBeNull();
    // Confirmed and chosen by the learner: completion button to the approved class.
    expect(within(picked).getByText('Đã xác nhận')).toBeTruthy();
    expect(
      within(picked).getByRole('link', { name: 'Hoàn tất nhận lớp' }).getAttribute('href'),
    ).toBe('/tutor/class-requests/hoan-tat/app-9');
    expect(within(picked).queryByText(/Vui lòng chờ trung tâm/)).toBeNull();
    expect(within(done).queryByRole('link', { name: 'Xác nhận nhận lớp' })).toBeNull();
    expect(within(done).queryByRole('button', { name: 'Từ chối nhận lớp' })).toBeNull();

    fireEvent.change(screen.getByLabelText('Trạng thái'), { target: { value: 'accepted' } });
    await waitFor(() =>
      expect(calls.some((call) => call.path.includes('status=accepted'))).toBe(true),
    );
    fireEvent.change(screen.getByLabelText('Từ khóa'), { target: { value: 'Hóa' } });
    fireEvent.click(screen.getByRole('button', { name: 'Tìm kiếm' }));
    await waitFor(() =>
      expect(calls.some((call) => call.path.includes(`q=${encodeURIComponent('Hóa')}`))).toBe(true),
    );

    fireEvent.click(within(open).getByRole('button', { name: 'Từ chối nhận lớp' }));
    const dialog = await screen.findByRole('dialog', { hidden: true });
    const send = within(dialog).getByRole('button', { name: 'Xác nhận từ chối', hidden: true });
    fireEvent.click(send);
    expect(await within(dialog).findByText('Vui lòng nhập lý do từ chối nhận lớp.')).toBeTruthy();
    expect(calls.some((call) => call.path.endsWith('/decline'))).toBe(false);
    fireEvent.change(within(dialog).getByLabelText(/Lý do từ chối nhận lớp/), {
      target: { value: 'Bận' },
    });
    fireEvent.click(send);
    await waitFor(() =>
      expect(calls.find((call) => call.path.endsWith('/decline'))?.body).toEqual({ reason: 'Bận' }),
    );
  });

  it('confirms a proposal only after the terms checkbox, showing the fee and procedure', async () => {
    let current = proposalItem('p1');
    const { calls } = mockApi((req) => {
      if (req.path === '/me') return sessionOf({ role: 'tutor' });
      if (req.path === '/tutor/class-requests/proposals/p1') return { data: current };
      if (req.path === '/tutor/class-requests/proposals/p1/accept') {
        current = {
          ...current,
          tutorResponse: 'accepted',
          tutorRespondedAt: '2026-10-18T01:00:00.000Z',
        };
        return { data: current };
      }
      return undefined;
    });
    renderRoute('/tutor/class-requests/de-xuat/p1');
    expect(await screen.findByRole('heading', { name: 'Chi tiết lớp được đề xuất' })).toBeTruthy();
    expect(screen.getByText('Ôn thi học kỳ')).toBeTruthy();
    expect(screen.getByText('Chờ phản hồi')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Xác nhận nhận lớp' }));

    const panel = await screen.findByRole('region', { name: 'Xác nhận nhận lớp' });
    expect(within(panel).getByText('800.000 ₫')).toBeTruthy();
    expect(within(panel).getByText('Số 41 Khuất Duy Tiến, Thanh Xuân, Hà Nội')).toBeTruthy();
    expect(
      within(panel).getByText(/thông tin liên hệ của phụ huynh và thư giới thiệu/),
    ).toBeTruthy();
    const confirm = within(panel).getByRole('button', { name: 'Xác nhận nhận lớp' });
    expect((confirm as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(
      within(panel).getByLabelText(
        'Tôi xác nhận đã đọc và đồng ý với Điều khoản trách nhiệm của trung tâm.',
      ),
    );
    expect((confirm as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(confirm);
    await waitFor(() =>
      expect(calls.find((call) => call.path.endsWith('/accept'))?.body).toEqual({
        termsAgreed: true,
      }),
    );
    // Status refreshes right away.
    expect(await screen.findByText('Đã xác nhận')).toBeTruthy();
    expect(await screen.findByText('Đã xác nhận nhận lớp')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Từ chối nhận lớp' })).toBeNull();
    expect(calls.some((call) => call.path.includes('/contact'))).toBe(false);
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
      if (req.path === '/tutor/class-requests/acceptances/as-9/detail')
        return {
          data: {
            assignmentId: 'as-9',
            classCode: 'LH-9',
            subjectName: 'Toán',
            grade: 'Lớp 9',
            educationLevel: 'lower_secondary',
            mode: 'offline',
            publicArea: 'Cầu Giấy',
            sessionsPerWeek: 2,
            schedule: [{ weekday: 3, startLocal: '19:30', endLocal: '21:00' }],
            expectedBudgetMinor: 200_000,
            agreedTuitionPerSessionMinor: 220_000,
            placementFeeAmountMinor: 640_000,
            tutorRequirements: 'Có kinh nghiệm ôn thi',
            studentTraits: 'Học khá',
            completedAt: '2026-10-16T01:00:00.000Z',
            contact: {
              learnerDisplayName: 'Phụ huynh B',
              studentName: 'Học sinh C',
              phone: '0912345678',
              address: 'Số 10, ngõ 5 (địa chỉ mẫu)',
            },
            letter,
          } satisfies CompletedClassDetail,
        };
      return undefined;
    });
    const { router } = renderRoute('/tutor/class-requests?tab=hoan-tat');
    const card = await screen.findByRole('article');
    expect(screen.queryByText('0912345678')).toBeNull();
    fireEvent.click(within(card).getByRole('button', { name: 'Xem liên hệ người học' }));
    expect(await within(card).findByText('0912345678')).toBeTruthy();
    const link = within(card).getByRole('link', { name: 'Thư giới thiệu' });
    expect(link.getAttribute('href')).toBe('/tutor/class-requests/as-9/thu-gioi-thieu');

    expect(within(card).getByRole('link', { name: 'Xem chi tiết' }).getAttribute('href')).toBe(
      '/tutor/class-requests/da-hoan-tat/as-9',
    );
    await router.navigate('/tutor/class-requests/da-hoan-tat/as-9');
    expect(await screen.findByRole('heading', { name: 'Chi tiết lớp đã hoàn tất' })).toBeTruthy();
    expect(screen.getByText('Thứ Tư: 19:30–21:00')).toBeTruthy();
    expect(screen.getByText('Học sinh C')).toBeTruthy();
    expect(screen.getByRole('link', { name: '0912345678' }).getAttribute('href')).toBe(
      'tel:0912345678',
    );
    expect(screen.getAllByText('Số 10, ngõ 5 (địa chỉ mẫu)').length).toBeGreaterThan(0);
    expect(screen.getByRole('heading', { name: 'Thư giới thiệu của trung tâm' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'THƯ GIỚI THIỆU GIA SƯ' })).toBeTruthy();

    await router.navigate('/tutor/class-requests/as-9/thu-gioi-thieu');
    expect(await screen.findByRole('heading', { name: 'THƯ GIỚI THIỆU GIA SƯ' })).toBeTruthy();
    expect(screen.getByText(/TGT-LH-9/)).toBeTruthy();
    expect(await screen.findByRole('button', { name: 'In / Lưu PDF' })).toBeTruthy();
  });
});
