import { cleanup, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  AdminTutorOfferJoin,
  ParentTutorOfferJoin,
} from '../../src/shared/schemas/tutor-offer-joins';
import type { PublicTutorOffer, TutorOffer } from '../../src/shared/schemas/tutor-offers';
import { mockApi, renderRoute, sessionOf } from './helpers';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const offerId = '00000000-0000-4000-8000-000000000099';
const joinId = '00000000-0000-4000-8000-000000000077';
const now = '2026-10-12T00:00:00.000Z';
const offer: PublicTutorOffer = {
  id: offerId,
  version: 3,
  tutorDisplayName: 'Nguyễn An',
  subjectId: 'math',
  subjectName: 'Toán',
  grade: 'Lớp 5',
  mode: 'online',
  area: null,
  proposedTuitionPerSessionMinor: 250_000,
  publishedAt: now,
};
const join: ParentTutorOfferJoin = {
  id: joinId,
  offerId,
  offerStatus: 'published',
  subjectName: 'Toán',
  offerGrade: 'Lớp 5',
  offerMode: 'online',
  proposedTuitionPerSessionMinor: 250_000,
  studentGrade: 'Lớp 5',
  learningNeeds: 'Cần ôn tập kiến thức Toán lớp 5.',
  teachingArea: null,
  status: 'submitted',
  version: 1,
  detailsConsentVersion: '2026-10-12-v1',
  detailsConsentedAt: now,
  contactConsentVersion: '2026-10-12-v1',
  contactConsentedAt: now,
  reviewedAt: null,
  rejectionReason: null,
  agreedTuitionPerSessionMinor: null,
  terminatedAt: null,
  terminalReason: null,
  createdAt: now,
  updatedAt: now,
};

