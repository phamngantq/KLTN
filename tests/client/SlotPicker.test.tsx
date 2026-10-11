import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { anonymous, mockApi, renderRoute } from './helpers';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const TUTOR = {
  id: '11111111-1111-4111-8111-111111111111',
  slug: 'gia-su-an',
  displayName: 'Gia sư An',
  bio: 'Giới thiệu',
  hourlyRateMinor: 200_000,
  currency: 'VND',
  teachesOnline: true,
  teachesOffline: false,
  subjects: [],
};

function slotsResponse(
  from: string,
  to: string,
  duration: number,
  slots: { startUtc: string; endUtc: string }[],
) {
  return { data: { tutorId: TUTOR.id, timezone: 'Asia/Ho_Chi_Minh', duration, from, to, slots } };
}

describe('SlotPicker on the tutor detail page', () => {
  it('groups slots by local date, shows the timezone and prices the selection', async () => {
    mockApi((req) => {
      if (req.path === '/me') return anonymous;
      if (req.path === '/tutors/gia-su-an') return { data: TUTOR };
      if (req.path.startsWith(`/tutors/${TUTOR.id}/slots`)) {
        return slotsResponse('2099-01-05', '2099-01-11', 60, [
          { startUtc: '2099-01-05T11:00:00.000Z', endUtc: '2099-01-05T12:00:00.000Z' },
          { startUtc: '2099-01-05T11:30:00.000Z', endUtc: '2099-01-05T12:30:00.000Z' },
          { startUtc: '2099-01-07T01:00:00.000Z', endUtc: '2099-01-07T02:00:00.000Z' },
        ]);
      }
      return undefined;
    });
    renderRoute('/tutors/gia-su-an');
    const user = userEvent.setup();
    const first = await screen.findByRole('button', { name: '18:00–19:00' });
    expect(screen.getByRole('button', { name: '18:30–19:30' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '08:00–09:00' })).toBeTruthy();
    expect(screen.getAllByRole('heading', { level: 3 })).toHaveLength(2);
    expect(screen.getByText('Asia/Ho_Chi_Minh')).toBeTruthy();

    await user.click(first);
    expect(first.getAttribute('aria-pressed')).toBe('true');
    const summary = screen.getByRole('heading', { name: 'Khung giờ đã chọn' }).closest('section')!;
    expect(within(summary).getByText(/Học phí dự kiến/).textContent).toMatch(/200\.000/);
  });

  it('requests the chosen duration and the next week', async () => {
    const { calls } = mockApi((req) => {
      if (req.path === '/me') return anonymous;
      if (req.path === '/tutors/gia-su-an') return { data: TUTOR };
      if (req.path.startsWith(`/tutors/${TUTOR.id}/slots`)) {
        const params = new URLSearchParams(req.path.split('?')[1] ?? '');
        const from = params.get('from') ?? '2099-01-05';
        return slotsResponse(
          from,
          from === '2099-01-05' ? '2099-01-11' : '2099-01-18',
          Number(params.get('duration') ?? 60),
          [],
        );
      }
      return undefined;
    });
    renderRoute('/tutors/gia-su-an');
    const user = userEvent.setup();
    expect(await screen.findByText('Không còn khung giờ trống trong khoảng này')).toBeTruthy();
    expect(
      (screen.getByRole('button', { name: '← Tuần trước' }) as HTMLButtonElement).disabled,
    ).toBe(true);

    await user.selectOptions(screen.getByLabelText('Thời lượng'), '90');
    await waitFor(() => expect(calls.some((c) => c.path.includes('duration=90'))).toBe(true));

    await user.click(screen.getByRole('button', { name: 'Tuần sau →' }));
    await waitFor(() => expect(calls.some((c) => c.path.includes('from=2099-01-12'))).toBe(true));
  });

  it('shows a retryable error', async () => {
    mockApi((req) => {
      if (req.path === '/me') return anonymous;
      if (req.path === '/tutors/gia-su-an') return { data: TUTOR };
      if (req.path.startsWith(`/tutors/${TUTOR.id}/slots`)) {
        return {
          status: 422,
          error: { code: 'BEYOND_HORIZON', message: 'Chỉ xem được lịch trong 30 ngày tới.' },
        };
      }
      return undefined;
    });
    renderRoute('/tutors/gia-su-an');
    expect(await screen.findByText('Không tải được lịch trống')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Thử lại' })).toBeTruthy();
  });
});
