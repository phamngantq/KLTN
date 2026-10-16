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
    major: null,
    graduationYear: null,
    email: 'tutor@example.com',
    phone: null,
    dateOfBirth: null,
    idNumber: null,
    idIssuedOn: null,
    idResidence: null,
    idVerification: 'center',
    documents: [],
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
    const handled = extra(req);
    if (handled) return handled;
    if (req.path === '/tutor/profile/submit')
      return { data: { ...current()!, approvalStatus: 'pending' } };
    return undefined;
  });
}

describe('TutorProfilePage — Thông tin cơ bản', () => {
  it('shows the design sections without a status block, saves every field and sends for review', async () => {
    let current = profile({ missing: ['hourlyRate'], hourlyRateMinor: null });
    const { calls } = mockProfile(
      () => current,
      (req) => {
        if (req.path === '/tutor/profile' && req.method === 'PATCH') {
          current = profile({ ...(req.body as Partial<TutorProfile>), missing: [] });
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
    for (const title of [
      'Thông tin cá nhân',
      'Trình độ học vấn',
      'Kinh nghiệm giảng dạy',
      'Thẻ căn cước',
      'Minh chứng & Bằng cấp',
    ]) {
      expect(screen.getByRole('region', { name: title })).toBeTruthy();
    }
    expect(screen.getByText('Ảnh đại diện')).toBeTruthy();
    // No profile status block or manual "Gửi duyệt".
    expect(screen.queryByText(/Trạng thái/)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Gửi duyệt' })).toBeNull();
    expect(screen.getByText('Bổ sung học phí theo giờ để hồ sơ được gửi duyệt.')).toBeTruthy();
    expect((screen.getByLabelText('Email') as HTMLInputElement).readOnly).toBe(true);
    expect(
      (screen.getByRole('button', { name: 'Lưu thay đổi' }) as HTMLButtonElement).disabled,
    ).toBe(true);

    await user.type(screen.getByLabelText('Số điện thoại'), '0123456789');
    await user.type(screen.getByLabelText('Ngày sinh'), '1998-01-01');
    await user.selectOptions(screen.getByLabelText('Loại gia sư'), 'university_student');
    await user.type(screen.getByLabelText('Chuyên ngành'), 'Toán học');
    await user.selectOptions(screen.getByLabelText('Năm tốt nghiệp'), '2022');
    await user.selectOptions(screen.getByLabelText('Số năm kinh nghiệm'), '2');
    await user.type(screen.getByLabelText('Thành tích'), 'Giải Nhất Olympic Toán');
    await user.type(screen.getByLabelText(/Học phí/), '300000');
    await user.type(screen.getByLabelText(/Số thẻ CCCD/), '0083a05000649');
    await user.type(screen.getByLabelText('Ngày'), '21');
    await user.type(screen.getByLabelText('Tháng'), '01');
    await user.type(screen.getByLabelText('Năm'), '2021');
    await user.type(screen.getByLabelText(/Nơi thường trú/), 'Tân An');
    await user.click(screen.getByRole('radio', { name: 'Xác minh bằng cách upload ảnh' }));
    await user.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));

    expect((await screen.findAllByText('Đã lưu thay đổi.')).length).toBeGreaterThan(0);
    const body = calls.find((c) => c.method === 'PATCH')?.body as Record<string, unknown>;
    expect(body).toMatchObject({
      hourlyRateMinor: 300_000,
      subjectIds: ['subj_math'],
      phone: '0123456789',
      dateOfBirth: '1998-01-01',
      tutorType: 'university_student',
      major: 'Toán học',
      graduationYear: 2022,
      experienceYears: 2,
      experienceSummary: 'Giải Nhất Olympic Toán',
      idNumber: '008305000649',
      idIssuedOn: '2021-01-21',
      idResidence: 'Tân An',
      idVerification: 'upload',
    });
    expect(body).not.toHaveProperty('approvalStatus');
    // Complete after saving, so it was sent for review; the schedule was not rewritten.
    expect(calls.some((c) => c.path === '/tutor/profile/submit')).toBe(true);
    expect(calls.some((c) => c.method === 'PUT')).toBe(false);
    expect(screen.getByRole('region', { name: 'Thẻ căn cước' }).textContent).toContain(
      'Ảnh CCCD mặt trước',
    );
  }, 30_000);

  it('refuses an impossible issue date before sending anything', async () => {
    const { calls } = mockProfile(() => profile());
    renderRoute('/tutor/profile');
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText('Ngày'), '31');
    await user.type(screen.getByLabelText('Tháng'), '02');
    await user.type(screen.getByLabelText('Năm'), '2021');
    await user.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));
    expect(await screen.findByText('Ngày cấp CCCD không hợp lệ.')).toBeTruthy();
    expect(calls.some((c) => c.method === 'PATCH')).toBe(false);
  });

  it('uploads, lists and removes ID photos and credentials', async () => {
    let documents: TutorProfile['documents'] = [
      {
        id: 'd-front',
        kind: 'id_front',
        fileName: 'mat-truoc.png',
        contentType: 'image/png',
        sizeBytes: 10,
        createdAt: '2026-10-16T00:00:00.000Z',
      },
    ];
    const { calls } = mockProfile(
      () => profile({ idVerification: 'upload', documents }),
      (req) => {
        if (req.path === '/tutor/profile/documents' && req.method === 'POST') {
          const doc = {
            id: `d-${documents.length}`,
            kind: (req.body as FormData).get('kind') as 'credential',
            fileName: ((req.body as FormData).get('file') as File).name,
            contentType: 'application/pdf' as const,
            sizeBytes: 10,
            createdAt: '2026-10-16T00:00:00.000Z',
          };
          documents = [...documents, doc];
          return { status: 201, data: doc };
        }
        if (req.path.startsWith('/tutor/profile/documents/') && req.method === 'DELETE') {
          documents = documents.filter((doc) => !req.path.endsWith(doc.id));
          return { data: { deleted: true } };
        }
        return undefined;
      },
    );
    renderRoute('/tutor/profile');
    const user = userEvent.setup({ applyAccept: false });

    const front = await screen.findByAltText('Ảnh CCCD mặt trước');
    expect(front.getAttribute('src')).toBe('/api/v1/tutor/profile/documents/d-front');
    expect(screen.getByLabelText('Tải ảnh cccd mặt sau')).toBeTruthy();

    await user.upload(
      screen.getByLabelText('Chọn file'),
      new File(['%PDF-1.4'], 'bang-tot-nghiep.pdf', { type: 'application/pdf' }),
    );
    const upload = await waitFor(() => {
      const call = calls.find((c) => c.path === '/tutor/profile/documents');
      expect(call).toBeTruthy();
      return call!;
    });
    expect((upload.body as FormData).get('kind')).toBe('credential');
    expect(await screen.findByRole('link', { name: 'bang-tot-nghiep.pdf' })).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Xóa tệp bang-tot-nghiep.pdf' }));
    await waitFor(() =>
      expect(screen.queryByRole('link', { name: 'bang-tot-nghiep.pdf' })).toBeNull(),
    );
    expect(calls.some((c) => c.method === 'DELETE')).toBe(true);
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
    await user.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));
    expect(await screen.findByText('Học phí phải là bội số của 1.000 ₫.')).toBeTruthy();
    expect(screen.getByLabelText(/Học phí/).getAttribute('aria-invalid')).toBe('true');
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
