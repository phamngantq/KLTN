import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { WeeklyAvailability } from '../../src/shared/schemas/availability';
import type { TutorProfile } from '../../src/shared/schemas/tutors';
import { mockApi, renderRoute, sessionOf } from './helpers';

type Handler = Parameters<typeof mockApi>[0];

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const SUBJECTS = [
  { id: 'subj_english', slug: 'tieng-anh', name: 'Tiếng Anh' },
  { id: 'subj_math', slug: 'toan', name: 'Toán' },
];

function profile(overrides: Partial<TutorProfile> = {}): TutorProfile {
  return {
    userId: 'u1',
    slug: 'nguyen-an-abc123',
    displayName: 'Nguyễn An',
    bio: 'Giới thiệu',
    hourlyRateMinor: 200_000,
    currency: 'VND',
    teachesOnline: true,
    teachesOffline: false,
    preferredGrades: [],
    preferredAreas: [],
    negotiableTime: false,
    subjects: [SUBJECTS[1]!],
    approvalStatus: 'draft',
    visibility: 'private',
    moderationNote: null,
    missing: [],
    tutorType: null,
    school: null,
    specialization: null,
    experienceYears: null,
    experienceSummary: null,
    hasPhoto: false,
    customOptions: [],
    ...overrides,
  };
}

const EMPTY_WEEK: WeeklyAvailability = { timezone: 'Asia/Ho_Chi_Minh', rules: [] };

/** Profile, subjects and availability for a tutor session; `extra` handles the rest. */
function mockProfile(
  current: () => TutorProfile | null,
  extra: Handler = () => undefined,
  week: () => WeeklyAvailability = () => EMPTY_WEEK,
) {
  return mockApi((req) => {
    if (req.path === '/me') return sessionOf({ role: 'tutor' });
    if (req.path === '/subjects') return { data: SUBJECTS };
    if (req.path === '/tutor/profile' && req.method === 'GET') return { data: current() };
    if (req.path === '/tutor/availability' && req.method === 'GET') return { data: week() };
    return extra(req);
  });
}

