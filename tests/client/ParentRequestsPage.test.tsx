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

describe('parent requests', () => {
  it('filters the owner list by server status and keeps private contact out of cards', async () => {
    const { calls } = mockApi((req) => {
      if (req.path === '/me') return sessionOf({ role: 'student' });
      if (req.path === '/parent/requests?page=1')
        return { data: { items: [ownRequest], total: 1, page: 1, pageSize: 20 } };
      if (req.path === '/parent/requests?status=submitted&page=1')
        return { data: { items: [], total: 0, page: 1, pageSize: 20 } };
      return undefined;
    });
    renderRoute('/parent');
    const user = userEvent.setup();

    expect(await screen.findByRole('link', { name: /YC-0001/ })).toBeTruthy();
    expect(screen.queryByText('0912345678')).toBeNull();
    expect(screen.queryByText(ownRequest.contactAddress!)).toBeNull();
    await user.selectOptions(screen.getByLabelText('Lọc theo trạng thái'), 'submitted');
    expect(await screen.findByRole('heading', { name: 'Chưa có yêu cầu phù hợp' })).toBeTruthy();
    expect(calls.some((call) => call.path === '/parent/requests?status=submitted&page=1')).toBe(
      true,
    );
  });

  it('requires explicit consent before submitting a saved draft and uses its version', async () => {
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
    const send = screen.getByRole('button', { name: 'Gửi yêu cầu' }) as HTMLButtonElement;
    expect(send.disabled).toBe(true);
    expect(calls.some((call) => call.path.endsWith('/submit'))).toBe(false);
    await user.click(screen.getByRole('checkbox', { name: CONTACT_SHARING_CONSENT_TEXT }));
    await user.click(send);
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

  it('creates and submits a request only after a checked consent and server response', async () => {
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
    expect(
      (screen.getByRole('button', { name: 'Gửi yêu cầu' }) as HTMLButtonElement).disabled,
    ).toBe(true);
    await user.selectOptions(screen.getByRole('combobox', { name: /Môn học/ }), 'math');
    await user.selectOptions(screen.getByRole('combobox', { name: /Lớp học/ }), 'Lớp 5');
    await user.type(screen.getByLabelText('Mô tả nhu cầu'), 'Cần gia sư hỗ trợ Toán.');
    await user.type(screen.getByLabelText('Số điện thoại liên hệ'), '0912345678');
    await user.click(screen.getByRole('checkbox', { name: 'Trao đổi thời gian sau' }));
    await user.click(screen.getByRole('checkbox', { name: CONTACT_SHARING_CONSENT_TEXT }));
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
      contactPhone: '0912345678',
      contactAddress: null,
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
    await user.selectOptions(screen.getByRole('combobox', { name: /Môn học/ }), 'math');
    await user.selectOptions(screen.getByRole('combobox', { name: /Lớp học/ }), 'Lớp 5');
    await user.type(screen.getByLabelText('Mô tả nhu cầu'), 'Cần gia sư hỗ trợ Toán.');
    await user.type(screen.getByLabelText('Số điện thoại liên hệ'), '0912345678');
    await user.click(screen.getByRole('checkbox', { name: 'Trao đổi thời gian sau' }));
    await user.click(screen.getByRole('checkbox', { name: CONTACT_SHARING_CONSENT_TEXT }));
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
      if (req.path === '/parent/requests/req-1' && req.method === 'GET')
        return { data: ownRequest };
      return undefined;
    });
    const { router } = renderRoute('/parent/request');
    const user = userEvent.setup();
    await screen.findByRole('heading', { name: 'Tạo yêu cầu tìm gia sư' });
    await user.selectOptions(screen.getByRole('combobox', { name: /Môn học/ }), 'math');
    await user.selectOptions(screen.getByRole('combobox', { name: /Lớp học/ }), 'Lớp 5');
    await user.click(screen.getByRole('button', { name: 'Lưu bản nháp' }));
    expect(await screen.findByText('Cần ít nhất một khung giờ.')).toBeTruthy();
    expect(calls.some((call) => call.path === '/parent/requests' && call.method === 'POST')).toBe(
      false,
    );

    const slot = screen.getByRole('button', { name: 'Thứ Ba, 17:30–19:00' });
    slot.focus();
    await user.keyboard('{Enter}');
    expect(slot.getAttribute('aria-pressed')).toBe('true');
    await user.click(screen.getByRole('button', { name: 'Lưu bản nháp' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/parent/requests/req-1'));
    const create = calls.find((call) => call.path === '/parent/requests' && call.method === 'POST');
    expect(create?.body).toMatchObject({
      schedule: {
        timezone: 'Asia/Ho_Chi_Minh',
        discussLater: false,
        windows: [{ weekday: 2, startLocal: '17:30', endLocal: '19:00' }],
      },
    });
  });

  it('keeps the API limit when selecting whole rows in the weekly grid', async () => {
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
    expect(screen.getByRole('alert').textContent).toContain('tối đa 14 khung giờ');
    expect(
      screen.getByRole('button', { name: 'Thứ Hai, 13:30–15:00' }).getAttribute('aria-pressed'),
    ).toBe('false');
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
    expect(await screen.findByText('Khung giờ khác đã lưu')).toBeTruthy();
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
    const description = screen.getByLabelText('Mô tả nhu cầu') as HTMLTextAreaElement;
    await user.clear(description);
    await user.type(description, 'Nội dung mới của phụ huynh');
    await user.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));

    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toContain('Yêu cầu đã được cập nhật ở nơi khác.');
    expect(description.value).toBe('Nội dung mới của phụ huynh');
    expect(router.state.location.pathname).toBe('/parent/requests/req-1/edit');
    const patch = calls.find((call) => call.method === 'PATCH');
    expect(patch?.body).toMatchObject({ description: 'Nội dung mới của phụ huynh', version: 1 });
  });
});
