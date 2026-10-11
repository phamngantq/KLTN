import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mockApi, renderRoute, sessionOf } from './helpers';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const WEEKLY = {
  timezone: 'Asia/Ho_Chi_Minh',
  rules: [
    { id: 'r1', weekday: 1, start: '18:00', end: '20:00', effectiveFrom: null, effectiveTo: null },
  ],
};

function setup(overrides: { put?: unknown; exceptions?: unknown[]; post?: unknown } = {}) {
  return mockApi((req) => {
    if (req.path === '/me') return sessionOf({ role: 'tutor' });
    if (req.path === '/tutor/availability' && req.method === 'GET') return { data: WEEKLY };
    if (req.path === '/tutor/availability' && req.method === 'PUT') {
      return { data: overrides.put ?? { ...WEEKLY, affectedBookings: 0 } };
    }
    if (req.path === '/tutor/availability/exceptions' && req.method === 'GET') {
      return { data: { timezone: 'Asia/Ho_Chi_Minh', exceptions: overrides.exceptions ?? [] } };
    }
    if (req.path === '/tutor/availability/exceptions' && req.method === 'POST') {
      return {
        status: 201,
        data: overrides.post ?? {
          exception: { id: 'e1', ...(req.body as object) },
          affectedBookings: 0,
        },
      };
    }
    if (req.path.startsWith('/tutor/availability/exceptions/') && req.method === 'DELETE') {
      return { data: { deleted: true, affectedBookings: 0 } };
    }
    return undefined;
  });
}

describe('weekly schedule editor', () => {
  it('shows rules per weekday and enables Save only when changed', async () => {
    setup();
    renderRoute('/tutor/availability');
    const start = await screen.findByLabelText('Thứ Hai: giờ bắt đầu');
    expect((start as HTMLSelectElement).value).toBe('18:00');
    expect(screen.getAllByText('Không dạy')).toHaveLength(6);
    expect(screen.getByText('Asia/Ho_Chi_Minh')).toBeTruthy();
    const save = screen.getByRole('button', { name: 'Lưu lịch tuần' }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    await userEvent.setup().selectOptions(start, '17:00');
    expect(save.disabled).toBe(false);
    expect(screen.getByText('Có thay đổi chưa lưu')).toBeTruthy();
  });

  it('flags overlapping and inverted windows and blocks saving', async () => {
    setup();
    renderRoute('/tutor/availability');
    const user = userEvent.setup();
    await screen.findByLabelText('Thứ Hai: giờ bắt đầu');
    const mondayRow = screen.getByRole('heading', { name: 'Thứ Hai' }).closest('li')!;
    await user.click(within(mondayRow).getByRole('button', { name: '+ Thêm khung giờ' }));
    const starts = within(mondayRow).getAllByLabelText('Thứ Hai: giờ bắt đầu');
    await user.selectOptions(starts[1]!, '19:00');
    expect(within(mondayRow).getAllByText('Trùng với khung giờ khác.').length).toBeGreaterThan(0);
    expect(
      (screen.getByRole('button', { name: 'Lưu lịch tuần' }) as HTMLButtonElement).disabled,
    ).toBe(true);

    await user.selectOptions(starts[1]!, '21:00');
    const ends = within(mondayRow).getAllByLabelText('Thứ Hai: giờ kết thúc');
    await user.selectOptions(ends[1]!, '20:30');
    expect(within(mondayRow).getByText('Giờ bắt đầu phải trước giờ kết thúc.')).toBeTruthy();
  });

  it('saves via PUT and warns about affected bookings without claiming they were cancelled', async () => {
    const { calls } = setup({ put: { ...WEEKLY, affectedBookings: 2 } });
    renderRoute('/tutor/availability');
    const user = userEvent.setup();
    const tuesdayRow = (await screen.findByRole('heading', { name: 'Thứ Ba' })).closest('li')!;
    await user.click(within(tuesdayRow).getByRole('button', { name: '+ Thêm khung giờ' }));
    await user.click(screen.getByRole('button', { name: 'Lưu lịch tuần' }));
    expect(await screen.findByText(/2 buổi học đã đặt không còn nằm trong lịch mới/)).toBeTruthy();
    expect(screen.getByText('không bị hủy tự động')).toBeTruthy();
    const put = calls.find((c) => c.method === 'PUT')!;
    expect(put.body).toEqual({
      timezone: 'Asia/Ho_Chi_Minh',
      rules: expect.arrayContaining([
        { weekday: 1, start: '18:00', end: '20:00', effectiveFrom: null, effectiveTo: null },
        { weekday: 2, start: '18:00', end: '19:00', effectiveFrom: null, effectiveTo: null },
      ]),
    });
  });

  it('can undo unsaved changes', async () => {
    setup();
    renderRoute('/tutor/availability');
    const user = userEvent.setup();
    const remove = await screen.findByRole('button', { name: /Xóa khung 18:00–20:00 Thứ Hai/ });
    await user.click(remove);
    expect(screen.getAllByText('Không dạy')).toHaveLength(7);
    await user.click(screen.getByRole('button', { name: 'Hoàn tác thay đổi' }));
    expect(screen.getAllByText('Không dạy')).toHaveLength(6);
  });
});

describe('exceptions panel', () => {
  it('lists exceptions and adds a whole-day closure without times', async () => {
    const { calls } = setup({
      exceptions: [{ id: 'e0', date: '2099-01-02', kind: 'extra', start: '08:00', end: '10:00' }],
    });
    renderRoute('/tutor/availability');
    const user = userEvent.setup();
    expect(await screen.findByText('02/01/2099')).toBeTruthy();
    expect(screen.getByText('Mở thêm')).toBeTruthy();
    const dateInput = screen.getByLabelText(/^Ngày/) as HTMLInputElement;
    await user.clear(dateInput);
    await user.type(dateInput, '2099-02-01');
    await user.click(screen.getByRole('button', { name: 'Thêm ngoại lệ' }));
    await waitFor(() => expect(calls.some((c) => c.method === 'POST')).toBe(true));
    expect(calls.find((c) => c.method === 'POST')!.body).toEqual({
      date: '2099-02-01',
      kind: 'closed',
    });
    expect(await screen.findByText('Đã thêm ngoại lệ.')).toBeTruthy();
  });

  it('confirms before deleting an exception', async () => {
    const { calls } = setup({
      exceptions: [{ id: 'e0', date: '2099-01-02', kind: 'closed', start: null, end: null }],
    });
    renderRoute('/tutor/availability');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Xóa ngoại lệ ngày 02/01/2099' }));
    expect(await screen.findByRole('heading', { name: 'Xóa ngoại lệ?' })).toBeTruthy();
    expect(calls.some((c) => c.method === 'DELETE')).toBe(false);
    await user.click(screen.getByRole('button', { name: 'Xóa ngoại lệ' }));
    await waitFor(() =>
      expect(calls.find((c) => c.method === 'DELETE')?.path).toBe(
        '/tutor/availability/exceptions/e0',
      ),
    );
  });
});
