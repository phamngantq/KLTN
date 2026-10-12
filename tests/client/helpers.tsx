import { QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { vi } from 'vitest';
import { createQueryClient } from '../../src/client/lib/query-client';
import { routes } from '../../src/client/app/router';
import { setCsrfToken } from '../../src/client/lib/api-client';
import { productRoleFor, type PublicUser } from '../../src/shared/schemas/auth';

type Handler = (req: { method: string; path: string; body: unknown; headers: Headers }) =>
  | {
      status?: number;
      data?: unknown;
      error?: { code: string; message: string; details?: unknown };
    }
  | undefined;

/** Stubs global fetch with a tiny router over `/api/v1/*`. Unhandled calls fail loudly. */
export function mockApi(handler: Handler) {
  const calls: { method: string; path: string; body: unknown; headers: Headers }[] = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = new URL(String(input), 'http://localhost');
    const req = {
      method: (init.method ?? 'GET').toUpperCase(),
      path: url.pathname.replace(/^\/api\/v1/, '') + url.search,
      body:
        init.body instanceof FormData
          ? init.body
          : init.body
            ? JSON.parse(String(init.body))
            : undefined,
      headers: new Headers(init.headers),
    };
    calls.push(req);
    const result = handler(req);
    if (!result) throw new Error(`Unhandled API call ${req.method} ${req.path}`);
    const status = result.status ?? (result.error ? 400 : 200);
    const body = result.error
      ? { error: result.error, meta: { requestId: 'req_test' } }
      : { data: result.data, meta: { requestId: 'req_test' } };
    return Response.json(body, { status });
  });
  vi.stubGlobal('fetch', fetchMock);
  return { calls, fetchMock };
}

export const anonymous = {
  status: 401,
  error: { code: 'UNAUTHENTICATED', message: 'Vui lòng đăng nhập.' },
};

export function sessionOf(user: Partial<PublicUser> & Pick<PublicUser, 'role'>) {
  return {
    data: {
      user: {
        id: 'u1',
        email: 'a@example.com',
        displayName: 'Nguyễn An',
        productRole: productRoleFor(user.role),
        ...user,
      },
      csrfToken: 'csrf-test-token',
    },
  };
}

export function renderRoute(path: string) {
  setCsrfToken(null);
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  const view = render(
    <QueryClientProvider client={createQueryClient()}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return { router, ...view };
}
