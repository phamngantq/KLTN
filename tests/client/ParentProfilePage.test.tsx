import { cleanup, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ParentProfile } from '../../src/shared/schemas/parents';
import { mockApi, renderRoute, sessionOf } from './helpers';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const ownProfile: ParentProfile = {
  userId: 'u1',
  email: 'a@example.com',
  displayName: 'Nguyễn An',
  phone: '0912345678',
};

describe('ParentProfilePage', () => {
  it('loads private contact and confirms only the server-saved update', async () => {
    let current = ownProfile;
    const { calls } = mockApi((request) => {
      if (request.path === '/me') return sessionOf({ role: 'student' });
      if (request.path === '/parent/profile' && request.method === 'GET') return { data: current };
      if (request.path === '/parent/profile' && request.method === 'PATCH') {
        current = { ...current, ...(request.body as object) };
        return { data: current };
      }
      return undefined;
    });
    renderRoute('/parent/profile');
    const user = userEvent.setup();

    expect(await screen.findByRole('heading', { name: 'Hồ sơ người học' })).toBeTruthy();
    expect((screen.getByLabelText(/Họ và tên/) as HTMLInputElement).value).toBe('Nguyễn An');
    expect((screen.getByLabelText('Số điện thoại') as HTMLInputElement).value).toBe('0912345678');
    expect(screen.getByText('a@example.com')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Lưu hồ sơ' }) as HTMLButtonElement).disabled).toBe(
      true,
    );

    await user.clear(screen.getByLabelText(/Họ và tên/));
    await user.type(screen.getByLabelText(/Họ và tên/), 'Nguyễn Bình');
    await user.clear(screen.getByLabelText('Số điện thoại'));
    await user.click(screen.getByRole('button', { name: 'Lưu hồ sơ' }));

    expect(await screen.findByText('Đã lưu hồ sơ.')).toBeTruthy();
    const patch = calls.find((call) => call.path === '/parent/profile' && call.method === 'PATCH');
    expect(patch?.body).toEqual({ displayName: 'Nguyễn Bình', phone: null });
    expect(patch?.headers.get('X-CSRF-Token')).toBe('csrf-test-token');
    await waitFor(() =>
      expect(
        (screen.getByRole('button', { name: 'Lưu hồ sơ' }) as HTMLButtonElement).disabled,
      ).toBe(true),
    );
  });

  it('keeps user edits and links server validation errors to the phone control', async () => {
    mockApi((request) => {
      if (request.path === '/me') return sessionOf({ role: 'student' });
      if (request.path === '/parent/profile' && request.method === 'GET')
        return { data: ownProfile };
      if (request.path === '/parent/profile' && request.method === 'PATCH') {
        return {
          status: 422,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Dữ liệu không hợp lệ.',
            details: [{ path: 'phone', message: 'Số điện thoại không hợp lệ.' }],
          },
        };
      }
      return undefined;
    });
    renderRoute('/parent/profile');
    const user = userEvent.setup();
    const phone = await screen.findByLabelText('Số điện thoại');
    await user.clear(phone);
    await user.type(phone, 'bad-number');
    await user.click(screen.getByRole('button', { name: 'Lưu hồ sơ' }));

    const message = await screen.findByText('Số điện thoại không hợp lệ.');
    expect(phone.getAttribute('aria-invalid')).toBe('true');
    expect(phone.getAttribute('aria-describedby')).toContain(message.id);
    expect((phone as HTMLInputElement).value).toBe('bad-number');
    expect(screen.queryByText('Đã lưu hồ sơ.')).toBeNull();
  });

  it('offers retry for a failed load and an honest empty state', async () => {
    let attempts = 0;
    mockApi((request) => {
      if (request.path === '/me') return sessionOf({ role: 'student' });
      if (request.path === '/parent/profile' && request.method === 'GET') {
        attempts += 1;
        return attempts === 1
          ? { status: 404, error: { code: 'PROFILE_NOT_FOUND', message: 'Chưa có hồ sơ.' } }
          : { data: null };
      }
      return undefined;
    });
    renderRoute('/parent/profile');
    const user = userEvent.setup();
    expect(await screen.findByRole('alert')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Thử lại' }));
    expect(await screen.findByRole('heading', { name: 'Chưa có hồ sơ người học' })).toBeTruthy();
    expect(attempts).toBe(2);
  });

  it('does not fetch parent contact for a tutor session', async () => {
    const { calls } = mockApi((request) =>
      request.path === '/me' ? sessionOf({ role: 'tutor' }) : undefined,
    );
    renderRoute('/parent/profile');
    expect(
      await screen.findByRole('heading', { name: 'Bạn không có quyền truy cập trang này' }),
    ).toBeTruthy();
    expect(calls.some((call) => call.path === '/parent/profile')).toBe(false);
  });
});
