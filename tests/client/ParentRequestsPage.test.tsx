import { cleanup, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CONTACT_SHARING_CONSENT_TEXT,
  type OwnParentRequest,
} from '../../src/shared/schemas/requests';
import { mockApi, renderRoute, sessionOf } from './helpers';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const ownRequest: OwnParentRequest = {
  id: 'req-1',
  code: 'YC-0001',
  subjectId: 'math',
  subjectName: 'Toán',
  grade: 'Lớp 5',
  mode: 'online',
  area: null,
  expectedBudgetMinor: null,
  agreedTuitionPerSessionMinor: null,
  publishedClassId: null,
  publishedClassCode: null,
  description: 'Cần gia sư hỗ trợ Toán.',
  studentName: 'Phạm Văn Bình',
  educationLevel: 'primary',
  sessionsPerWeek: 2,
  tutorRequirements: 'Gia sư kiên nhẫn.',
  studentTraits: '',
  status: 'draft',
  version: 1,
  schedule: { timezone: 'Asia/Ho_Chi_Minh', discussLater: true, windows: [] },
  contactPhone: '0912345678',
  contactAddress: 'Địa chỉ chỉ chủ yêu cầu được xem',
  contactConsentAt: null,
  contactConsentVersion: null,
  createdAt: '2026-10-11T00:00:00.000Z',
  updatedAt: '2026-10-11T00:00:00.000Z',
};

const subjects = [{ id: 'math', slug: 'math', name: 'Toán' }];
const counts = {
  draftRequests: 1,
  submittedRequests: 1,
  sourcingRequests: 1,
  assignedRequests: 2,
  fulfilledRequests: 1,
  cancelledRequests: 0,
};

async function fillRequiredFields(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByRole('textbox', { name: /Họ và tên/ }), 'Phạm Văn Bình');
  await user.type(screen.getByRole('textbox', { name: /Số điện thoại/ }), '0912345678');
  await user.selectOptions(screen.getByRole('combobox', { name: /Phường\/Xã/ }), 'Phường Cầu Giấy');
  await user.selectOptions(screen.getByRole('combobox', { name: /Môn học/ }), 'math');
  await user.selectOptions(screen.getByRole('combobox', { name: /^Lớp/ }), 'Lớp 5');
}

