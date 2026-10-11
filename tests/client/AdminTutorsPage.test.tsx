import { cleanup, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AdminTutor } from '../../src/shared/schemas/admin';
import { mockApi, renderRoute, sessionOf } from './helpers';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const TUTOR: AdminTutor = {
  userId: 't1',
  slug: 'gia-su-an-abc123',
  displayName: 'Gia sư An',
  email: 'an@example.com',
  bio: 'Kinh nghiệm 5 năm',
  hourlyRateMinor: 200_000,
  teachesOnline: true,
  teachesOffline: false,
  subjects: [{ id: 'subj_math', slug: 'toan', name: 'Toán' }],
  approvalStatus: 'pending',
  visibility: 'private',
  moderationNote: null,
  updatedAt: '2099-01-01T00:00:00.000Z',
};

function setup(onAction?: (path: string, body: unknown) => unknown) {
  return mockApi((req) => {
    if (req.path === '/me') return sessionOf({ role: 'admin' });
    if (req.path.startsWith('/admin/tutors?'))
      return { data: { items: [TUTOR], page: 1, pageSize: 20, total: 1 } };
    if (req.path.startsWith('/admin/tutors/') && req.method === 'POST' && onAction) {
      return onAction(req.path, req.body) as never;
    }
    return undefined;
  });
}

describe('AdminTutorsPage', () => {
  it('shows the pending queue with tutor details', async () => {
    const { calls } = setup();
    renderRoute('/admin/tutors');
    expect(await screen.findByRole('heading', { name: 'Gia sư An' })).toBeTruthy();
    expect(screen.getByText('an@example.com')).toBeTruthy();
    expect(screen.getByText(/Toán · Trực tuyến/)).toBeTruthy();
    expect(calls.some((c) => c.path.includes('status=pending'))).toBe(true);
  });

  it('approves after confirmation', async () => {
    const { calls } = setup(() => ({
      data: { ...TUTOR, approvalStatus: 'approved', visibility: 'public' },
    }));
    renderRoute('/admin/tutors');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Duyệt & công khai' }));
    const buttons = await screen.findAllByRole('button', { name: 'Duyệt & công khai' });
    await user.click(buttons[buttons.length - 1]!);
    expect(await screen.findByText('Duyệt & công khai: Gia sư An.')).toBeTruthy();
    const post = calls.find((c) => c.method === 'POST')!;
    expect(post.path).toBe('/admin/tutors/t1/approve');
    expect(post.body).toEqual({});
  });

  it('requires a reason to reject and sends it', async () => {
    const { calls } = setup(() => ({
      data: { ...TUTOR, approvalStatus: 'rejected', moderationNote: 'Thiếu bằng cấp' },
    }));
    renderRoute('/admin/tutors');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Từ chối' }));
    const confirm = () => screen.getAllByRole('button', { name: 'Từ chối' }).at(-1)!;
    await user.click(confirm());
    expect(await screen.findByText('Vui lòng nhập lý do.')).toBeTruthy();
    expect(calls.some((c) => c.method === 'POST')).toBe(false);
    await user.type(screen.getByLabelText(/Lý do/), 'Thiếu bằng cấp');
    await user.click(confirm());
    await waitFor(() =>
      expect(calls.find((c) => c.method === 'POST')?.body).toEqual({ reason: 'Thiếu bằng cấp' }),
    );
  });

  it('is forbidden for non-admins', async () => {
    mockApi((req) => (req.path === '/me' ? sessionOf({ role: 'tutor' }) : undefined));
    renderRoute('/admin/tutors');
    expect(await screen.findByText('Bạn không có quyền truy cập trang này')).toBeTruthy();
  });
});