describe('parent joins tutor-posted class', () => {
  it('requires separate study and future contact consent before submitting private phone', async () => {
    const { calls } = mockApi((req) => {
      if (req.path === '/me') return sessionOf({ role: 'student' });
      if (req.path === `/tutor-offers/${offerId}`) return { data: offer };
      if (req.path === `/parent/tutor-offer-joins?offerId=${offerId}&page=1&pageSize=1`)
        return { data: { items: [], total: 0, page: 1, pageSize: 1 } };
      if (req.path === `/tutor-offers/${offerId}/join-requests` && req.method === 'POST') {
        return { status: 201, data: join };
      }
      return undefined;
    });
    renderRoute(`/parent/lop-tim-hoc-vien/${offerId}`);
    const user = userEvent.setup();
    const submit = (await screen.findByRole('button', {
      name: 'Gửi yêu cầu tham gia lớp',
    })) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    await user.type(
      screen.getByRole('textbox', { name: 'Nhu cầu học tập' }),
      'Cần ôn tập kiến thức Toán lớp 5.',
    );
    await user.type(
      screen.getByRole('textbox', { name: 'Số điện thoại liên hệ riêng' }),
      '0912345678',
    );
    await user.click(screen.getByRole('checkbox', { name: /Tôi đồng ý chia sẻ lớp học/ }));
    expect(submit.disabled).toBe(true);
    await user.click(
      screen.getByRole('checkbox', { name: /Tôi đồng ý chia sẻ số điện thoại của tôi/ }),
    );
    await user.click(submit);
    expect(await screen.findByText('Yêu cầu đã được ghi nhận trên hệ thống.')).toBeTruthy();
    expect(
      calls.find((call) => call.path.endsWith('/join-requests') && call.method === 'POST')?.body,
    ).toEqual({
      offerVersion: 3,
      studentGrade: 'Lớp 5',
      learningNeeds: 'Cần ôn tập kiến thức Toán lớp 5.',
      teachingArea: null,
      contactPhone: '0912345678',
      shareApplicationDetailsConsent: true,
      shareContactAfterApprovalConsent: true,
    });
    expect(calls.some((call) => call.path.endsWith('/contact'))).toBe(false);
  });

  it('shows an existing live join instead of a second submit form', async () => {
    const { calls } = mockApi((req) => {
      if (req.path === '/me') return sessionOf({ role: 'student' });
      if (req.path === `/tutor-offers/${offerId}`) return { data: offer };
      if (req.path === `/parent/tutor-offer-joins?offerId=${offerId}&page=1&pageSize=1`)
        return { data: { items: [join], total: 1, page: 1, pageSize: 1 } };
      return undefined;
    });
    renderRoute(`/parent/lop-tim-hoc-vien/${offerId}`);
    expect(await screen.findByText('Yêu cầu của bạn đang chờ kiểm duyệt')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Xem yêu cầu của tôi' }).getAttribute('href')).toBe(
      `/parent/tutor-offer-joins/${joinId}`,
    );
    expect(screen.queryByRole('button', { name: 'Gửi yêu cầu tham gia lớp' })).toBeNull();
    expect(calls.some((call) => call.method === 'POST')).toBe(false);
  });

  it('keeps contact gated until approval and only loads it when parent asks', async () => {
    let current = join;
    const { calls } = mockApi((req) => {
      if (req.path === '/me') return sessionOf({ role: 'student' });
      if (req.path === `/parent/tutor-offer-joins/${joinId}`) return { data: current };
      if (req.path === `/parent/tutor-offer-joins/${joinId}/contact`)
        return { data: { phone: '0987654321' } };
      return undefined;
    });
    const first = renderRoute(`/parent/tutor-offer-joins/${joinId}`);
    expect(await screen.findByText('Chờ kiểm duyệt')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Xem số điện thoại gia sư' })).toBeNull();
    expect(calls.some((call) => call.path.endsWith('/contact'))).toBe(false);
    first.unmount();
    current = {
      ...join,
      status: 'approved',
      version: 2,
      agreedTuitionPerSessionMinor: 270_000,
      reviewedAt: now,
    };
    const approvedView = renderRoute(`/parent/tutor-offer-joins/${joinId}`);
    expect(await screen.findByText(/270\.000/)).toBeTruthy();
    expect(calls.some((call) => call.path.endsWith('/contact'))).toBe(false);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Xem số điện thoại gia sư' }));
    expect(await screen.findByRole('link', { name: '0987654321' })).toBeTruthy();
    expect(calls.filter((call) => call.path.endsWith('/contact'))).toHaveLength(1);
    approvedView.unmount();
    current = {
      ...current,
      status: 'completed',
      version: 3,
      terminalReason: 'Đã kết thúc buổi học.',
      terminatedAt: now,
    };
    renderRoute(`/parent/tutor-offer-joins/${joinId}`);
    expect((await screen.findAllByText('Đã hoàn tất')).length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: 'Xem số điện thoại gia sư' })).toBeNull();
    expect(calls.filter((call) => call.path.endsWith('/contact'))).toHaveLength(1);
  });

  it('requires agreed tuition and attestation for moderator approval, then can complete with reason', async () => {
    let current: AdminTutorOfferJoin = {
      ...join,
      parentUserId: 'parent-1',
      parentDisplayName: 'Phụ huynh A',
      tutorUserId: 'tutor-1',
      reviewedBy: null,
      terminatedBy: null,
    };
    const { calls } = mockApi((req) => {
      if (req.path === '/me') return sessionOf({ role: 'admin' });
      if (
        req.path === '/admin/tutor-offer-joins?status=submitted&page=1&pageSize=12' ||
        req.path === '/admin/tutor-offer-joins?status=approved&page=1&pageSize=12'
      ) {
        const status = req.path.includes('status=approved') ? 'approved' : 'submitted';
        return {
          data: {
            items: current.status === status ? [current] : [],
            total: current.status === status ? 1 : 0,
            page: 1,
            pageSize: 12,
          },
        };
      }
      if (req.path === `/admin/tutor-offer-joins/${joinId}`)
        return {
          data: { ...current, parentContactPhone: '0912345678', tutorContactPhone: '0987654321' },
        };
      if (req.path === `/admin/tutor-offer-joins/${joinId}/approve` && req.method === 'POST') {
        current = {
          ...current,
          status: 'approved',
          version: 2,
          agreedTuitionPerSessionMinor: 270_000,
          reviewedAt: now,
        };
        return { data: current };
      }
      if (req.path === `/admin/tutor-offer-joins/${joinId}/complete` && req.method === 'POST') {
        current = {
          ...current,
          status: 'completed',
          version: 3,
          terminalReason: 'Hai bên đã kết thúc quá trình học.',
          terminatedAt: now,
        };
        return { data: current };
      }
      return undefined;
    });
    renderRoute('/admin/tutor-offer-joins');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Duyệt yêu cầu' }));
    expect(await screen.findByText(/Số điện thoại phụ huynh: 0912345678/)).toBeTruthy();
    await user.click(screen.getAllByRole('button', { name: 'Duyệt yêu cầu' }).at(-1)!);
    expect(
      screen.getByText('Nhập học phí đã chốt từ 1 đến 100.000.000 VNĐ mỗi buổi.'),
    ).toBeTruthy();
    await user.type(
      screen.getByRole('spinbutton', { name: 'Học phí đã chốt (VNĐ/buổi)' }),
      '270000',
    );
    await user.click(screen.getByRole('checkbox', { name: /Tôi xác nhận phụ huynh và gia sư/ }));
    const approveButtons = screen.getAllByRole('button', { name: 'Duyệt yêu cầu' });
    await user.click(approveButtons[approveButtons.length - 1]!);
    await waitFor(() => expect(calls.some((call) => call.path.endsWith('/approve'))).toBe(true));
    expect(calls.find((call) => call.path.endsWith('/approve'))?.body).toEqual({
      version: 1,
      agreedTuitionPerSessionMinor: 270_000,
      partiesAgreed: true,
    });
    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Lọc theo trạng thái' }),
      'approved',
    );
    await user.click(await screen.findByRole('button', { name: 'Hoàn tất lớp' }));
    await user.type(
      screen.getByRole('textbox', { name: 'Lý do hoàn tất' }),
      'Hai bên đã kết thúc quá trình học.',
    );
    await user.click(screen.getByRole('button', { name: 'Xác nhận hoàn tất' }));
    await waitFor(() => expect(calls.some((call) => call.path.endsWith('/complete'))).toBe(true));
    expect(calls.find((call) => call.path.endsWith('/complete'))?.body).toEqual({
      version: 2,
      reason: 'Hai bên đã kết thúc quá trình học.',
    });
  });

  it('shows consented study details to tutor and gates parent phone to approved joins', async () => {
    const ownOffer: TutorOffer = {
      ...offer,
      tutorUserId: 'u1',
      contactPhone: '0987654321',
      contactShareConsentVersion: '2026-10-12-v1',
      contactShareConsentAt: now,
      status: 'published',
      contractRevisionId: '00000000-0000-4000-8000-000000000088',
      contractRevision: 1,
      contractTitle: 'Hợp đồng',
      contractBodyText: 'Nội dung hợp đồng.',
      acknowledgedAt: now,
      reviewedBy: 'admin-1',
      reviewedAt: now,
      rejectionReason: null,
      createdAt: now,
      updatedAt: now,
    };
    const { calls } = mockApi((req) => {
      if (req.path === '/me') return sessionOf({ role: 'tutor' });
      if (req.path === `/tutor/offers/${offerId}`) return { data: ownOffer };
      if (req.path === `/tutor/offers/${offerId}/join-requests?page=1&pageSize=20`)
        return {
          data: {
            items: [
              {
                id: joinId,
                status: 'submitted',
                studentGrade: 'Lớp 5',
                learningNeeds: join.learningNeeds,
                teachingArea: 'Thanh Xuân',
                agreedTuitionPerSessionMinor: null,
                createdAt: now,
              },
              {
                id: 'approved-join',
                status: 'approved',
                studentGrade: 'Lớp 5',
                learningNeeds: 'Cần học Toán mỗi tuần hai buổi.',
                teachingArea: null,
                agreedTuitionPerSessionMinor: 270_000,
                createdAt: now,
              },
            ],
            total: 2,
            page: 1,
            pageSize: 20,
          },
        };
      if (req.path === `/tutor/offers/${offerId}/join-requests/approved-join/contact`)
        return { data: { phone: '0912345678' } };
      return undefined;
    });
    renderRoute(`/tutor/offers/${offerId}`);
    expect(await screen.findByText(join.learningNeeds)).toBeTruthy();
    expect(screen.getAllByText(/270\.000/).length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'Xem số điện thoại phụ huynh' })).toBeTruthy();
    expect(calls.some((call) => call.path.endsWith('/contact'))).toBe(false);
    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: 'Xem số điện thoại phụ huynh' }));
    expect(await screen.findByRole('link', { name: '0912345678' })).toBeTruthy();
    expect(calls.some((call) => call.path.endsWith(`/${joinId}/contact`))).toBe(false);
  });
});