describe('parent requests', () => {
  it('shows status cards and tabs, filters on the server and keeps the address private', async () => {
    const sourcing = { ...ownRequest, status: 'sourcing' as const };
    const { calls } = mockApi((req) => {
      if (req.path === '/me') return sessionOf({ role: 'student' });
      if (req.path === '/subjects') return { data: subjects };
      if (req.path === '/parent/dashboard') return { data: counts };
      if (req.path.startsWith('/parent/requests?')) {
        const query = new URLSearchParams(req.path.split('?')[1]);
        const items = query.get('group') === 'searching' && !query.get('q') ? [sourcing] : [];
        return { data: { items, total: items.length, page: 1, pageSize: 10 } };
      }
      return undefined;
    });
    renderRoute('/parent');
    const user = userEvent.setup();

    expect(await screen.findByRole('link', { name: 'YC-0001' })).toBeTruthy();
    expect(screen.getByText('Phạm Văn Bình')).toBeTruthy();
    expect(screen.getByText('0912345678')).toBeTruthy();
    expect(screen.queryByText(ownRequest.contactAddress!)).toBeNull();
    expect(await screen.findByText('6')).toBeTruthy();
    const tabs = screen.getAllByRole('tab').map((tab) => tab.textContent);
    expect(tabs).toEqual([
      'Đang tìm gia sư2',
      'Đã tìm được gia sư2',
      'Đã xác nhận1',
      'Nháp & đã hủy1',
    ]);
    expect(calls.some((call) => call.path === '/parent/requests?group=searching&pageSize=10')).toBe(
      true,
    );

    await user.click(screen.getByRole('tab', { name: /Đã tìm được gia sư/ }));
    expect(await screen.findByRole('heading', { name: 'Chưa có yêu cầu phù hợp' })).toBeTruthy();
    expect(calls.some((call) => call.path === '/parent/requests?group=found&pageSize=10')).toBe(
      true,
    );

    await user.click(screen.getByRole('tab', { name: /Đang tìm gia sư/ }));
    await user.type(screen.getByRole('searchbox', { name: 'Từ khóa' }), 'Bình');
    await user.selectOptions(screen.getByRole('combobox', { name: 'Hình thức' }), 'online');
    await user.click(screen.getByRole('button', { name: 'Lọc' }));
    await waitFor(() =>
      expect(
        calls.some(
          (call) =>
            call.path === '/parent/requests?group=searching&q=B%C3%ACnh&mode=online&pageSize=10',
        ),
      ).toBe(true),
    );
  });

  it('shows the sharing notice and submits a saved draft with its version', async () => {
    let current = ownRequest;
    const { calls } = mockApi((req) => {
      if (req.path === '/me') return sessionOf({ role: 'student' });
      if (req.path === '/parent/requests/req-1' && req.method === 'GET') return { data: current };
      if (req.path === '/parent/requests/req-1/submit' && req.method === 'POST') {
        current = {
          ...current,
          status: 'sourcing',
          version: 2,
          publishedClassId: 'class-1',
          publishedClassCode: 'LH-0001',
        };
        return { data: current };
      }
      return undefined;
    });
    renderRoute('/parent/requests/req-1');
    const user = userEvent.setup();

    expect(await screen.findByRole('heading', { name: 'Yêu cầu YC-0001' })).toBeTruthy();
    expect(screen.getByText(CONTACT_SHARING_CONSENT_TEXT)).toBeTruthy();
    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(calls.some((call) => call.path.endsWith('/submit'))).toBe(false);
    await user.click(screen.getByRole('button', { name: 'Gửi yêu cầu' }));
    expect(
      await screen.findByText(/Yêu cầu đã được công bố trong danh sách lớp tìm gia sư/),
    ).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Xem lớp LH-0001' }).getAttribute('href')).toBe(
      '/lop-hoc/class-1',
    );
    const submitted = calls.find((call) => call.path.endsWith('/submit'));
    expect(submitted?.body).toEqual({ version: 1, consentToShareContact: true });
    expect(submitted?.headers.get('X-CSRF-Token')).toBe('csrf-test-token');
  });

  it('creates and submits a request with a fixed Hà Nội area and no consent checkbox', async () => {
    let current = ownRequest;
    const { calls } = mockApi((req) => {
      if (req.path === '/me') return sessionOf({ role: 'student' });
      if (req.path === '/subjects') return { data: subjects };
      if (req.path === '/parent/requests' && req.method === 'POST')
        return { status: 201, data: current };
      if (req.path === '/parent/requests/req-1/submit' && req.method === 'POST') {
        current = {
          ...current,
          status: 'sourcing',
          version: 2,
          publishedClassId: 'class-1',
          publishedClassCode: 'LH-0001',
        };
        return { data: current };
      }
      if (req.path === '/parent/requests/req-1' && req.method === 'GET') return { data: current };
      return undefined;
    });
    const { router } = renderRoute('/parent/request');
    const user = userEvent.setup();

    expect(await screen.findByRole('heading', { name: 'Tạo yêu cầu tìm gia sư' })).toBeTruthy();
    const city = screen.getByRole('textbox', { name: 'Khu vực' }) as HTMLInputElement;
    expect(city.value).toBe('Hà Nội');
    expect(city.readOnly).toBe(true);
    expect(screen.getByText(CONTACT_SHARING_CONSENT_TEXT)).toBeTruthy();
    expect(screen.queryByRole('checkbox', { name: /Tôi đồng ý/ })).toBeNull();
    expect(screen.getByText('Thời gian có thể học')).toBeTruthy();
    await fillRequiredFields(user);
    await user.type(
      screen.getByRole('textbox', { name: 'Địa chỉ cụ thể' }),
      'Ngõ 12 Trần Thái Tông',
    );
    await user.click(screen.getByRole('checkbox', { name: 'Trao đổi thời gian sau' }));
    await user.click(screen.getByRole('button', { name: 'Gửi yêu cầu' }));

    await waitFor(() => expect(router.state.location.pathname).toBe('/parent/requests/req-1'));
    expect(await screen.findByText(/Đang tìm gia sư/)).toBeTruthy();
    const created = calls.find(
      (call) => call.path === '/parent/requests' && call.method === 'POST',
    );
    const submitted = calls.find((call) => call.path.endsWith('/submit'));
    expect(created?.headers.get('Idempotency-Key')).toBeTruthy();
    expect(created?.headers.get('X-CSRF-Token')).toBe('csrf-test-token');
    expect(created?.body).toMatchObject({
      subjectId: 'math',
      grade: 'Lớp 5',
      schedule: { timezone: 'Asia/Ho_Chi_Minh', discussLater: true, windows: [] },
      area: 'Phường Cầu Giấy, Hà Nội',
      contactPhone: '0912345678',
      contactAddress: 'Ngõ 12 Trần Thái Tông',
    });
    expect(submitted?.body).toEqual({ version: 1, consentToShareContact: true });
  });

  it('retains the saved draft and checks server state after a failed submission', async () => {
    const { calls } = mockApi((req) => {
      if (req.path === '/me') return sessionOf({ role: 'student' });
      if (req.path === '/subjects') return { data: subjects };
      if (req.path === '/parent/requests' && req.method === 'POST')
        return { status: 201, data: ownRequest };
      if (req.path === '/parent/requests/req-1/submit')
        return { status: 503, error: { code: 'UNAVAILABLE', message: 'Tạm thời không thể gửi.' } };
      if (req.path === '/parent/requests/req-1' && req.method === 'GET')
        return { data: ownRequest };
      return undefined;
    });
    const { router } = renderRoute('/parent/request');
    const user = userEvent.setup();
    await screen.findByRole('heading', { name: 'Tạo yêu cầu tìm gia sư' });
    await fillRequiredFields(user);
    await user.click(screen.getByRole('checkbox', { name: 'Trao đổi thời gian sau' }));
    await user.click(screen.getByRole('button', { name: 'Gửi yêu cầu' }));

    expect(await screen.findByRole('heading', { name: 'Yêu cầu đã được tạo' })).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toContain('Tạm thời không thể gửi.');
    expect(router.state.location.pathname).toBe('/parent/request');
    expect(screen.getByRole('link', { name: 'Xem trạng thái yêu cầu' })).toBeTruthy();
    expect(calls.some((call) => call.path === '/parent/requests/req-1')).toBe(true);
  });

  it('maps the export-style weekly grid to the existing recurring schedule API', async () => {
    const { calls } = mockApi((req) => {
      if (req.path === '/me') return sessionOf({ role: 'student' });
      if (req.path === '/subjects') return { data: subjects };
      if (req.path === '/parent/requests' && req.method === 'POST')
        return { status: 201, data: ownRequest };
      if (req.path === '/parent/requests/req-1/submit')
        return { data: { ...ownRequest, status: 'sourcing', version: 2 } };
      if (req.path === '/parent/requests/req-1' && req.method === 'GET')
        return { data: ownRequest };
      return undefined;
    });
    const { router } = renderRoute('/parent/request');
    const user = userEvent.setup();
    await screen.findByRole('heading', { name: 'Tạo yêu cầu tìm gia sư' });
    await fillRequiredFields(user);
    await user.click(screen.getByRole('button', { name: 'Gửi yêu cầu' }));
    expect(await screen.findByText('Cần ít nhất một khung giờ.')).toBeTruthy();
    expect(calls.some((call) => call.path === '/parent/requests' && call.method === 'POST')).toBe(
      false,
    );

    const slot = screen.getByRole('button', { name: 'Thứ Ba, 17:30–19:00' });
    slot.focus();
    await user.keyboard('{Enter}');
    expect(slot.getAttribute('aria-pressed')).toBe('true');
    await user.click(screen.getByRole('button', { name: 'Gửi yêu cầu' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/parent/requests/req-1'));
    const create = calls.find((call) => call.path === '/parent/requests' && call.method === 'POST');
    expect(create?.body).toMatchObject({
      studentName: 'Phạm Văn Bình',
      educationLevel: 'primary',
      area: 'Phường Cầu Giấy, Hà Nội',
      mode: 'offline',
      schedule: {
        timezone: 'Asia/Ho_Chi_Minh',
        discussLater: false,
        windows: [{ weekday: 2, startLocal: '17:30', endLocal: '19:00' }],
      },
    });
  });

  it('does not cap the weekly grid at 14 slots', async () => {
    const { calls } = mockApi((req) => {
      if (req.path === '/me') return sessionOf({ role: 'student' });
      if (req.path === '/subjects') return { data: subjects };
      return undefined;
    });
    renderRoute('/parent/request');
    const user = userEvent.setup();
    await screen.findByRole('heading', { name: 'Tạo yêu cầu tìm gia sư' });
    await user.click(screen.getByRole('button', { name: 'Chọn khung 09:00–10:30 cả tuần' }));
    await user.click(screen.getByRole('button', { name: 'Chọn khung 10:30–12:00 cả tuần' }));
    expect(screen.getByText(/Đã chọn 14 khung giờ/)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Chọn khung 13:30–15:00 cả tuần' }));
    expect(screen.getByText('Đã chọn 21 khung giờ/tuần')).toBeTruthy();
    expect(screen.queryByText(/tối đa/)).toBeNull();
    expect(
      screen.getByRole('button', { name: 'Thứ Hai, 13:30–15:00' }).getAttribute('aria-pressed'),
    ).toBe('true');
    expect(calls.some((call) => call.path === '/parent/requests' && call.method === 'POST')).toBe(
      false,
    );
  });

  it('preserves previously saved times that are outside the Figma grid', async () => {
    const custom = {
      ...ownRequest,
      schedule: {
        timezone: 'Asia/Ho_Chi_Minh',
        discussLater: false,
        windows: [{ weekday: 3, startLocal: '18:00', endLocal: '19:00' }],
      },
    } satisfies OwnParentRequest;
    const { calls } = mockApi((req) => {
      if (req.path === '/me') return sessionOf({ role: 'student' });
      if (req.path === '/subjects') return { data: subjects };
      if (req.path === '/parent/requests/req-1' && req.method === 'GET') return { data: custom };
      if (req.path === '/parent/requests/req-1' && req.method === 'PATCH')
        return { data: { ...custom, version: 2 } };
      return undefined;
    });
    renderRoute('/parent/requests/req-1/edit');
    const user = userEvent.setup();
    expect(((await screen.findByLabelText('Bắt đầu khung giờ 1')) as HTMLInputElement).value).toBe(
      '18:00',
    );
    expect((screen.getByLabelText('Bắt đầu khung giờ 1') as HTMLInputElement).value).toBe('18:00');
    await user.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));
    await waitFor(() => expect(calls.some((call) => call.method === 'PATCH')).toBe(true));
    expect(calls.find((call) => call.method === 'PATCH')?.body).toMatchObject({
      schedule: { windows: [{ weekday: 3, startLocal: '18:00', endLocal: '19:00' }] },
    });
  });

  it('does not fetch private parent requests under a tutor session', async () => {
    const { calls } = mockApi((req) =>
      req.path === '/me' ? sessionOf({ role: 'tutor' }) : undefined,
    );
    renderRoute('/parent/requests/req-1');
    expect(
      await screen.findByRole('heading', { name: 'Bạn không có quyền truy cập trang này' }),
    ).toBeTruthy();
    expect(calls.some((call) => call.path.startsWith('/parent/requests'))).toBe(false);
  });

  it('keeps edits visible and does not claim success after a stale version conflict', async () => {
    const { calls } = mockApi((req) => {
      if (req.path === '/me') return sessionOf({ role: 'student' });
      if (req.path === '/subjects') return { data: subjects };
      if (req.path === '/parent/requests/req-1' && req.method === 'GET')
        return { data: ownRequest };
      if (req.path === '/parent/requests/req-1' && req.method === 'PATCH')
        return {
          status: 409,
          error: { code: 'VERSION_CONFLICT', message: 'Yêu cầu đã được cập nhật ở nơi khác.' },
        };
      return undefined;
    });
    const { router } = renderRoute('/parent/requests/req-1/edit');
    const user = userEvent.setup();
    await screen.findByRole('heading', { name: 'Chỉnh sửa yêu cầu YC-0001' });
    const description = screen.getByLabelText('Yêu cầu đối với gia sư') as HTMLTextAreaElement;
    await user.clear(description);
    await user.type(description, 'Nội dung mới của phụ huynh');
    await user.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));

    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toContain('Yêu cầu đã được cập nhật ở nơi khác.');
    expect(description.value).toBe('Nội dung mới của phụ huynh');
    expect(router.state.location.pathname).toBe('/parent/requests/req-1/edit');
    const patch = calls.find((call) => call.method === 'PATCH');
    expect(patch?.body).toMatchObject({
      tutorRequirements: 'Nội dung mới của phụ huynh',
      description: ownRequest.description,
      version: 1,
    });
  });

  it('lets an online request leave the address empty but requires a phường/xã offline', async () => {
    const { calls } = mockApi((req) => {
      if (req.path === '/me') return sessionOf({ role: 'student' });
      if (req.path === '/subjects') return { data: subjects };
      if (req.path === '/parent/requests' && req.method === 'POST')
        return { status: 201, data: ownRequest };
      if (req.path === '/parent/requests/req-1/submit')
        return { data: { ...ownRequest, status: 'sourcing', version: 2 } };
      if (req.path === '/parent/requests/req-1' && req.method === 'GET')
        return { data: ownRequest };
      return undefined;
    });
    const { router } = renderRoute('/parent/request');
    const user = userEvent.setup();
    await screen.findByRole('heading', { name: 'Tạo yêu cầu tìm gia sư' });
    await user.type(screen.getByRole('textbox', { name: /Họ và tên/ }), 'Trần Đức Anh');
    await user.type(screen.getByRole('textbox', { name: /Số điện thoại/ }), '0912345678');
    await user.selectOptions(screen.getByRole('combobox', { name: /Môn học/ }), 'math');
    await user.selectOptions(screen.getByRole('combobox', { name: /^Lớp/ }), 'Lớp 5');
    await user.click(screen.getByRole('checkbox', { name: 'Trao đổi thời gian sau' }));
    await user.click(screen.getByRole('button', { name: 'Gửi yêu cầu' }));
    expect(await screen.findByText('Cần chọn phường/xã cho hình thức học offline.')).toBeTruthy();
    expect(calls.some((call) => call.method === 'POST')).toBe(false);

    await user.click(screen.getByRole('radio', { name: 'Online' }));
    await user.click(screen.getByRole('button', { name: 'Gửi yêu cầu' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/parent/requests/req-1'));
    expect(
      calls.find((call) => call.path === '/parent/requests' && call.method === 'POST')?.body,
    ).toMatchObject({ mode: 'online', area: null, contactAddress: null });
  });
});
