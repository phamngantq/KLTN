import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  ClassRecommendation,
  FeeOptionVersion,
  PublicClass,
} from '../../src/shared/schemas/classes';
import { ApplicationMatchSummary } from '../../src/client/components/domain/MatchExplanation';
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
  sessionsPerWeek: 2,
  tutorRequirements: null,
  studentTraits: null,
  placementFeeMinor: null,
};

const recommendation: ClassRecommendation = {
  class: item,
  match: {
    algorithmVersion: '2026-10-12-v1',
    score: 92,
    coverage: 85,
    level: 'strong',
    adjustments: [],
    profileChangesPreview: {
      preferredGrade: null,
      preferredArea: null,
      negotiableTime: false,
    },
    criteria: [
      { key: 'subject', score: 30, maxScore: 30, status: 'match', reason: 'Đúng môn dạy.' },
      { key: 'mode', score: 20, maxScore: 20, status: 'match', reason: 'Có thể dạy trực tiếp.' },
      { key: 'grade', score: 20, maxScore: 20, status: 'match', reason: 'Đúng khối lớp.' },
      { key: 'area', score: 15, maxScore: 15, status: 'match', reason: 'Đúng khu vực.' },
      { key: 'schedule', score: 7, maxScore: 15, status: 'unknown', reason: 'Chưa chốt lịch.' },
      { key: 'budget', score: 0, maxScore: 0, status: 'unknown', reason: 'Chưa so sánh học phí.' },
    ],
  },
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

  it('lists new classes as cards like the design and filters on the server', async () => {
    const card: PublicClass = {
      ...item,
      subjectName: 'Tiếng Anh',
      grade: 'Lớp 7',
      sessionsPerWeek: 2,
      publishedAt: new Date().toISOString(),
      schedule: {
        timezone: 'Asia/Ho_Chi_Minh',
        discussLater: false,
        windows: [
          { weekday: 2, startLocal: '17:00', endLocal: '19:00' },
          { weekday: 5, startLocal: '17:00', endLocal: '19:00' },
        ],
      },
      expectedBudgetMinor: 120_000,
      placementFeeMinor: 384_000,
      studentTraits: 'Học sinh năng động, thích học qua trò chơi',
    };
    const { calls } = mockApi((req) => {
      if (req.path === '/me') return sessionOf({ role: 'tutor' });
      if (req.path === '/subjects') return { data: [{ id: 'math', slug: 'toan', name: 'Toán' }] };
      if (req.path.startsWith('/classes?'))
        return { data: { items: [card], page: 1, pageSize: 12, total: 6 } };
      return undefined;
    });
    renderRoute('/tutor/new-classes');
    const user = userEvent.setup();

    expect(await screen.findByRole('heading', { name: 'Danh sách lớp mới' })).toBeTruthy();
    expect(
      await screen.findByText(
        (_, element) => element?.tagName === 'P' && element.textContent === 'Tìm thấy 6 lớp học',
      ),
    ).toBeTruthy();
    const article = screen.getByRole('heading', { name: 'Tiếng Anh - Lớp 7' }).closest('article')!;
    expect(within(article).getByText('Mới')).toBeTruthy();
    expect(within(article).getByText('Thanh Xuân, Hà Nội')).toBeTruthy();
    expect(within(article).getByText('2 buổi/tuần, chiều 17h-19h')).toBeTruthy();
    expect(within(article).getByText('120,000đ/buổi')).toBeTruthy();
    expect(within(article).getByText('Phí nhận lớp: 384,000đ')).toBeTruthy();
    expect(within(article).getByText('Offline')).toBeTruthy();
    expect(within(article).getByText(card.studentTraits!)).toBeTruthy();
    expect(
      within(article)
        .getByRole('link', { name: `Xem chi tiết lớp ${card.code}` })
        .getAttribute('href'),
    ).toBe(`/tutor/new-classes/${card.id}`);

    await user.type(screen.getByRole('searchbox', { name: 'Từ khóa' }), 'Tiếng Anh');
    await user.selectOptions(screen.getByLabelText('Môn học'), 'math');
    await user.selectOptions(screen.getByLabelText('Khu vực'), 'Thanh Xuân');
    await user.selectOptions(screen.getByLabelText('Hình thức dạy'), 'offline');
    await user.click(screen.getByRole('button', { name: 'Lọc' }));
    await waitFor(() =>
      expect(
        calls.some(
          (call) =>
            call.path.includes('q=Ti%E1%BA%BFng+Anh') &&
            call.path.includes('subjectId=math') &&
            call.path.includes('area=Thanh+Xu%C3%A2n') &&
            call.path.includes('mode=offline'),
        ),
      ).toBe(true),
    );
  }, 30_000);

  it('shows class details with requirements and a "Nhận lớp" button', async () => {
    mockApi((req) => {
      if (req.path === '/me') return sessionOf({ role: 'tutor' });
      if (req.path === `/classes/${item.id}`)
        return {
          data: {
            ...item,
            placementFeeMinor: 320_000,
            studentTraits: 'Học sinh chăm chỉ',
            tutorRequirements: 'Sinh viên ngoại ngữ\nGiao tiếp tốt; Kiên nhẫn với trẻ',
          },
        };
      return undefined;
    });
    renderRoute(`/tutor/new-classes/${item.id}`);
    expect(await screen.findByRole('heading', { name: 'Chi tiết lớp học' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Toán – Lớp 8' })).toBeTruthy();
    expect(screen.getByText(/Mã lớp: CL001/)).toBeTruthy();
    expect(screen.getByText('200,000đ/buổi')).toBeTruthy();
    expect(screen.getByText('320,000đ')).toBeTruthy();
    expect(screen.getByText('Học sinh chăm chỉ')).toBeTruthy();
    const requirements = screen.getByRole('region', { name: 'Yêu cầu gia sư' });
    expect(
      within(requirements)
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual(['Sinh viên ngoại ngữ', 'Giao tiếp tốt', 'Kiên nhẫn với trẻ']);
    expect(screen.getByRole('link', { name: 'Nhận lớp' }).getAttribute('href')).toBe(
      `/tutor/new-classes/${item.id}/nhan-lop`,
    );
  });

  it('asks for terms first, then sends the monthly fee, class version and free time', async () => {
    const monthly = allFeeOptions.find((option) => option.optionKey === 'monthly_percent')!;
    let accepted: string | null = null;
    const { calls } = mockApi((req) => {
      if (req.path === '/me') return sessionOf({ role: 'tutor' });
      if (req.path === `/classes/${item.id}`)
        return { data: { ...item, placementFeeMinor: 240_000 } };
      if (req.path === `/tutor/classes/${item.id}/recommendation`) return { data: recommendation };
      if (req.path === `/tutor/fee-options?classId=${item.id}`) return { data: allFeeOptions };
      if (req.path === '/tutor/terms')
        return {
          data: {
            termsContentRevisionId: '00000000-0000-4000-8000-0000000000aa',
            termsRevision: 1,
            termsTitle: 'Điều khoản trách nhiệm',
            termsBodyText: 'Nội dung điều khoản.',
            acceptedAt: accepted,
          },
        };
      if (req.path === `/classes/${item.id}/applications`)
        return { status: 201, data: { id: 'app-1', status: 'submitted' } };
      return undefined;
    });
    const { router } = renderRoute(`/tutor/new-classes/${item.id}/nhan-lop`);
    const user = userEvent.setup();

    expect(await screen.findByRole('heading', { name: 'Nhận lớp CL001' })).toBeTruthy();
    expect(screen.getByText('240,000đ')).toBeTruthy();
    expect(screen.getByText('200,000đ/buổi')).toBeTruthy();
    expect(
      screen.getByText('Số 41 Khuất Duy Tiến, Thanh Xuân, Hà Nội', { selector: 'strong' }),
    ).toBeTruthy();
    const testLink = await screen.findByRole('link', {
      name: 'Làm bài test điều khoản trách nhiệm',
    });
    expect(testLink.getAttribute('href')).toBe(
      `/tutor/terms?next=${encodeURIComponent(`/tutor/new-classes/${item.id}/nhan-lop`)}`,
    );
    const send = screen.getByRole('button', { name: 'Gửi yêu cầu nhận lớp' }) as HTMLButtonElement;
    expect(send.disabled).toBe(true);

    // After the checkbox on the terms page, the step shows as done.
    accepted = '2026-10-16T01:00:00.000Z';
    router.navigate(`/tutor/new-classes/${item.id}`);
    await screen.findByRole('heading', { name: 'Chi tiết lớp học' });
    await user.click(screen.getByRole('link', { name: 'Nhận lớp' }));
    await screen.findByRole('heading', { name: 'Nhận lớp CL001' });
    await waitFor(() =>
      expect(screen.getByText('Đã xác nhận Điều khoản trách nhiệm')).toBeTruthy(),
    );

    await user.click(screen.getByRole('button', { name: 'Gửi yêu cầu nhận lớp' }));
    expect(screen.getByRole('alert').textContent).toBe('Chọn ít nhất một ngày trong tuần.');
    await user.click(screen.getByRole('button', { name: 'T3' }));
    await user.click(screen.getByRole('button', { name: 'T6' }));
    expect(screen.getByRole('button', { name: 'T3' }).getAttribute('aria-pressed')).toBe('true');
    await user.type(screen.getByLabelText(/Giờ bắt đầu/), '19:00');
    await user.type(screen.getByLabelText(/Giờ kết thúc/), '18:00');
    await user.click(screen.getByRole('button', { name: 'Gửi yêu cầu nhận lớp' }));
    expect(screen.getByRole('alert').textContent).toBe('Giờ kết thúc phải sau giờ bắt đầu.');
    await user.clear(screen.getByLabelText(/Giờ kết thúc/));
    await user.type(screen.getByLabelText(/Giờ kết thúc/), '21:00');
    await user.click(screen.getByRole('button', { name: 'Gửi yêu cầu nhận lớp' }));

    expect(await screen.findByText('Đã gửi yêu cầu nhận lớp')).toBeTruthy();
    const post = calls.find((call) => call.path === `/classes/${item.id}/applications`);
    expect(post?.body).toEqual({
      feeOptionVersionId: monthly.id,
      classVersion: item.version,
      availability: { weekdays: [2, 5], start: '19:00', end: '21:00' },
    });
    expect(post?.headers.get('Idempotency-Key')).toBeTruthy();
  }, 30_000);

  it('confirms profile adjustments before sending a near-match acceptance', async () => {
    const near: ClassRecommendation = {
      ...recommendation,
      match: { ...recommendation.match, level: 'near', adjustments: ['grade'] },
    };
    const { calls } = mockApi((req) => {
      if (req.path === '/me') return sessionOf({ role: 'tutor' });
      if (req.path === `/classes/${item.id}`) return { data: item };
      if (req.path === `/tutor/classes/${item.id}/recommendation`) return { data: near };
      if (req.path === `/tutor/fee-options?classId=${item.id}`) return { data: allFeeOptions };
      if (req.path === '/tutor/terms')
        return {
          data: {
            termsContentRevisionId: '00000000-0000-4000-8000-0000000000aa',
            termsRevision: 1,
            termsTitle: 'Điều khoản',
            termsBodyText: 'Nội dung.',
            acceptedAt: '2026-10-16T01:00:00.000Z',
          },
        };
      if (req.path === `/classes/${item.id}/applications`)
        return { status: 201, data: { id: 'app-1', status: 'submitted' } };
      return undefined;
    });
    renderRoute(`/tutor/new-classes/${item.id}/nhan-lop`);
    const user = userEvent.setup();
    await screen.findByText('Đã xác nhận Điều khoản trách nhiệm');
    await user.click(screen.getByRole('button', { name: 'T2' }));
    await user.type(screen.getByLabelText(/Giờ bắt đầu/), '08:00');
    await user.type(screen.getByLabelText(/Giờ kết thúc/), '10:00');
    await user.click(screen.getByRole('button', { name: 'Gửi yêu cầu nhận lớp' }));
    expect(calls.some((call) => call.path.endsWith('/applications'))).toBe(false);
    const dialog = screen.getByRole('dialog', { name: 'Xác nhận điều chỉnh để nhận lớp' });
    await user.click(within(dialog).getByRole('button', { name: 'Xác nhận và gửi' }));
    await waitFor(() =>
      expect(calls.find((call) => call.path.endsWith('/applications'))?.body).toMatchObject({
        acceptedAdjustments: ['grade'],
      }),
    );
  });

  it('blocks acceptance when no placement fee is published', async () => {
    mockApi((req) => {
      if (req.path === '/me') return sessionOf({ role: 'tutor' });
      if (req.path === `/classes/${item.id}`) return { data: item };
      if (req.path === `/tutor/classes/${item.id}/recommendation`) return { data: recommendation };
      if (req.path === `/tutor/fee-options?classId=${item.id}`) return { data: [feeOption] };
      if (req.path === '/tutor/terms')
        return {
          status: 409,
          error: { code: 'TERMS_UNAVAILABLE', message: 'Chưa có điều khoản.' },
        };
      return undefined;
    });
    renderRoute(`/tutor/new-classes/${item.id}/nhan-lop`);
    expect(await screen.findByText('Chưa có phí nhận lớp được công bố cho lớp này.')).toBeTruthy();
    expect(
      (screen.getByRole('button', { name: 'Gửi yêu cầu nhận lớp' }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it('shows a scored recommendation with reasons and missing-data coverage', async () => {
    const { calls } = mockApi((req) => {
      if (req.path === '/me') return sessionOf({ role: 'tutor' });
      if (req.path === '/tutor/classes/recommendations?page=1&pageSize=12') {
        return { data: { items: [recommendation], page: 1, pageSize: 12, total: 1 } };
      }
      return undefined;
    });
    renderRoute('/tutor/matched-classes');

    expect(await screen.findByText('Phù hợp 92/100')).toBeTruthy();
    expect(screen.getByText(/Đã đánh giá 85% tiêu chí/)).toBeTruthy();
    await userEvent.setup().click(screen.getByText('Xem cách tính điểm'));
    expect(screen.getByText('Chưa chốt lịch.')).toBeTruthy();
    expect(calls.some((call) => call.path.startsWith('/tutor/classes/matched'))).toBe(false);
  });

  it('shows exact saved profile changes and schedule consent in an application snapshot', () => {
    render(
      <ApplicationMatchSummary
        snapshot={{
          algorithmVersion: '2026-10-12-v1',
          classVersion: 2,
          score: 72,
          acceptedAdjustments: ['grade', 'schedule'],
          profileChanges: {
            preferredGrade: 'Lớp 8',
            preferredArea: null,
            negotiableTime: false,
          },
        }}
      />,
    );
    expect(screen.getByText('Thêm khối lớp ưu tiên: Lớp 8')).toBeTruthy();
    expect(screen.getByText(/Hồ sơ đã bật thương lượng lịch học từ trước/)).toBeTruthy();
  });

  it('shows the exact saved area and newly enabled schedule preference', () => {
    render(
      <ApplicationMatchSummary
        snapshot={{
          algorithmVersion: '2026-10-12-v1',
          classVersion: 2,
          score: 50,
          acceptedAdjustments: ['area', 'schedule'],
          profileChanges: {
            preferredGrade: null,
            preferredArea: 'Thanh Xuân',
            negotiableTime: true,
          },
        }}
      />,
    );
    expect(screen.getByText('Thêm khu vực ưu tiên: Thanh Xuân')).toBeTruthy();
    expect(screen.getByText('Bật khả năng thương lượng lịch học')).toBeTruthy();
  });

  it('keeps a readable adjustment summary for old application snapshots', () => {
    render(
      <ApplicationMatchSummary
        snapshot={{
          algorithmVersion: '2026-10-12-v1',
          classVersion: 2,
          score: 72,
          acceptedAdjustments: ['grade'],
        }}
      />,
    );
    expect(screen.getByText(/Gia sư đã xác nhận điều chỉnh khi ứng tuyển/)).toBeTruthy();
    expect(screen.getByText(/Dạy khối lớp này dù nằm ngoài khối lớp ưu tiên/)).toBeTruthy();
  });
});
