import { cleanup, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PublicTutorOffer, TutorOffer } from '../../src/shared/schemas/tutor-offers';
import { anonymous, mockApi, renderRoute, sessionOf } from './helpers';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const id = '00000000-0000-4000-8000-000000000099';
const contractId = '00000000-0000-4000-8000-000000000088';
const now = '2026-10-12T00:00:00.000Z';

const draft: TutorOffer = {
  id,
  tutorUserId: 'u1',
  tutorDisplayName: 'Nguyễn An',
  subjectId: 'math',
  subjectName: 'Toán',
  grade: 'Lớp 5',
  mode: 'online',
  area: null,
  proposedTuitionPerSessionMinor: 250_000,
  contactPhone: '0912345678',
  contactShareConsentVersion: null,
  contactShareConsentAt: null,
  status: 'draft',
  version: 1,
  contractRevisionId: null,
  contractRevision: null,
  contractTitle: null,
  contractBodyText: null,
  acknowledgedAt: null,
  reviewedBy: null,
  reviewedAt: null,
  rejectionReason: null,
  publishedAt: null,
  createdAt: now,
  updatedAt: now,
};

describe('tutor posted classes', () => {
  it('saves a tutor offer, requires contract acknowledgement, and submits it for review', async () => {
    let current = draft;
    const { calls } = mockApi((req) => {
      if (req.path === '/me') return sessionOf({ role: 'tutor' });
      if (req.path === '/subjects') return { data: [{ id: 'math', slug: 'toan', name: 'Toán' }] };
      if (req.path === '/tutor/offers' && req.method === 'POST')
        return { status: 201, data: current };
      if (req.path === `/tutor/offers/${id}` && req.method === 'GET') return { data: current };
      if (req.path === '/tutor/offers/contract')
        return {
          data: {
            id: contractId,
            revision: 2,
            title: 'Hợp đồng tìm học viên',
            bodyText: 'Nội dung hợp đồng.',
          },
        };
      if (req.path === `/tutor/offers/${id}/submit` && req.method === 'POST') {
        current = {
          ...current,
          status: 'pending',
          version: 2,
          contractRevisionId: contractId,
          contractRevision: 2,
          contractTitle: 'Hợp đồng tìm học viên',
          contractBodyText: 'Nội dung hợp đồng.',
          acknowledgedAt: now,
        };
        return { data: current };
      }
      return undefined;
    });
    const { router } = renderRoute('/tutor/offers/new');
    const user = userEvent.setup();
    await screen.findByRole('heading', { name: 'Đăng lớp tìm học viên' });
    await screen.findByRole('option', { name: 'Toán' });
    await user.selectOptions(screen.getByRole('combobox', { name: /Môn học/ }), 'math');
    await user.selectOptions(screen.getByRole('combobox', { name: /Lớp học/ }), 'Lớp 5');
    await user.type(screen.getByRole('spinbutton', { name: /Học phí đề xuất/ }), '250000');
    await user.type(screen.getByRole('textbox', { name: 'Số điện thoại liên hệ' }), '0912345678');
    await user.click(screen.getByRole('button', { name: 'Lưu bản nháp' }));
    await waitFor(() => expect(router.state.location.pathname).toBe(`/tutor/offers/${id}`));
    expect(await screen.findByText('Nội dung hợp đồng.')).toBeTruthy();
    const submit = screen.getByRole('button', {
      name: 'Xác nhận hợp đồng và gửi duyệt',
    }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    await user.click(
      screen.getByRole('checkbox', { name: /Tôi đã đọc và đồng ý hợp đồng phiên bản 2/ }),
    );
    expect(submit.disabled).toBe(true);
    await user.click(screen.getByRole('checkbox', { name: /Tôi đồng ý cho phụ huynh có yêu cầu/ }));
    await user.click(submit);
    expect(await screen.findByText('Đã gửi lớp và hợp đồng để kiểm duyệt.')).toBeTruthy();
    expect(
      calls.find((call) => call.path === '/tutor/offers' && call.method === 'POST')?.body,
    ).toEqual({
      subjectId: 'math',
      grade: 'Lớp 5',
      mode: 'online',
      area: null,
      proposedTuitionPerSessionMinor: 250_000,
      contactPhone: '0912345678',
    });
    expect(calls.find((call) => call.path.endsWith('/submit'))?.body).toEqual({
      version: 1,
      contractRevisionId: contractId,
      acknowledged: true,
      shareContactAfterApproval: true,
    });
    expect(await screen.findByText('Chờ kiểm duyệt hợp đồng')).toBeTruthy();
  });

  it('lets a moderator inspect the acknowledged contract before publishing', async () => {
    let current: TutorOffer = {
      ...draft,
      status: 'pending',
      version: 2,
      contractRevisionId: contractId,
      contractRevision: 2,
      contractTitle: 'Hợp đồng tìm học viên',
      contractBodyText: 'Điều khoản đã chốt.',
      acknowledgedAt: now,
    };
    const { calls } = mockApi((req) => {
      if (req.path === '/me') return sessionOf({ role: 'admin' });
      if (req.path === '/admin/tutor-offers?page=1&pageSize=12')
        return { data: { items: [current], total: 1, page: 1, pageSize: 12 } };
      if (req.path === `/admin/tutor-offers/${id}/approve` && req.method === 'POST') {
        current = {
          ...current,
          status: 'published',
          version: 3,
          reviewedBy: 'u1',
          reviewedAt: now,
          publishedAt: now,
        };
        return { data: current };
      }
      return undefined;
    });
    renderRoute('/admin/tutor-offers');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Xem hợp đồng và duyệt' }));
    expect(screen.getByText('Điều khoản đã chốt.')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Duyệt và công bố' }));
    expect(await screen.findByText('Đã duyệt hợp đồng và công bố lớp tìm học viên.')).toBeTruthy();
    expect(calls.find((call) => call.path.endsWith('/approve'))?.body).toEqual({ version: 2 });
  });

  it('shows only approved tutor offers in the independent parent browse', async () => {
    const publicOffer: PublicTutorOffer = {
      id,
      version: 3,
      tutorDisplayName: 'Nguyễn An',
      subjectId: 'math',
      subjectName: 'Toán',
      grade: 'Lớp 5',
      mode: 'offline',
      area: null,
      proposedTuitionPerSessionMinor: 250_000,
      publishedAt: now,
    };
    const { calls } = mockApi((req) => {
      if (req.path === '/me') return sessionOf({ role: 'student' });
      if (req.path === '/tutor-offers?page=1&pageSize=12')
        return { data: { items: [publicOffer], total: 1, page: 1, pageSize: 12 } };
      if (req.path === `/tutor-offers/${id}`) return { data: publicOffer };
      if (req.path === `/parent/tutor-offer-joins?offerId=${id}&page=1&pageSize=1`) {
        return { data: { items: [], total: 0, page: 1, pageSize: 1 } };
      }
      return undefined;
    });
    const { router } = renderRoute('/parent/lop-tim-hoc-vien');
    expect(await screen.findByRole('heading', { name: 'Lớp tìm học viên' })).toBeTruthy();
    expect(await screen.findByText('Trao đổi khu vực sau')).toBeTruthy();
    expect(screen.queryByText('Điều khoản đã chốt.')).toBeNull();
    await userEvent.setup().click(screen.getByRole('link', { name: 'Xem chi tiết' }));
    await waitFor(() =>
      expect(router.state.location.pathname).toBe(`/parent/lop-tim-hoc-vien/${id}`),
    );
    expect((await screen.findAllByText(/250\.000/)).length).toBeGreaterThan(0);
    expect(calls.some((call) => call.path.startsWith('/classes'))).toBe(false);
  });

  it('does not show unapproved offers on public list', async () => {
    mockApi((req) => {
      if (req.path === '/me') return anonymous;
      if (req.path === '/tutor-offers?page=1&pageSize=12')
        return { data: { items: [], total: 0, page: 1, pageSize: 12 } };
      return undefined;
    });
    renderRoute('/lop-tim-hoc-vien');
    expect(await screen.findByRole('heading', { name: 'Chưa có lớp tìm học viên' })).toBeTruthy();
  });
});
