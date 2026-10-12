import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { OwnComplaintSummary } from '../../src/shared/schemas/complaints';
import type { PublishedContent } from '../../src/shared/schemas/content';
import type { LearnerPriceGuide } from '../../src/shared/schemas/pricing';
import { mockApi, renderRoute, sessionOf } from './helpers';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const draft: OwnComplaintSummary = {
  id: 'c-1',
  code: 'KN-004',
  classId: null,
  title: 'Yêu cầu hủy hợp đồng do thay đổi kế hoạch',
  body: 'Gia đình có kế hoạch di chuyển, muốn hủy hợp đồng và được hoàn lại tiền đặt cọc.',
  status: 'draft',
  version: 1,
  createdAt: '2026-04-07T02:00:00.000Z',
  updatedAt: '2026-04-07T02:00:00.000Z',
  submittedAt: null,
  resolvedAt: null,
};
const counts = { draft: 1, submitted: 1, in_review: 1, resolved: 1 };
const page = (items: unknown[]) => ({
  data: { items, total: items.length, page: 1, pageSize: 10 },
});

describe('learner complaints page', () => {
  it('shows status cards and tabs, and sends or deletes a draft from its row', async () => {
    let drafts = [draft];
    const { calls } = mockApi((req) => {
      if (req.path === '/me') return sessionOf({ role: 'student' });
      if (req.path === '/complaints/counts') return { data: counts };
      if (req.path.startsWith('/complaints?')) {
        const group = new URLSearchParams(req.path.split('?')[1]).get('group');
        return page(group === 'draft' ? drafts : []);
      }
      if (req.path === '/complaints/c-1/submit') {
        drafts = [];
        return { data: { ...draft, status: 'submitted', version: 2, resolution: null } };
      }
      return undefined;
    });
    renderRoute('/parent/khieu-nai');
    const user = userEvent.setup();

    expect(await screen.findByRole('heading', { name: 'Khiếu nại của tôi' })).toBeTruthy();
    expect(await screen.findByText(draft.title)).toBeTruthy();
    expect(screen.getByText(draft.body)).toBeTruthy();
    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual([
      'Chưa gửi1',
      'Đang xử lý2',
      'Đã xử lý1',
    ]);
    expect(calls.some((call) => call.path === '/complaints?group=draft&pageSize=10')).toBe(true);

    await user.click(screen.getByRole('button', { name: 'Gửi KN-004' }));
    await waitFor(() =>
      expect(calls.find((call) => call.path === '/complaints/c-1/submit')?.body).toEqual({
        version: 1,
      }),
    );
    expect(await screen.findByText('Đã gửi khiếu nại KN-004 đến trung tâm.')).toBeTruthy();
  });

  it('creates a draft from the dialog and confirms before deleting it', async () => {
    const { calls } = mockApi((req) => {
      if (req.path === '/me') return sessionOf({ role: 'student' });
      if (req.path === '/complaints/counts') return { data: counts };
      if (req.path.startsWith('/complaints?')) return page([draft]);
      if (req.path === '/complaints' && req.method === 'POST')
        return { status: 201, data: { ...draft, id: 'c-2', code: 'KN-005', resolution: null } };
      if (req.path === '/complaints/c-1' && req.method === 'DELETE')
        return { data: { deleted: true } };
      return undefined;
    });
    renderRoute('/parent/khieu-nai');
    const user = userEvent.setup();
    await screen.findByText(draft.title);

    await user.click(screen.getByRole('button', { name: 'Tạo khiếu nại' }));
    const dialog = screen.getByRole('dialog', { name: 'Tạo khiếu nại' });
    await user.type(within(dialog).getByLabelText(/Tiêu đề/), 'Gia sư đến muộn');
    await user.type(within(dialog).getByLabelText(/Nội dung/), 'Gia sư đến muộn nhiều buổi.');
    await user.click(within(dialog).getByRole('button', { name: 'Lưu nháp' }));
    await waitFor(() =>
      expect(
        calls.find((call) => call.path === '/complaints' && call.method === 'POST')?.body,
      ).toEqual({
        classId: null,
        title: 'Gia sư đến muộn',
        body: 'Gia sư đến muộn nhiều buổi.',
        submit: false,
      }),
    );
    expect(await screen.findByText('Đã lưu bản nháp KN-005.')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Xóa KN-004' }));
    expect(calls.some((call) => call.method === 'DELETE')).toBe(false);
    await user.click(screen.getByRole('button', { name: 'Xóa bản nháp' }));
    await waitFor(() =>
      expect(calls.find((call) => call.method === 'DELETE')?.body).toEqual({ version: 1 }),
    );
  });
});

const article: PublishedContent = {
  id: 'a-1',
  kind: 'blog',
  slug: 'phu-huynh-10-dieu',
  audience: 'public',
  revision: 1,
  title: '10 Điều Cần Biết Khi Chọn Gia Sư',
  summary: 'Chọn gia sư phù hợp là yếu tố quan trọng.',
  bodyText: 'Nội dung bài viết.',
  category: 'choosing_tutor',
  authorName: 'Đỗ Hằng',
  publishedAt: '2026-03-15T02:00:00.000Z',
};

describe('learner handbook', () => {
  it('lists articles with byline and filters by category and keyword on the server', async () => {
    const { calls } = mockApi((req) => {
      if (req.path === '/me') return sessionOf({ role: 'student' });
      if (req.path.startsWith('/content?'))
        return { data: { items: [article], total: 1, page: 1, pageSize: 6 } };
      return undefined;
    });
    renderRoute('/parent/cam-nang');
    const user = userEvent.setup();

    expect(
      await screen.findByRole('heading', { name: 'Cẩm nang dành cho người học' }),
    ).toBeTruthy();
    expect(await screen.findByRole('link', { name: article.title })).toBeTruthy();
    expect(screen.getByText('Đỗ Hằng')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Đọc thêm' }).getAttribute('href')).toBe(
      '/parent/cam-nang/phu-huynh-10-dieu',
    );
    expect(screen.getByRole('link', { name: 'Đăng ký tìm gia sư ngay' })).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Ôn thi' }));
    await waitFor(() =>
      expect(calls.some((call) => call.path.includes('category=exam_prep'))).toBe(true),
    );
    await user.type(screen.getByLabelText('Tìm bài cẩm nang'), 'gia sư');
    await user.click(screen.getByRole('button', { name: 'Tìm kiếm' }));
    await waitFor(() =>
      expect(
        calls.some(
          (call) => call.path.includes('category=exam_prep') && call.path.includes('q=gia+s%C6%B0'),
        ),
      ).toBe(true),
    );
  });
});

describe('learner pricing', () => {
  it('shows reference prices by tutor type and by subject per school stage', async () => {
    const guides: LearnerPriceGuide[] = [
      {
        id: 'g-1',
        dimension: 'tutor_type',
        tutorType: 'pedagogy_student',
        subjectId: null,
        subjectName: null,
        educationLevel: 'upper_secondary',
        minPriceMinor: 220_000,
        maxPriceMinor: 260_000,
      },
      {
        id: 'g-2',
        dimension: 'subject',
        tutorType: null,
        subjectId: 'subj_math',
        subjectName: 'Toán',
        educationLevel: 'primary',
        minPriceMinor: 150_000,
        maxPriceMinor: 250_000,
      },
    ];
    mockApi((req) => {
      if (req.path === '/me') return sessionOf({ role: 'student' });
      if (req.path === '/pricing/learner-guides') return { data: guides };
      return undefined;
    });
    renderRoute('/parent/bang-gia');

    const byType = await screen.findByRole('region', {
      name: 'Bảng giá tham khảo theo đối tượng gia sư',
    });
    const typeRow = within(byType).getByRole('row', { name: /Sinh viên sư phạm/ });
    expect(within(typeRow).getByText('220k – 260k')).toBeTruthy();
    const bySubject = screen.getByRole('region', { name: 'Bảng giá tham khảo theo môn học' });
    const mathRow = within(bySubject).getByRole('row', { name: /Toán/ });
    expect(
      within(mathRow)
        .getAllByRole('cell')
        .map((cell) => cell.textContent),
    ).toEqual(['150k – 250k', '—', '—', '—']);
  });
});
