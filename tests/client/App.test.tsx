import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { homePathFor, safeNextPath } from '../../src/client/app/auth';
import { api, ApiError, setCsrfToken } from '../../src/client/lib/api-client';
import { anonymous, mockApi, renderRoute, sessionOf } from './helpers';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('routing and guards', () => {
  it('renders the home page for guests with sign-up CTAs', async () => {
    mockApi((req) =>
      req.path === '/me' ? anonymous : req.path === '/subjects' ? { data: [] } : undefined,
    );
    renderRoute('/');
    expect(await screen.findByRole('heading', { level: 1 })).toBeTruthy();
    expect(await screen.findByRole('link', { name: 'Đăng ký' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Bỏ qua tới nội dung chính' })).toBeTruthy();
  });

  it('redirects guests from protected routes to sign-in with a return path', async () => {
    mockApi((req) => (req.path === '/me' ? anonymous : undefined));
    const { router } = renderRoute('/account');
    await screen.findByRole('heading', { name: 'Đăng nhập' });
    expect(router.state.location.pathname).toBe('/sign-in');
    expect(router.state.location.search).toBe(`?next=${encodeURIComponent('/account')}`);
  });

  it('shows the protected page to a signed-in user', async () => {
    mockApi((req) => (req.path === '/me' ? sessionOf({ role: 'tutor' }) : undefined));
    renderRoute('/account');
    expect(await screen.findByRole('heading', { name: 'Tài khoản' })).toBeTruthy();
    expect(within(screen.getByRole('main')).getByText('Gia sư')).toBeTruthy();
  });

  it('renders a 404 page for unknown routes', async () => {
    mockApi((req) => (req.path === '/me' ? anonymous : undefined));
    renderRoute('/does/not/exist');
    expect(await screen.findByRole('heading', { name: 'Không tìm thấy trang' })).toBeTruthy();
  });

  it('shows a retryable error when the session check fails', async () => {
    mockApi((req) =>
      req.path === '/me'
        ? { status: 503, error: { code: 'X', message: 'Máy chủ bận.' } }
        : undefined,
    );
    renderRoute('/account');
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Thử lại' })).toBeTruthy();
  });
});

describe('sign-in', () => {
  it('signs in and navigates to the return path', async () => {
    let signedIn = false;
    const { calls } = mockApi((req) => {
      if (req.path === '/me') return signedIn ? sessionOf({ role: 'student' }) : anonymous;
      if (req.path === '/auth/login' && req.method === 'POST') {
        signedIn = true;
        return sessionOf({ role: 'student' });
      }
      return undefined;
    });
    const { router } = renderRoute('/sign-in?next=%2Faccount');
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText(/Email/), 'a@example.com');
    await user.type(screen.getByLabelText(/Mật khẩu/), 'secret-pass');
    await user.click(screen.getByRole('button', { name: 'Đăng nhập' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/account'));
    expect(calls.find((c) => c.path === '/auth/login')?.body).toEqual({
      email: 'a@example.com',
      password: 'secret-pass',
    });
  });

  it('shows the server error and keeps the typed email', async () => {
    mockApi((req) => {
      if (req.path === '/me') return anonymous;
      if (req.path === '/auth/login') {
        return {
          status: 401,
          error: { code: 'INVALID_CREDENTIALS', message: 'Email hoặc mật khẩu không đúng.' },
        };
      }
      return undefined;
    });
    renderRoute('/sign-in');
    const user = userEvent.setup();
    const email = await screen.findByLabelText(/Email/);
    await user.type(email, 'a@example.com');
    await user.type(screen.getByLabelText(/Mật khẩu/), 'wrong');
    await user.click(screen.getByRole('button', { name: 'Đăng nhập' }));
    expect((await screen.findByRole('alert')).textContent).toContain(
      'Email hoặc mật khẩu không đúng.',
    );
    expect((email as HTMLInputElement).value).toBe('a@example.com');
  });
});

describe('logout', () => {
  it('retains the confirmed session after failure and retries successfully', async () => {
    let logoutAttempts = 0;
    const { calls } = mockApi((req) => {
      if (req.path === '/me') return sessionOf({ role: 'tutor' });
      if (req.path === '/auth/logout' && req.method === 'POST') {
        logoutAttempts += 1;
        return logoutAttempts === 1
          ? { status: 503, error: { code: 'UNAVAILABLE', message: 'Máy chủ tạm gián đoạn.' } }
          : { data: { loggedOut: true } };
      }
      if (req.path === '/subjects') return { data: [] };
      return undefined;
    });
    const { router } = renderRoute('/account');
    const user = userEvent.setup();
    await screen.findByRole('heading', { name: 'Tài khoản' });

    await user.click(screen.getByLabelText(/Tài khoản của/));
    await user.click(screen.getByRole('button', { name: 'Đăng xuất' }));
    const error = await screen.findByRole('alert');
    expect(error.textContent).toContain('Máy chủ tạm gián đoạn.');
    expect(router.state.location.pathname).toBe('/account');
    expect(screen.getByRole('link', { name: 'Khu vực gia sư' })).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Thử lại' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
    expect(calls.filter((call) => call.path === '/auth/logout')).toHaveLength(2);
    expect(screen.queryByRole('link', { name: 'Khu vực gia sư' })).toBeNull();
  });
});

describe('sign-up field errors', () => {
  it('links validation errors to their fields via aria-describedby', async () => {
    mockApi((req) => {
      if (req.path === '/me') return anonymous;
      if (req.path === '/auth/register') {
        return {
          status: 422,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Dữ liệu không hợp lệ.',
            details: [{ path: 'password', message: 'Mật khẩu tối thiểu 8 ký tự.' }],
          },
        };
      }
      return undefined;
    });
    renderRoute('/sign-up');
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText(/Họ và tên/), 'An');
    await user.type(screen.getByLabelText(/Email/), 'a@example.com');
    await user.type(screen.getByLabelText(/Mật khẩu/), 'short');
    await user.type(screen.getByLabelText(/Xác nhận mật khẩu/), 'short');
    await user.click(screen.getByRole('button', { name: 'Tạo tài khoản' }));
    const message = await screen.findByText('Mật khẩu tối thiểu 8 ký tự.');
    const input = screen.getByLabelText(/Mật khẩu/);
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(input.getAttribute('aria-describedby')).toContain(message.id);
  });
});

describe('api client', () => {
  it('sends the CSRF token only on unsafe methods and surfaces typed errors', async () => {
    const { calls } = mockApi((req) =>
      req.method === 'GET'
        ? { data: { ok: true } }
        : { status: 409, error: { code: 'SLOT_UNAVAILABLE', message: 'Khung giờ đã được đặt.' } },
    );
    setCsrfToken('token-123');
    await api.get('/x');
    const failure = await api.post('/y', { a: 1 }).catch((e: unknown) => e);
    expect(calls[0]!.headers.get('X-CSRF-Token')).toBeNull();
    expect(calls[1]!.headers.get('X-CSRF-Token')).toBe('token-123');
    expect(calls[1]!.headers.get('Content-Type')).toBe('application/json');
    expect(failure).toBeInstanceOf(ApiError);
    expect((failure as ApiError).status).toBe(409);
    expect((failure as ApiError).code).toBe('SLOT_UNAVAILABLE');
    setCsrfToken(null);
  });

  it('maps network failures to NETWORK_ERROR', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Promise.reject(new TypeError('offline'))),
    );
    await expect(api.get('/x')).rejects.toMatchObject({ code: 'NETWORK_ERROR', status: 0 });
  });
});

describe('safeNextPath', () => {
  it('only accepts same-origin relative paths', () => {
    expect(safeNextPath('/account?x=1')).toBe('/account?x=1');
    expect(safeNextPath('https://evil.example')).toBeNull();
    expect(safeNextPath('//evil.example')).toBeNull();
    expect(safeNextPath('/\\evil.example')).toBeNull();
    expect(safeNextPath(null)).toBeNull();
  });
});

describe('product home paths', () => {
  it('lands each trusted storage role in its product area', () => {
    expect(homePathFor('student')).toBe('/parent');
    expect(homePathFor('tutor')).toBe('/tutor');
    expect(homePathFor('admin')).toBe('/admin');
  });
});
