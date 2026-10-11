import { cleanup, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { BookingWithActions } from '../../src/shared/schemas/bookings';
import { mockApi, renderRoute, sessionOf } from './helpers';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function booking(overrides: Partial<BookingWithActions> = {}): BookingWithActions {
  return {
    id: 'aaaaaaaa-0000-4000-8000-000000000001',
    tutorId: 't1',
    studentId: 'u1',
    tutorName: 'Gia sư An',
    studentName: 'Học viên Bình',
    startsAtUtc: '2099-01-05T11:00:00.000Z',
    endsAtUtc: '2099-01-05T12:00:00.000Z',
    durationMinutes: 60,
    status: 'PENDING',
    hourlyRateMinor: 200_000,
    priceMinor: 200_000,
    currency: 'VND',
    createdAt: '2099-01-01T00:00:00.000Z',
    updatedAt: '2099-01-01T00:00:00.000Z',
    allowedActions: ['cancel'],
    ...overrides,
  };
}

const page = (items: BookingWithActions[], total = items.length) => ({
  data: { items, page: 1, pageSize: 10, total },
});

describe('student bookings dashboard', () => {
  it('requests the tab statuses for the signed-in student and shows the tutor', async () => {
    const { calls } = mockApi((req) => {
      if (req.path === '/me') return sessionOf({ role: 'student' });
      if (req.path.startsWith('/bookings?')) return page([booking()]);
      return undefined;
    });
    renderRoute('/student/bookings');
    expect(await screen.findByText(/Gia sư: Gia sư An/)).toBeTruthy();
    expect(screen.getByText('Chờ xác nhận', { selector: 'span' })).toBeTruthy();
    const query = new URLSearchParams(
      calls.find((c) => c.path.startsWith('/bookings?'))!.path.split('?')[1],
    );
    expect(query.get('status')).toBe('PENDING');
    expect(query.has('studentId')).toBe(false);
    expect(screen.getByRole('link', { name: 'Chờ xác nhận' }).getAttribute('aria-current')).toBe(
      'page',
    );
  });

  it('switches tabs through the URL and shows tab-specific empty states', async () => {
    const { calls } = mockApi((req) => {
      if (req.path === '/me') return sessionOf({ role: 'student' });
      if (req.path.startsWith('/bookings?')) return page([]);
      return undefined;
    });
    const { router } = renderRoute('/student/bookings');
    const user = userEvent.setup();
    expect(await screen.findByText('Không có yêu cầu nào đang chờ xác nhận.')).toBeTruthy();
    await user.click(screen.getByRole('link', { name: 'Đã hủy / từ chối' }));
    await waitFor(() => expect(router.state.location.search).toBe('?tab=cancelled'));
    expect(await screen.findByText('Không có buổi học bị hủy hoặc từ chối.')).toBeTruthy();
    expect(calls.some((c) => c.path.includes('status=CANCELLED%2CREJECTED%2CEXPIRED'))).toBe(true);
  });

  it('confirms before cancelling and only reflects the server-confirmed result', async () => {
    let cancelled = false;
    const { calls } = mockApi((req) => {
      if (req.path === '/me') return sessionOf({ role: 'student' });
      if (req.path.startsWith('/bookings?')) return page(cancelled ? [] : [booking()]);
      if (req.path.endsWith('/cancel') && req.method === 'POST') {
        cancelled = true;
        return { data: booking({ status: 'CANCELLED', allowedActions: [] }) };
      }
      return undefined;
    });
    renderRoute('/student/bookings');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Hủy buổi học' }));
    expect(await screen.findByRole('heading', { name: 'Hủy buổi học?' })).toBeTruthy();
    expect(screen.getByText(/Có thể hủy yêu cầu/)).toBeTruthy();
    expect(calls.some((c) => c.path.endsWith('/cancel'))).toBe(false);
    const dialogButtons = screen.getAllByRole('button', { name: 'Hủy buổi học' });
    await user.click(dialogButtons[dialogButtons.length - 1]!);
    expect(await screen.findByText(/thành công/)).toBeTruthy();
    expect(await screen.findByText('Không có yêu cầu nào đang chờ xác nhận.')).toBeTruthy();
  });

  it('shows server conflicts and keeps the list consistent', async () => {
    mockApi((req) => {
      if (req.path === '/me') return sessionOf({ role: 'tutor' });
      if (req.path.startsWith('/bookings?'))
        return page([booking({ allowedActions: ['confirm', 'reject', 'cancel'] })]);
      if (req.path.endsWith('/confirm')) {
        return {
          status: 409,
          error: {
            code: 'STALE_BOOKING',
            message: 'Lịch học vừa được cập nhật bởi người khác. Vui lòng tải lại.',
          },
        };
      }
      return undefined;
    });
    renderRoute('/tutor/bookings');
    const user = userEvent.setup();
    expect(await screen.findByText(/Học viên: Học viên Bình/)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Xác nhận' }));
    expect(
      await screen.findByText('Lịch học vừa được cập nhật bởi người khác. Vui lòng tải lại.'),
    ).toBeTruthy();
  });

  it('shows an error state with retry', async () => {
    mockApi((req) => {
      if (req.path === '/me') return sessionOf({ role: 'student' });
      if (req.path.startsWith('/bookings?'))
        return { status: 500, error: { code: 'INTERNAL_ERROR', message: 'Đã có lỗi xảy ra.' } };
      return undefined;
    });
    renderRoute('/student/bookings');
    expect(await screen.findByText('Không tải được danh sách', {}, { timeout: 3000 })).toBeTruthy();
  });

  it('keeps tutors out of the student dashboard', async () => {
    mockApi((req) => (req.path === '/me' ? sessionOf({ role: 'tutor' }) : undefined));
    renderRoute('/student/bookings');
    expect(await screen.findByText('Bạn không có quyền truy cập trang này')).toBeTruthy();
  });
});
