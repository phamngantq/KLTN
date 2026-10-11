import { cleanup, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { anonymous, mockApi, renderRoute, sessionOf } from './helpers';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const TUTOR_ID = '11111111-1111-4111-8111-111111111111';
const TUTOR = {
  id: TUTOR_ID,
  slug: 'gia-su-an',
  displayName: 'Gia sư An',
  bio: 'Giới thiệu',
  hourlyRateMinor: 200_000,
  currency: 'VND',
  teachesOnline: true,
  teachesOffline: false,
  subjects: [],
};
const SLOT = { startUtc: '2099-01-05T11:00:00.000Z', endUtc: '2099-01-05T12:00:00.000Z' };

function api(me: unknown, onBook?: (body: unknown) => unknown) {
  return mockApi((req) => {
    if (req.path === '/me') return me as never;
    if (req.path === '/tutors/gia-su-an') return { data: TUTOR };
    if (req.path.startsWith(`/tutors/${TUTOR_ID}/slots`)) {
      return {
        data: {
          tutorId: TUTOR_ID,
          timezone: 'Asia/Ho_Chi_Minh',
          duration: 60,
          from: '2099-01-05',
          to: '2099-01-11',
          slots: [SLOT],
        },
      };
    }
    if (req.path === '/bookings' && req.method === 'POST' && onBook)
      return onBook(req.body) as never;
    return undefined;
  });
}

async function pickSlot() {
  const user = userEvent.setup();
  await user.click(await screen.findByRole('button', { name: '18:00–19:00' }));
  return user;
}

describe('booking request flow', () => {
  it('asks guests to sign in and preserves the return path', async () => {
    api(anonymous);
    renderRoute('/tutors/gia-su-an');
    await pickSlot();
    const link = screen.getByRole('link', { name: 'Đăng nhập để đặt lịch' });
    expect(link.getAttribute('href')).toBe(
      `/sign-in?next=${encodeURIComponent('/tutors/gia-su-an')}`,
    );
  });

  it('explains that only students can book', async () => {
    api(sessionOf({ role: 'tutor' }));
    renderRoute('/tutors/gia-su-an');
    await pickSlot();
    expect(screen.getByText('Chỉ tài khoản học viên mới có thể đặt lịch.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Gửi yêu cầu đặt lịch' })).toBeNull();
  });

  it('confirms with the cancellation policy, then shows the server-confirmed PENDING booking', async () => {
    const { calls } = api(sessionOf({ role: 'student' }), () => ({
      status: 201,
      data: {
        id: 'abcdef12-0000-4000-8000-000000000000',
        tutorId: TUTOR_ID,
        studentId: 'u1',
        tutorName: 'Gia sư An',
        studentName: 'Nguyễn An',
        startsAtUtc: SLOT.startUtc,
        endsAtUtc: SLOT.endUtc,
        durationMinutes: 60,
        status: 'PENDING',
        hourlyRateMinor: 200_000,
        priceMinor: 200_000,
        currency: 'VND',
        createdAt: '2099-01-01T00:00:00.000Z',
        updatedAt: '2099-01-01T00:00:00.000Z',
      },
    }));
    renderRoute('/tutors/gia-su-an');
    const user = await pickSlot();
    await user.click(screen.getByRole('button', { name: 'Gửi yêu cầu đặt lịch' }));
    expect(
      await screen.findByRole('heading', { name: 'Xác nhận gửi yêu cầu đặt lịch' }),
    ).toBeTruthy();
    expect(screen.getByText(/Có thể hủy yêu cầu/)).toBeTruthy();
    expect(calls.some((c) => c.path === '/bookings')).toBe(false);

    await user.click(screen.getByRole('button', { name: 'Gửi yêu cầu' }));
    expect(await screen.findByText('Đã gửi yêu cầu đặt lịch')).toBeTruthy();
    expect(screen.getByText('ABCDEF12')).toBeTruthy();
    expect(screen.getByText('Chờ xác nhận')).toBeTruthy();
    expect(calls.find((c) => c.path === '/bookings')!.body).toEqual({
      tutorId: TUTOR_ID,
      startUtc: SLOT.startUtc,
      durationMinutes: 60,
    });
  });

  it('on 409 shows an inline error, reloads slots and clears the selection', async () => {
    const { calls } = api(sessionOf({ role: 'student' }), () => ({
      status: 409,
      error: {
        code: 'SLOT_UNAVAILABLE',
        message: 'Khung giờ này vừa được đặt. Vui lòng chọn giờ khác.',
      },
    }));
    renderRoute('/tutors/gia-su-an');
    const user = await pickSlot();
    const slotCallsBefore = calls.filter((c) => c.path.includes('/slots')).length;
    await user.click(screen.getByRole('button', { name: 'Gửi yêu cầu đặt lịch' }));
    await user.click(await screen.findByRole('button', { name: 'Gửi yêu cầu' }));
    expect(await screen.findByText(/vừa được người khác đặt/)).toBeTruthy();
    expect(screen.queryByText('Đã gửi yêu cầu đặt lịch')).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Khung giờ đã chọn' })).toBeNull();
    await waitFor(() =>
      expect(calls.filter((c) => c.path.includes('/slots')).length).toBeGreaterThan(
        slotCallsBefore,
      ),
    );
  });

  it('sends an Idempotency-Key and reuses it when retrying after a network failure', async () => {
    let attempts = 0;
    const { calls } = api(sessionOf({ role: 'student' }), () => {
      attempts += 1;
      if (attempts === 1) throw new TypeError('network down');
      return {
        status: 201,
        data: {
          id: 'abcdef12-0000-4000-8000-000000000000',
          tutorId: TUTOR_ID,
          studentId: 'u1',
          tutorName: 'Gia sư An',
          studentName: 'Nguyễn An',
          startsAtUtc: SLOT.startUtc,
          endsAtUtc: SLOT.endUtc,
          durationMinutes: 60,
          status: 'PENDING',
          hourlyRateMinor: 200_000,
          priceMinor: 200_000,
          currency: 'VND',
          createdAt: '2099-01-01T00:00:00.000Z',
          updatedAt: '2099-01-01T00:00:00.000Z',
        },
      };
    });
    renderRoute('/tutors/gia-su-an');
    const user = await pickSlot();
    await user.click(screen.getByRole('button', { name: 'Gửi yêu cầu đặt lịch' }));
    await user.click(await screen.findByRole('button', { name: 'Gửi yêu cầu' }));
    expect(await screen.findByText('Đã gửi yêu cầu đặt lịch', {}, { timeout: 3000 })).toBeTruthy();
    const posts = calls.filter((c) => c.path === '/bookings');
    expect(posts).toHaveLength(2);
    const keys = posts.map((c) => c.headers.get('Idempotency-Key'));
    expect(keys[0]).toMatch(/^bk-/);
    expect(keys[1]).toBe(keys[0]);
  });
});
