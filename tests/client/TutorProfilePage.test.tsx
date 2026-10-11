import { cleanup, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TutorProfile } from '../../src/shared/schemas/tutors';
import { mockApi, renderRoute, sessionOf } from './helpers';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const SUBJECTS = [
  { id: 'subj_math', slug: 'toan', name: 'Toán' },
  { id: 'subj_english', slug: 'tieng-anh', name: 'Tiếng Anh' },
];

function profile(overrides: Partial<TutorProfile> = {}): TutorProfile {
  return {
    userId: 'u1',
    slug: 'nguyen-an-abc123',
    displayName: 'Nguyễn An',
    bio: 'Giới thiệu',
    hourlyRateMinor: 200_000,
    currency: 'VND',
    teachesOnline: true,
    teachesOffline: false,
    subjects: [SUBJECTS[0]!],
    approvalStatus: 'draft',
    visibility: 'private',
    missing: [],
    ...overrides,
  };
}

describe('TutorProfilePage', () => {
  it('loads the profile, saves edits and shows server-confirmed state', async () => {
    let current = profile({ missing: ['hourlyRate'], hourlyRateMinor: null });
    const { calls } = mockApi((req) => {
      if (req.path === '/me') return sessionOf({ role: 'tutor' });
      if (req.path === '/subjects') return { data: SUBJECTS };
      if (req.path === '/tutor/profile' && req.method === 'GET') return { data: current };
      if (req.path === '/tutor/profile' && req.method === 'PATCH') {
        current = profile({ hourlyRateMinor: 300_000 });
        return { data: current };
      }
      return undefined;
    });
    renderRoute('/tutor/profile');
    const user = userEvent.setup();

    expect(await screen.findByRole('heading', { name: 'Hồ sơ gia sư' })).toBeTruthy();
    expect(screen.getByText('Bản nháp')).toBeTruthy();
    expect(screen.getByText(/Còn thiếu: Học phí theo giờ/)).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Gửi duyệt' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    expect((screen.getByRole('button', { name: 'Lưu hồ sơ' }) as HTMLButtonElement).disabled).toBe(
      true,
    );

    await user.type(screen.getByLabelText(/Học phí/), '300000');
    expect(screen.getByText('Có thay đổi chưa lưu')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Lưu hồ sơ' }));

    expect(await screen.findByText('Đã lưu.')).toBeTruthy();
    const body = calls.find((c) => c.method === 'PATCH')?.body as Record<string, unknown>;
    expect(body).toMatchObject({ hourlyRateMinor: 300_000, subjectIds: ['subj_math'] });
    expect(body).not.toHaveProperty('approvalStatus');
    await waitFor(() =>
      expect(
        (screen.getByRole('button', { name: 'Gửi duyệt' }) as HTMLButtonElement).disabled,
      ).toBe(false),
    );
  });

  it('renders server field errors next to the field', async () => {
    mockApi((req) => {
      if (req.path === '/me') return sessionOf({ role: 'tutor' });
      if (req.path === '/subjects') return { data: SUBJECTS };
      if (req.path === '/tutor/profile' && req.method === 'GET') return { data: null };
      if (req.method === 'PATCH') {
        return {
          status: 422,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Dữ liệu không hợp lệ.',
            details: [{ path: 'hourlyRateMinor', message: 'Học phí phải là bội số của 1.000 ₫.' }],
          },
        };
      }
      return undefined;
    });
    renderRoute('/tutor/profile');
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText(/Học phí/), '250500');
    await user.click(screen.getByRole('button', { name: 'Lưu hồ sơ' }));
    expect(await screen.findByText('Học phí phải là bội số của 1.000 ₫.')).toBeTruthy();
    expect(screen.getByLabelText(/Học phí/).getAttribute('aria-invalid')).toBe('true');
  });

  it('submits a complete profile for review', async () => {
    mockApi((req) => {
      if (req.path === '/me') return sessionOf({ role: 'tutor' });
      if (req.path === '/subjects') return { data: SUBJECTS };
      if (req.path === '/tutor/profile' && req.method === 'GET') return { data: profile() };
      if (req.path === '/tutor/profile/submit')
        return { data: profile({ approvalStatus: 'pending' }) };
      return undefined;
    });
    renderRoute('/tutor/profile');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Gửi duyệt' }));
    expect(await screen.findByText('Đã gửi hồ sơ để duyệt.')).toBeTruthy();
    expect(screen.getByText('Chờ duyệt')).toBeTruthy();
  });

  it('is forbidden for students', async () => {
    mockApi((req) => (req.path === '/me' ? sessionOf({ role: 'student' }) : undefined));
    renderRoute('/tutor/profile');
    expect(await screen.findByText('Bạn không có quyền truy cập trang này')).toBeTruthy();
  });
});
