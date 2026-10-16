import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TutorAssignment } from '../../src/shared/schemas/admin-assignments';
import type { TutorProfile } from '../../src/shared/schemas/tutors';
import { mockApi, renderRoute, sessionOf } from './helpers';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const profile: TutorProfile = {
  userId: 'u1',
  slug: 'gia-su-a',
  displayName: 'Nguyễn An',
  bio: 'Giới thiệu',
  hourlyRateMinor: 200_000,
  currency: 'VND',
  teachesOnline: true,
  teachesOffline: false,
  preferredGrades: [],
  preferredAreas: [],
  negotiableTime: false,
  subjects: [{ id: 'subj_math', slug: 'toan', name: 'Toán' }],
  approvalStatus: 'approved',
  visibility: 'private',
  moderationNote: null,
  missing: [],
  tutorType: null,
  school: null,
  specialization: null,
  experienceYears: null,
  experienceSummary: null,
  hasPhoto: false,
  customOptions: [],
  major: null,
  graduationYear: null,
  email: 'tutor@example.com',
  phone: null,
  dateOfBirth: null,
  idNumber: null,
  idIssuedOn: null,
  idResidence: null,
  idVerification: 'center',
  documents: [],
};

describe('tutor profile form', () => {
  it('saves level, school, specialization and experience and uploads a photo', async () => {
    const { calls } = mockApi((req) => {
      if (req.path === '/me') return sessionOf({ role: 'tutor' });
      if (req.path === '/subjects') return { data: profile.subjects };
      if (req.path === '/tutor/availability')
        return { data: { timezone: 'Asia/Ho_Chi_Minh', rules: [] } };
      if (req.path === '/tutor/profile' && req.method === 'GET') return { data: profile };
      if (req.path === '/tutor/profile' && req.method === 'PATCH')
        return { data: { ...profile, tutorType: 'teacher', school: 'THPT A' } };
      if (req.path === '/tutor/profile/photo' && req.method === 'POST')
        return { data: { saved: true } };
      if (req.path === '/tutor/profile/submit')
        return { data: { ...profile, approvalStatus: 'pending' } };
      return undefined;
    });
    renderRoute('/tutor/profile');
    const user = userEvent.setup();
    const personal = await screen.findByRole('region', { name: 'Thông tin cá nhân' });
    await user.selectOptions(
      within(personal).getByRole('combobox', { name: 'Loại gia sư' }),
      'teacher',
    );
    const education = screen.getByRole('region', { name: 'Trình độ học vấn' });
    await user.type(within(education).getByLabelText('Trường'), 'THPT A');
    const experience = screen.getByRole('region', { name: 'Kinh nghiệm giảng dạy' });
    await user.type(within(experience).getByLabelText('Môn dạy'), 'Toán THPT');
    await user.selectOptions(within(experience).getByLabelText('Số năm kinh nghiệm'), '5');
    await user.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));
    await waitFor(() =>
      expect(calls.find((call) => call.method === 'PATCH')?.body).toMatchObject({
        tutorType: 'teacher',
        school: 'THPT A',
        specialization: 'Toán THPT',
        experienceYears: 5,
        experienceSummary: null,
      }),
    );

    await user.upload(
      screen.getByLabelText('Tải ảnh đại diện'),
      new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], 'me.png', { type: 'image/png' }),
    );
    // The new photo is previewed first; nothing is uploaded until "Cập nhật ảnh".
    expect(await screen.findByAltText('Ảnh đại diện xem trước')).toBeTruthy();
    expect(calls.some((call) => call.path === '/tutor/profile/photo')).toBe(false);
    await user.click(screen.getByRole('button', { name: 'Cập nhật ảnh' }));
    await waitFor(() => {
      const upload = calls.find((call) => call.path === '/tutor/profile/photo');
      expect(upload?.method).toBe('POST');
      expect(upload?.body).toBeInstanceOf(FormData);
    });
  }, 20_000);
});

describe('tutor contact gate', () => {
  it('lists the pending steps instead of the contact button until all are done', async () => {
    const base: TutorAssignment = {
      id: 'a-1',
      classId: 'c-1',
      classCode: 'LH-001',
      applicationId: 'ap-1',
      subjectName: 'Toán',
      grade: 'Lớp 9',
      mode: 'offline',
      publicArea: 'Cầu Giấy, Hà Nội',
      status: 'active',
      assignedAt: '2026-10-11T01:00:00.000Z',
      agreedTuitionPerSessionMinor: 200_000,
      contactGate: { learnerConfirmed: true, contractAcknowledged: false, placementFeePaid: false },
    };
    mockApi((req) => {
      if (req.path === '/me') return sessionOf({ role: 'tutor' });
      if (req.path.startsWith('/tutor/assignments'))
        return { data: { items: [base], total: 1, page: 1, pageSize: 12 } };
      return undefined;
    });
    renderRoute('/tutor/classes');
    expect(await screen.findByText('Liên hệ người học mở sau khi hoàn tất các bước:')).toBeTruthy();
    expect(screen.getByText('Người học xác nhận thuê gia sư')).toBeTruthy();
    expect(screen.getByText('(đã xong)', { exact: false })).toBeTruthy();
    expect(screen.getByText('Trung tâm ghi nhận đã thanh toán phí môi giới')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Xem liên hệ người học' })).toBeNull();
  });
});