describe('TutorProfilePage — Thông tin cơ bản', () => {
  it('loads the profile, saves edits and shows server-confirmed state', async () => {
    let current = profile({ missing: ['hourlyRate'], hourlyRateMinor: null });
    const { calls } = mockProfile(
      () => current,
      (req) => {
        if (req.path === '/tutor/profile' && req.method === 'PATCH') {
          current = profile({ hourlyRateMinor: 300_000 });
          return { data: current };
        }
        return undefined;
      },
    );
    renderRoute('/tutor/profile');
    const user = userEvent.setup();

    expect(await screen.findByRole('heading', { name: 'Hồ sơ gia sư' })).toBeTruthy();
    expect(
      screen.getByRole('tab', { name: 'Thông tin cơ bản' }).getAttribute('aria-selected'),
    ).toBe('true');
    expect(screen.getByText('Ảnh đại diện')).toBeTruthy();
    expect(screen.getByText('Bản nháp')).toBeTruthy();
    expect(screen.getByText(/Còn thiếu: Học phí theo giờ/)).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Gửi duyệt' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    expect((screen.getByRole('button', { name: 'Lưu hồ sơ' }) as HTMLButtonElement).disabled).toBe(
      true,
    );

    await user.type(screen.getByLabelText(/Học phí/), '300000');
    expect(screen.getAllByText('Có thay đổi chưa lưu').length).toBeGreaterThan(0);
    await user.click(screen.getByRole('button', { name: 'Lưu hồ sơ' }));

    expect((await screen.findAllByText('Đã lưu thay đổi.')).length).toBeGreaterThan(0);
    const body = calls.find((c) => c.method === 'PATCH')?.body as Record<string, unknown>;
    expect(body).toMatchObject({ hourlyRateMinor: 300_000, subjectIds: ['subj_math'] });
    expect(body).not.toHaveProperty('approvalStatus');
    // Nothing in the schedule changed, so availability is not rewritten.
    expect(calls.some((c) => c.method === 'PUT')).toBe(false);
    await waitFor(() =>
      expect(
        (screen.getByRole('button', { name: 'Gửi duyệt' }) as HTMLButtonElement).disabled,
      ).toBe(false),
    );
  });

  it('renders server field errors next to the field', async () => {
    mockProfile(
      () => null,
      (req) =>
        req.method === 'PATCH'
          ? {
              status: 422,
              error: {
                code: 'VALIDATION_ERROR',
                message: 'Dữ liệu không hợp lệ.',
                details: [
                  { path: 'hourlyRateMinor', message: 'Học phí phải là bội số của 1.000 ₫.' },
                ],
              },
            }
          : undefined,
    );
    renderRoute('/tutor/profile');
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText(/Học phí/), '250500');
    await user.click(screen.getByRole('button', { name: 'Lưu hồ sơ' }));
    expect(await screen.findByText('Học phí phải là bội số của 1.000 ₫.')).toBeTruthy();
    expect(screen.getByLabelText(/Học phí/).getAttribute('aria-invalid')).toBe('true');
  });

  it('submits a complete profile for review', async () => {
    mockProfile(
      () => profile(),
      (req) =>
        req.path === '/tutor/profile/submit'
          ? { data: profile({ approvalStatus: 'pending' }) }
          : undefined,
    );
    renderRoute('/tutor/profile');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Gửi duyệt' }));
    expect(await screen.findByText('Đã gửi hồ sơ để duyệt.')).toBeTruthy();
    expect(screen.getByText('Chờ duyệt')).toBeTruthy();
  });

  it('is forbidden for students', async () => {
    mockApi((req) => (req.path === '/me' ? sessionOf({ role: 'student' }) : undefined));
    renderRoute('/tutor/profile');
    expect(await screen.findByText('Bạn không có quyền truy cập trang này')).toBeTruthy();
  });
});

