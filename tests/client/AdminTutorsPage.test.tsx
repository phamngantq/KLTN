import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
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
  it('uploads the scan of the contract the tutor signed at the centre', async () => {
    let saved: unknown = null;
    const { calls } = mockApi((req) => {
      if (req.path === '/me') return sessionOf({ role: 'admin' });
      if (req.path.startsWith('/admin/tutors?'))
        return { data: { items: [TUTOR], page: 1, pageSize: 20, total: 1 } };
      if (req.path === '/admin/tutors/t1/signed-contract' && req.method === 'GET')
        return { data: saved };
      if (req.path === '/admin/tutors/t1/signed-contract' && req.method === 'POST') {
        saved = {
          contractNumber: '015/HĐNT-ĐH',
          signedOn: '2026-10-15',
          fileName: 'hop-dong.pdf',
          contentType: 'application/pdf',
          sizeBytes: 9,
          uploadedAt: '2026-10-16T02:00:00.000Z',
        };
        return { status: 201, data: saved };
      }
      return undefined;
    });
    renderRoute('/admin/tutors');
    const user = userEvent.setup();
    await user.click(await screen.findByText('Hợp đồng đã ký (bản scan)'));
    expect(await screen.findByText('Chưa tải lên hợp đồng đã ký.')).toBeTruthy();
    const upload = screen.getByRole('button', { name: 'Tải lên bản scan' });
    expect((upload as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText(/Ngày ký/), { target: { value: '2026-10-15' } });
    await user.type(screen.getByLabelText(/Số hợp đồng/), '015/HĐNT-ĐH');
    await user.upload(
      screen.getByLabelText(/Tệp scan/),
      new File(['%PDF-1.4'], 'hop-dong.pdf', { type: 'application/pdf' }),
    );
    await user.click(upload);
    expect(await screen.findByText('Đã lưu bản scan hợp đồng đã ký.')).toBeTruthy();
    const post = calls.find((c) => c.method === 'POST')!;
    expect(post.body).toBeInstanceOf(FormData);
    expect((post.body as FormData).get('signedOn')).toBe('2026-10-15');
    expect((post.body as FormData).get('contractNumber')).toBe('015/HĐNT-ĐH');
    expect(screen.getByRole('link', { name: 'hop-dong.pdf' }).getAttribute('href')).toBe(
      '/api/v1/admin/tutors/t1/signed-contract/file',
    );
    expect(screen.getByRole('button', { name: 'Thay bản scan' })).toBeTruthy();
  });

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
