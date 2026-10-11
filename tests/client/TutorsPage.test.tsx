import { cleanup, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PublicTutor } from '../../src/shared/schemas/discovery';
import { anonymous, mockApi, renderRoute } from './helpers';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const SUBJECTS = [
  { id: 'subj_math', slug: 'toan', name: 'Toán' },
  { id: 'subj_english', slug: 'tieng-anh', name: 'Tiếng Anh' },
];

function tutor(i: number): PublicTutor {
  return {
    id: `t${i}`,
    slug: `gia-su-${i}`,
    displayName: `Gia sư ${i}`,
    bio: 'Giới thiệu ngắn',
    hourlyRateMinor: 100_000 * i,
    currency: 'VND',
    teachesOnline: true,
    teachesOffline: i % 2 === 0,
    subjects: [SUBJECTS[0]!],
  };
}

describe('TutorsPage', () => {
  it('passes URL filters to the API and renders tutor cards', async () => {
    const { calls } = mockApi((req) => {
      if (req.path === '/me') return anonymous;
      if (req.path === '/subjects') return { data: SUBJECTS };
      if (req.path.startsWith('/tutors?')) {
        return { data: { items: [tutor(1), tutor(2)], page: 1, pageSize: 12, total: 2 } };
      }
      return undefined;
    });
    renderRoute('/tutors?subject=toan&mode=online&minRate=100000');
    expect(await screen.findByRole('link', { name: 'Gia sư 1' })).toBeTruthy();
    expect(screen.getByText('2 gia sư')).toBeTruthy();
    const search = calls.find((c) => c.path.startsWith('/tutors?'))!;
    const params = new URLSearchParams(search.path.split('?')[1]);
    expect(Object.fromEntries(params)).toEqual({
      subject: 'toan',
      mode: 'online',
      minRate: '100000',
    });
    // Filter inputs restored from the URL.
    expect((screen.getByLabelText('Hình thức') as HTMLSelectElement).value).toBe('online');
    expect((screen.getByLabelText(/Giá từ/) as HTMLInputElement).value).toBe('100000');
    expect(screen.queryByText(/sao|đánh giá|review/i)).toBeNull();
  });

  it('applies filters through the URL and resets to page 1', async () => {
    mockApi((req) => {
      if (req.path === '/me') return anonymous;
      if (req.path === '/subjects') return { data: SUBJECTS };
      if (req.path.startsWith('/tutors'))
        return { data: { items: [tutor(1)], page: 1, pageSize: 12, total: 1 } };
      return undefined;
    });
    const { router } = renderRoute('/tutors?page=3');
    const user = userEvent.setup();
    await screen.findByRole('link', { name: 'Gia sư 1' });
    await user.selectOptions(await screen.findByLabelText('Môn học'), 'tieng-anh');
    await user.click(screen.getByRole('button', { name: 'Lọc' }));
    await waitFor(() =>
      expect(router.state.location.search).toBe('?subject=tieng-anh&sort=rate_asc'),
    );
  });

  it('shows an empty state with a clear-filters action', async () => {
    mockApi((req) => {
      if (req.path === '/me') return anonymous;
      if (req.path === '/subjects') return { data: SUBJECTS };
      if (req.path.startsWith('/tutors'))
        return { data: { items: [], page: 1, pageSize: 12, total: 0 } };
      return undefined;
    });
    const { router } = renderRoute('/tutors?subject=toan');
    const user = userEvent.setup();
    expect(await screen.findByText('Không có gia sư phù hợp')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Xóa bộ lọc' }));
    await waitFor(() => expect(router.state.location.search).toBe(''));
  });

  it('shows an error with retry', async () => {
    let fail = true;
    mockApi((req) => {
      if (req.path === '/me') return anonymous;
      if (req.path === '/subjects') return { data: SUBJECTS };
      if (req.path.startsWith('/tutors')) {
        return fail
          ? {
              status: 422,
              error: { code: 'VALIDATION_ERROR', message: 'Tham số truy vấn không hợp lệ.' },
            }
          : { data: { items: [tutor(1)], page: 1, pageSize: 12, total: 1 } };
      }
      return undefined;
    });
    renderRoute('/tutors');
    const user = userEvent.setup();
    expect(await screen.findByText('Không tải được danh sách gia sư')).toBeTruthy();
    fail = false;
    await user.click(screen.getByRole('button', { name: 'Thử lại' }));
    expect(await screen.findByRole('link', { name: 'Gia sư 1' })).toBeTruthy();
  });

  it('paginates', async () => {
    mockApi((req) => {
      if (req.path === '/me') return anonymous;
      if (req.path === '/subjects') return { data: SUBJECTS };
      if (req.path.startsWith('/tutors')) {
        const page = Number(new URLSearchParams(req.path.split('?')[1] ?? '').get('page') ?? 1);
        return { data: { items: [tutor(page)], page, pageSize: 1, total: 2 } };
      }
      return undefined;
    });
    const { router } = renderRoute('/tutors');
    const user = userEvent.setup();
    await screen.findByText('Trang 1/2');
    expect(
      (screen.getByRole('button', { name: 'Trang trước' }) as HTMLButtonElement).disabled,
    ).toBe(true);
    await user.click(screen.getByRole('button', { name: 'Trang sau' }));
    await waitFor(() => expect(router.state.location.search).toBe('?page=2'));
    expect(await screen.findByText('Trang 2/2')).toBeTruthy();
  });
});

describe('TutorDetailPage', () => {
  it('renders the public profile', async () => {
    mockApi((req) => {
      if (req.path === '/me') return anonymous;
      if (req.path === '/tutors/gia-su-2') return { data: tutor(2) };
      return undefined;
    });
    renderRoute('/tutors/gia-su-2');
    expect(await screen.findByRole('heading', { name: 'Gia sư 2' })).toBeTruthy();
    expect(screen.getByText('Trực tuyến · Trực tiếp')).toBeTruthy();
    expect(screen.getByText('Toán')).toBeTruthy();
  });

  it('renders a not-found state for hidden or unknown tutors', async () => {
    mockApi((req) => {
      if (req.path === '/me') return anonymous;
      if (req.path === '/tutors/an')
        return {
          status: 404,
          error: { code: 'TUTOR_NOT_FOUND', message: 'Không tìm thấy gia sư.' },
        };
      return undefined;
    });
    renderRoute('/tutors/an');
    expect(await screen.findByText('Không tìm thấy gia sư')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Xem danh sách gia sư' })).toBeTruthy();
  });
});