describe('TutorProfilePage — Đăng ký lớp học phù hợp', () => {
  it('selects tiles, adds and removes own options, picks times and saves everything', async () => {
    let current = profile({ preferredGrades: ['Lớp 5'], preferredAreas: ['Quận 1'] });
    let week = EMPTY_WEEK;
    const { calls } = mockProfile(
      () => current,
      (req) => {
        if (req.path === '/tutor/profile' && req.method === 'PATCH') {
          const body = req.body as Partial<TutorProfile>;
          current = profile({
            ...body,
            subjects: SUBJECTS.filter((subject) =>
              (body as { subjectIds?: string[] }).subjectIds?.includes(subject.id),
            ),
          });
          return { data: current };
        }
        if (req.path === '/tutor/availability' && req.method === 'PUT') {
          const body = req.body as {
            timezone: string;
            rules: { weekday: number; start: string; end: string }[];
          };
          week = {
            timezone: body.timezone,
            rules: body.rules.map((rule, index) => ({
              id: `r${index}`,
              effectiveFrom: null,
              effectiveTo: null,
              ...rule,
            })),
          };
          return { data: { ...week, affectedBookings: 0 } };
        }
        return undefined;
      },
      () => week,
    );
    renderRoute('/tutor/profile');
    const user = userEvent.setup();

    await user.click(await screen.findByRole('tab', { name: 'Đăng ký lớp học phù hợp' }));
    const subjects = screen.getByRole('group', { name: 'Môn học có thể dạy' });
    // Catalogue order: Toán before Tiếng Anh.
    expect(
      within(subjects)
        .getAllByRole('checkbox')
        .map((box) => box.closest('label')?.textContent),
    ).toEqual(['Toán', 'Tiếng Anh']);
    await user.click(within(subjects).getByRole('checkbox', { name: 'Tiếng Anh' }));

    // "+ Thêm lựa chọn": empty and duplicate labels are refused.
    await user.click(
      within(subjects).getByRole('button', { name: 'Thêm lựa chọn: Môn học có thể dạy' }),
    );
    await user.click(within(subjects).getByRole('button', { name: 'Thêm' }));
    expect(within(subjects).getByRole('alert').textContent).toBe('Vui lòng nhập lựa chọn.');
    await user.type(within(subjects).getByLabelText('Lựa chọn mới'), 'toán');
    await user.click(within(subjects).getByRole('button', { name: 'Thêm' }));
    expect(within(subjects).getByRole('alert').textContent).toBe(
      'Lựa chọn này đã có trong danh sách.',
    );
    await user.clear(within(subjects).getByLabelText('Lựa chọn mới'));
    await user.type(within(subjects).getByLabelText('Lựa chọn mới'), 'Cờ vua');
    await user.click(within(subjects).getByRole('button', { name: 'Thêm' }));
    expect(
      (within(subjects).getByRole('checkbox', { name: 'Cờ vua' }) as HTMLInputElement).checked,
    ).toBe(true);
    await user.click(
      within(subjects).getByRole('button', { name: 'Thêm lựa chọn: Môn học có thể dạy' }),
    );
    await user.type(within(subjects).getByLabelText('Lựa chọn mới'), 'Vẽ{Enter}');
    await user.click(within(subjects).getByRole('button', { name: 'Xóa lựa chọn Vẽ' }));
    expect(within(subjects).queryByRole('checkbox', { name: 'Vẽ' })).toBeNull();
    // Built-in subjects have no remove button.
    expect(within(subjects).queryByRole('button', { name: 'Xóa lựa chọn Toán' })).toBeNull();

    const grades = screen.getByRole('group', { name: 'Lớp học có thể dạy' });
    expect(within(grades).getByRole('checkbox', { name: 'Tiền tiểu học' })).toBeTruthy();
    expect(
      (within(grades).getByRole('checkbox', { name: 'Lớp 5' }) as HTMLInputElement).checked,
    ).toBe(true);
    await user.click(within(grades).getByRole('checkbox', { name: 'Ôn thi đại học' }));

    const modes = screen.getByRole('group', { name: 'Hình thức có thể dạy' });
    await user.click(within(modes).getByRole('checkbox', { name: 'Trực tiếp' }));

    const areas = screen.getByRole('group', { name: 'Khu vực có thể dạy' });
    // An area saved as free text earlier shows as the tutor's own, still selected.
    expect(
      (within(areas).getByRole('checkbox', { name: 'Quận 1' }) as HTMLInputElement).checked,
    ).toBe(true);
    await user.click(within(areas).getByRole('checkbox', { name: 'Hà Nội' }));
    await user.click(
      within(areas).getByRole('button', { name: 'Thêm lựa chọn: Khu vực có thể dạy' }),
    );
    await user.type(
      within(areas).getByRole('combobox', { name: /Quận\/huyện, phường\/xã/ }),
      'Phường Cầu Giấy',
    );
    await user.click(within(areas).getByRole('button', { name: 'Thêm' }));
    expect(within(areas).getByRole('checkbox', { name: /Phường Cầu Giấy/ })).toBeTruthy();
    expect(
      within(within(areas).getByRole('list', { name: 'Khu vực đã chọn' })).getByText(
        'Phường Cầu Giấy, Hà Nội',
      ),
    ).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Thứ Ba, 19:30–21:00' }));
    await user.click(screen.getByRole('button', { name: 'Thứ Năm, 19:30–21:00' }));
    expect(screen.getByText('Đã chọn 2 khung giờ/tuần')).toBeTruthy();
    await user.click(
      screen.getByRole('checkbox', { name: 'Linh hoạt — trao đổi thời gian với phụ huynh' }),
    );

    // Switching tabs keeps every unsaved choice.
    await user.click(screen.getByRole('tab', { name: 'Thông tin cơ bản' }));
    await user.click(screen.getByRole('tab', { name: 'Đăng ký lớp học phù hợp' }));
    expect(
      screen.getByRole('button', { name: 'Thứ Ba, 19:30–21:00' }).getAttribute('aria-pressed'),
    ).toBe('true');

    await user.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));
    expect((await screen.findAllByText('Đã lưu thay đổi.')).length).toBeGreaterThan(0);
    const patch = calls.find((call) => call.method === 'PATCH')?.body as Record<string, unknown>;
    expect(patch).toMatchObject({
      subjectIds: ['subj_math', 'subj_english'],
      teachesOffline: true,
      teachesOnline: true,
      preferredGrades: ['Lớp 5', 'Ôn thi đại học'],
      preferredAreas: ['Quận 1', 'Hà Nội', 'Phường Cầu Giấy, Hà Nội'],
      negotiableTime: true,
      customOptions: [
        { kind: 'area', label: 'Quận 1', selected: true },
        { kind: 'subject', label: 'Cờ vua', selected: true },
        { kind: 'area', label: 'Phường Cầu Giấy, Hà Nội', selected: true },
      ],
    });
    const put = calls.find((call) => call.method === 'PUT');
    expect(put?.path).toBe('/tutor/availability');
    expect(put?.body).toEqual({
      timezone: 'Asia/Ho_Chi_Minh',
      rules: [
        { weekday: 2, start: '19:30', end: '21:00' },
        { weekday: 4, start: '19:30', end: '21:00' },
      ],
    });
  }, 30_000);

  it('clears the grid and refuses a cell that overlaps another saved window', async () => {
    const { calls } = mockProfile(
      () => profile(),
      () => undefined,
      () => ({
        timezone: 'Asia/Ho_Chi_Minh',
        rules: [
          {
            id: 'g1',
            weekday: 1,
            start: '09:00',
            end: '10:30',
            effectiveFrom: null,
            effectiveTo: null,
          },
          {
            id: 'o1',
            weekday: 3,
            start: '19:00',
            end: '21:30',
            effectiveFrom: null,
            effectiveTo: null,
          },
        ],
      }),
    );
    renderRoute('/tutor/profile?tab=dang-ky');
    const user = userEvent.setup();
    const cell = await screen.findByRole('button', { name: 'Thứ Hai, 09:00–10:30' });
    expect(cell.getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByText(/Thứ Tư 19:00–21:30/)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: /Xóa lựa chọn$/ }));
    expect(cell.getAttribute('aria-pressed')).toBe('false');

    await user.click(screen.getByRole('button', { name: 'Thứ Tư, 19:30–21:00' }));
    await user.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));
    expect(await screen.findByText(/trùng với một khung giờ khác đã lưu/)).toBeTruthy();
    expect(calls.some((call) => call.method === 'PATCH' || call.method === 'PUT')).toBe(false);

    await user.click(screen.getByRole('button', { name: 'Xóa khung giờ Thứ Tư 19:00–21:30' }));
    expect(screen.queryByText(/trùng với một khung giờ khác đã lưu/)).toBeNull();
  });

  it('shows an error and keeps the choices when saving fails', async () => {
    mockProfile(
      () => profile(),
      (req) =>
        req.method === 'PATCH'
          ? {
              status: 422,
              error: {
                code: 'VALIDATION_ERROR',
                message: 'Dữ liệu không hợp lệ.',
                details: [{ path: 'preferredAreas.0', message: 'Khu vực không hợp lệ.' }],
              },
            }
          : undefined,
    );
    renderRoute('/tutor/profile?tab=dang-ky');
    const user = userEvent.setup();
    const areas = await screen.findByRole('group', { name: 'Khu vực có thể dạy' });
    await user.click(within(areas).getByRole('checkbox', { name: 'Đà Nẵng' }));
    await user.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));
    expect(await screen.findByText('Khu vực không hợp lệ.')).toBeTruthy();
    expect(
      (within(areas).getByRole('checkbox', { name: 'Đà Nẵng' }) as HTMLInputElement).checked,
    ).toBe(true);
  });
});
