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
    // Sessions per week, then the weekdays and the time range.
    expect(within(article).getByText('2 buổi/tuần · T3, T6 (17:00–19:00)')).toBeTruthy();
    expect(within(article).getByText('120,000đ/buổi')).toBeTruthy();
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

  it('shows class details with each weekly slot and no placement fee', async () => {
    mockApi((req) => {
      if (req.path === '/me') return sessionOf({ role: 'tutor' });
      if (req.path === `/classes/${item.id}`)
        return {
          data: {
            ...item,
            sessionsPerWeek: null,
            schedule: {
              timezone: 'Asia/Ho_Chi_Minh',
              discussLater: false,
              windows: [
                { weekday: 2, startLocal: '17:30', endLocal: '19:00' },
                { weekday: 6, startLocal: '09:00', endLocal: '10:30' },
              ],
            },
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
    expect(screen.getByText('200,000đ/buổi')).toBeTruthy();
    // Sessions come from the weekly slots when the request did not say.
    expect(screen.getByText('2 buổi/tuần')).toBeTruthy();
    expect(
      within(screen.getByRole('list', { name: 'Thời gian có thể học' }))
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual(['Thứ Ba: 17:30–19:00', 'Thứ Bảy: 09:00–10:30']);
    expect(screen.queryByText(/Phí nhận lớp/)).toBeNull();
    expect(screen.queryByText('320,000đ')).toBeNull();
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

  it('asks for the terms test, then needs the agreement tick and matrix free time', async () => {
    const monthly = allFeeOptions.find((option) => option.optionKey === 'monthly_percent')!;
    let acknowledgedAt: string | null = null;
    const quiz = () => ({
      data: {
        quizId: '00000000-0000-4000-8000-0000000000ab',
        termsContentRevisionId: '00000000-0000-4000-8000-0000000000aa',
        termsRevision: 1,
        termsTitle: 'Điều khoản trách nhiệm',
        termsBodyText: 'Nội dung điều khoản.',
        questions: [],
        minimumCorrect: 1,
        passed: acknowledgedAt !== null,
        passedAttemptId: null,
        acknowledgedAt,
      },
    });
    const { calls } = mockApi((req) => {
      if (req.path === '/me') return sessionOf({ role: 'tutor' });
      if (req.path === `/classes/${item.id}`)
        return { data: { ...item, placementFeeMinor: 640_000, sessionsPerWeek: 2 } };
      if (req.path === `/tutor/classes/${item.id}/recommendation`) return { data: recommendation };
      if (req.path === `/tutor/fee-options?classId=${item.id}`) return { data: allFeeOptions };
      if (req.path === '/tutor/terms/quiz') return quiz();
      if (req.path === '/tutor/availability')
        return {
          data: {
            timezone: 'Asia/Ho_Chi_Minh',
            rules: [
              {
                id: 'r1',
                weekday: 1,
                start: '19:30',
                end: '21:00',
                effectiveFrom: null,
                effectiveTo: null,
              },
            ],
          },
        };
      if (req.path === `/classes/${item.id}/applications`)
        return { status: 201, data: { id: 'app-1', status: 'submitted' } };
      return undefined;
    });
    const { router } = renderRoute(`/tutor/new-classes/${item.id}/nhan-lop`);
    const user = userEvent.setup();

    expect(await screen.findByRole('heading', { name: 'Nhận lớp CL001' })).toBeTruthy();
    expect(screen.getByText('640,000đ')).toBeTruthy();
    expect(screen.getByText('30% × 200,000đ × 2 buổi × 4')).toBeTruthy();
    expect(
      await screen.findByText(
        'Để nhận lớp, bạn cần hoàn thành bài test về điều khoản trách nhiệm. Bài test chỉ cần làm một lần duy nhất — các lần nhận lớp sau sẽ không cần làm lại.',
      ),
    ).toBeTruthy();
    expect(
      screen
        .getByRole('link', { name: 'Làm bài test điều khoản trách nhiệm' })
        .getAttribute('href'),
    ).toBe(`/tutor/terms?next=${encodeURIComponent(`/tutor/new-classes/${item.id}/nhan-lop`)}`);
    const send = () =>
      screen.getByRole('button', { name: 'Xác nhận nhận lớp' }) as HTMLButtonElement;
    expect(send().disabled).toBe(true);

    // After passing the test the result is saved; each acceptance still needs the tick.
    acknowledgedAt = '2026-10-16T01:00:00.000Z';
    router.navigate(`/tutor/new-classes/${item.id}`);
    await screen.findByRole('heading', { name: 'Chi tiết lớp học' });
    await user.click(screen.getByRole('link', { name: 'Nhận lớp' }));
    expect(
      await screen.findByText('Bạn đã hoàn thành bài test điều khoản trách nhiệm.'),
    ).toBeTruthy();
    expect(send().disabled).toBe(true);
    // The matrix starts from the tutor's saved grid.
    const saved = screen.getByRole('button', { name: 'Thứ Hai, 19:30–21:00' });
    expect(saved.getAttribute('aria-pressed')).toBe('true');
    await user.click(saved);
    await user.click(
      screen.getByRole('checkbox', {
        name: 'Tôi xác nhận đã đọc và đồng ý với Điều khoản trách nhiệm của trung tâm',
      }),
    );
    expect(send().disabled).toBe(false);
    await user.click(send());
    expect(screen.getByRole('alert').textContent).toBe(
      'Chọn ít nhất một khung giờ có thể dạy trong bảng.',
    );
    await user.click(screen.getByRole('button', { name: 'Thứ Ba, 17:30–19:00' }));
    await user.click(screen.getByRole('button', { name: 'Thứ Sáu, 17:30–19:00' }));
    await user.click(send());

    expect(await screen.findByText('Đã gửi yêu cầu nhận lớp')).toBeTruthy();
    const post = calls.find((call) => call.path === `/classes/${item.id}/applications`);
    expect(post?.body).toEqual({
      feeOptionVersionId: monthly.id,
      classVersion: item.version,
      termsAgreed: true,
      availability: {
        windows: [
          { weekday: 2, startLocal: '17:30', endLocal: '19:00' },
          { weekday: 5, startLocal: '17:30', endLocal: '19:00' },
        ],
      },
    });
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
      if (req.path === '/tutor/availability')
        return { data: { timezone: 'Asia/Ho_Chi_Minh', rules: [] } };
      if (req.path === '/tutor/terms/quiz')
        return {
          data: {
            quizId: '00000000-0000-4000-8000-0000000000ab',
            termsContentRevisionId: '00000000-0000-4000-8000-0000000000aa',
            termsRevision: 1,
            termsTitle: 'Điều khoản',
            termsBodyText: 'Nội dung.',
            questions: [],
            minimumCorrect: 1,
            passed: true,
            passedAttemptId: null,
            acknowledgedAt: '2026-10-16T01:00:00.000Z',
          },
        };
      if (req.path === `/classes/${item.id}/applications`)
        return { status: 201, data: { id: 'app-1', status: 'submitted' } };
      return undefined;
    });
    renderRoute(`/tutor/new-classes/${item.id}/nhan-lop`);
    const user = userEvent.setup();
    await screen.findByText('Bạn đã hoàn thành bài test điều khoản trách nhiệm.');
    await user.click(screen.getByRole('button', { name: 'Thứ Hai, 09:00–10:30' }));
    await user.click(screen.getByRole('checkbox', { name: /Tôi xác nhận đã đọc và đồng ý/ }));
    await user.click(screen.getByRole('button', { name: 'Xác nhận nhận lớp' }));
    expect(calls.some((call) => call.path.endsWith('/applications'))).toBe(false);
    const dialog = screen.getByRole('dialog', { name: 'Xác nhận điều chỉnh để nhận lớp' });
    await user.click(within(dialog).getByRole('button', { name: 'Xác nhận và gửi' }));
    await waitFor(() =>
      expect(calls.find((call) => call.path.endsWith('/applications'))?.body).toMatchObject({
        acceptedAdjustments: ['grade'],
        termsAgreed: true,
      }),
    );
  });

  it('always shows fee information and blocks acceptance without a published fee', async () => {
    mockApi((req) => {
      if (req.path === '/me') return sessionOf({ role: 'tutor' });
      if (req.path === `/classes/${item.id}`)
        return { data: { ...item, expectedBudgetMinor: null, placementFeeMinor: null } };
      if (req.path === `/tutor/classes/${item.id}/recommendation`) return { data: recommendation };
      if (req.path === `/tutor/fee-options?classId=${item.id}`) return { data: [feeOption] };
      if (req.path === '/tutor/availability')
        return { data: { timezone: 'Asia/Ho_Chi_Minh', rules: [] } };
      if (req.path === '/tutor/terms/quiz')
        return {
          status: 409,
          error: { code: 'TERMS_QUIZ_UNAVAILABLE', message: 'Chưa có bài test.' },
        };
      return undefined;
    });
    renderRoute(`/tutor/new-classes/${item.id}/nhan-lop`);
    expect(await screen.findByText('Chưa có phí nhận lớp được công bố cho lớp này.')).toBeTruthy();
    // Without a budget the fee still reads as its rule, never blank.
    expect(screen.getByText('40% học phí một tháng')).toBeTruthy();
    expect(
      (screen.getByRole('button', { name: 'Xác nhận nhận lớp' }) as HTMLButtonElement).disabled,
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
