import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  ClassRecommendation,
  FeeOptionVersion,
  PublicClass,
  TutorApplication,
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

  it('does not offer application when no fee option has been published', async () => {
    const { calls } = mockApi((req) => {
      if (req.path === '/me') return sessionOf({ role: 'tutor' });
      if (req.path === `/classes/${item.id}`) return { data: item };
      if (req.path === `/tutor/classes/${item.id}/recommendation`) return { data: recommendation };
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
      matchSnapshot: null,
    };
    const { calls } = mockApi((req) => {
      if (req.path === '/me') return sessionOf({ role: 'tutor' });
      if (req.path === `/classes/${item.id}`) return { data: item };
      if (req.path === `/tutor/classes/${item.id}/recommendation`) return { data: recommendation };
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
      if (req.path === `/tutor/classes/${item.id}/recommendation`) return { data: recommendation };
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

  it('asks for class-specific adjustment before sending a near-match application', async () => {
    const near: ClassRecommendation = {
      class: item,
      match: {
        ...recommendation.match,
        score: 72,
        level: 'near',
        adjustments: ['grade'],
        profileChangesPreview: {
          preferredGrade: item.grade,
          preferredArea: null,
          negotiableTime: false,
        },
        criteria: recommendation.match.criteria.map((criterion) =>
          criterion.key === 'grade'
            ? {
                ...criterion,
                score: 0,
                status: 'adjustable' as const,
                reason: 'Khối lớp này nằm ngoài ưu tiên đã lưu.',
              }
            : criterion,
        ),
      },
    };
    const { calls } = mockApi((req) => {
      if (req.path === '/me') return sessionOf({ role: 'tutor' });
      if (req.path === `/classes/${item.id}`) return { data: item };
      if (req.path === `/tutor/classes/${item.id}/recommendation`) return { data: near };
      if (req.path === `/tutor/fee-options?classId=${item.id}`) return { data: allFeeOptions };
      if (req.path === `/classes/${item.id}/applications` && req.method === 'POST') {
        return {
          status: 201,
          data: {
            id: 'application-1',
            matchSnapshot: {
              classVersion: item.version,
              score: 72,
              acceptedAdjustments: ['grade'],
              profileChanges: {
                preferredGrade: item.grade,
                preferredArea: null,
                negotiableTime: false,
              },
            },
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
      await screen.findByRole('heading', { name: 'Bạn có thể điều chỉnh để dạy lớp này?' }),
    ).toBeTruthy();
    expect(screen.getByText(/Dạy khối lớp này dù nằm ngoài khối lớp ưu tiên/)).toBeTruthy();
    expect(screen.getByText('Khối lớp của lớp: Lớp 8')).toBeTruthy();
    expect(screen.getByText('Hồ sơ sẽ thêm khối lớp ưu tiên: Lớp 8')).toBeTruthy();
    expect(
      screen.getByText(/Các sở thích mới cũng được dùng để gợi ý những lớp về sau/),
    ).toBeTruthy();
    expect(screen.queryByText(/hồ sơ gia sư không tự thay đổi/)).toBeNull();
    expect(calls.filter((call) => call.method === 'POST')).toHaveLength(0);

    await user.click(screen.getByRole('button', { name: 'Xem lại' }));
    expect(calls.filter((call) => call.method === 'POST')).toHaveLength(0);

    await user.click(screen.getByRole('button', { name: 'Gửi đơn ứng tuyển' }));
    await user.click(screen.getByRole('button', { name: 'Cập nhật hồ sơ và gửi đơn' }));
    expect(await screen.findByText(/Hệ thống đã ghi nhận đơn của bạn/)).toBeTruthy();
    expect(screen.getByText(/Hồ sơ giảng dạy đã được cập nhật/)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Xem hồ sơ đã cập nhật' })).toBeTruthy();
    expect(calls.find((call) => call.method === 'POST')?.body).toEqual({
      feeOptionVersionId: feeOption.id,
      classVersion: item.version,
      acceptedAdjustments: ['grade'],
    });
  });

  it('warns about a low score and records every confirmed adjustment', async () => {
    const scheduledItem: PublicClass = {
      ...item,
      schedule: {
        timezone: 'Asia/Ho_Chi_Minh',
        discussLater: false,
        windows: [
          { weekday: 2, startLocal: '18:00', endLocal: '19:30' },
          { weekday: 6, startLocal: '09:00', endLocal: '10:30' },
        ],
      },
    };
    const low: ClassRecommendation = {
      class: scheduledItem,
      match: {
        ...recommendation.match,
        score: 50,
        coverage: 100,
        level: 'low',
        adjustments: ['grade', 'area', 'schedule'],
        profileChangesPreview: {
          preferredGrade: item.grade,
          preferredArea: 'Thanh Xuân',
          negotiableTime: true,
        },
        criteria: recommendation.match.criteria.map((criterion) =>
          criterion.key === 'grade' || criterion.key === 'area' || criterion.key === 'schedule'
            ? { ...criterion, score: 0, status: 'adjustable' as const }
            : criterion,
        ),
      },
    };
    const { calls } = mockApi((req) => {
      if (req.path === '/me') return sessionOf({ role: 'tutor' });
      if (req.path === `/classes/${item.id}`) return { data: scheduledItem };
      if (req.path === `/tutor/classes/${item.id}/recommendation`) return { data: low };
      if (req.path === `/tutor/fee-options?classId=${item.id}`) return { data: allFeeOptions };
      if (req.path === `/classes/${item.id}/applications` && req.method === 'POST') {
        return {
          status: 201,
          data: {
            id: 'application-2',
            matchSnapshot: {
              classVersion: item.version,
              score: 50,
              acceptedAdjustments: ['grade', 'area', 'schedule'],
              profileChanges: {
                preferredGrade: item.grade,
                preferredArea: 'Thanh Xuân',
                negotiableTime: true,
              },
            },
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
      await screen.findByRole('heading', {
        name: 'Mức độ phù hợp thấp — hãy xem kỹ trước khi ứng tuyển',
      }),
    ).toBeTruthy();
    expect(screen.getByText(/Điểm phù hợp hiện tại là 50\/100/)).toBeTruthy();
    expect(screen.getByText(/Dạy khối lớp này dù nằm ngoài khối lớp ưu tiên/)).toBeTruthy();
    expect(screen.getByText(/Dạy tại khu vực này dù nằm ngoài khu vực ưu tiên/)).toBeTruthy();
    expect(screen.getByText('Khối lớp của lớp: Lớp 8')).toBeTruthy();
    expect(screen.getByText('Khu vực dạy của lớp: Thanh Xuân, Hà Nội')).toBeTruthy();
    expect(screen.getByText('Hồ sơ sẽ thêm khu vực ưu tiên: Thanh Xuân')).toBeTruthy();
    expect(screen.getByText(/Hồ sơ sẽ bật “Có thể thương lượng lịch học”/)).toBeTruthy();
    expect(screen.getByText(/không tự thêm các khung giờ này vào lịch rảnh định kỳ/)).toBeTruthy();
    expect(screen.getByText('Lịch lớp mong muốn (múi giờ Asia/Ho_Chi_Minh):')).toBeTruthy();
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('Thứ Ba · 18:00–19:30')).toBeTruthy();
    expect(within(dialog).getByText('Thứ Bảy · 09:00–10:30')).toBeTruthy();
    expect(calls.filter((call) => call.method === 'POST')).toHaveLength(0);

    await user.click(screen.getByRole('button', { name: 'Cập nhật hồ sơ và gửi đơn' }));
    expect(await screen.findByText(/Hệ thống đã ghi nhận đơn của bạn/)).toBeTruthy();
    expect(calls.find((call) => call.method === 'POST')?.body).toEqual({
      feeOptionVersionId: feeOption.id,
      classVersion: item.version,
      acceptedAdjustments: ['grade', 'area', 'schedule'],
    });
  });

  it('accepts a schedule mismatch without claiming an already-enabled profile flag changed', async () => {
    const scheduledItem: PublicClass = {
      ...item,
      schedule: {
        timezone: 'Asia/Ho_Chi_Minh',
        discussLater: false,
        windows: [{ weekday: 2, startLocal: '18:00', endLocal: '19:30' }],
      },
    };
    const scheduleMatch: ClassRecommendation = {
      class: scheduledItem,
      match: {
        ...recommendation.match,
        score: 85,
        coverage: 100,
        level: 'near',
        adjustments: ['schedule'],
        profileChangesPreview: {
          preferredGrade: null,
          preferredArea: null,
          negotiableTime: false,
        },
        criteria: recommendation.match.criteria.map((criterion) =>
          criterion.key === 'schedule'
            ? { ...criterion, score: 0, status: 'adjustable' as const }
            : criterion,
        ),
      },
    };
    const { calls } = mockApi((req) => {
      if (req.path === '/me') return sessionOf({ role: 'tutor' });
      if (req.path === `/classes/${item.id}`) return { data: scheduledItem };
      if (req.path === `/tutor/classes/${item.id}/recommendation`) return { data: scheduleMatch };
      if (req.path === `/tutor/fee-options?classId=${item.id}`) return { data: allFeeOptions };
      if (req.path === `/classes/${item.id}/applications` && req.method === 'POST') {
        return {
          status: 201,
          data: {
            id: 'application-schedule',
            matchSnapshot: {
              classVersion: item.version,
              score: 85,
              acceptedAdjustments: ['schedule'],
              profileChanges: {
                preferredGrade: null,
                preferredArea: null,
                negotiableTime: false,
              },
            },
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

    expect(screen.getByText(/Hồ sơ đã bật “Có thể thương lượng lịch học” từ trước/)).toBeTruthy();
    expect(screen.getByText(/vẫn chưa trùng khung giờ lớp/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Xác nhận lịch và gửi đơn' })).toBeTruthy();
    expect(calls.filter((call) => call.method === 'POST')).toHaveLength(0);

    await user.click(screen.getByRole('button', { name: 'Xác nhận lịch và gửi đơn' }));
    expect(await screen.findByText(/Hệ thống đã ghi nhận đơn của bạn/)).toBeTruthy();
    expect(screen.queryByText(/Hồ sơ giảng dạy đã được cập nhật/)).toBeNull();
    expect(calls.find((call) => call.method === 'POST')?.body).toEqual({
      feeOptionVersionId: feeOption.id,
      classVersion: item.version,
      acceptedAdjustments: ['schedule'],
    });
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
