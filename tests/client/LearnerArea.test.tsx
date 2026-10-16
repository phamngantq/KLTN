import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { OwnComplaintSummary } from '../../src/shared/schemas/complaints';
import type { PublishedContent } from '../../src/shared/schemas/content';
import type { LearnerPriceGuide, LearnerPriceItem } from '../../src/shared/schemas/pricing';
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
      'Đã gửi2',
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

  it('labels every sent complaint "Đã gửi" in its tab, row and detail', async () => {
    const sent = { ...draft, id: 'c-3', code: 'KN-006', status: 'submitted' as const, version: 2 };
    const reviewing = { ...draft, id: 'c-4', code: 'KN-007', status: 'in_review' as const };
    mockApi((req) => {
      if (req.path === '/me') return sessionOf({ role: 'student' });
      if (req.path === '/complaints/counts') return { data: counts };
      if (req.path.startsWith('/complaints?')) {
        const group = new URLSearchParams(req.path.split('?')[1]).get('group');
        return page(group === 'processing' ? [sent, reviewing] : []);
      }
      if (req.path === '/complaints/c-4')
        return { data: { ...reviewing, resolution: null, attachments: [] } };
      return undefined;
    });
    renderRoute('/parent/khieu-nai?group=processing');
    const user = userEvent.setup();
    const table = await screen.findByRole('table');
    await within(table).findByText('KN-007');
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows.map((row) => within(row).getAllByText(/^Đã gửi$/).length)).toEqual([1, 1]);
    expect(within(table).queryByText('Đang xử lý')).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Xem KN-007' }));
    const dialog = await screen.findByRole('dialog', { name: 'Chi tiết khiếu nại' });
    expect(await within(dialog).findByText('Đã gửi')).toBeTruthy();
    expect(within(dialog).queryByText('Đang xử lý')).toBeNull();
  });

  it('creates a draft with evidence from the dialog and confirms before deleting it', async () => {
    const created = { ...draft, id: 'c-2', code: 'KN-005', resolution: null, attachments: [] };
    const { calls } = mockApi((req) => {
      if (req.path === '/me') return sessionOf({ role: 'student' });
      if (req.path === '/complaints/counts') return { data: counts };
      if (req.path.startsWith('/complaints?')) return page([draft]);
      if (req.path === '/complaints' && req.method === 'POST')
        return { status: 201, data: created };
      if (req.path === '/complaints/c-2/attachments' && req.method === 'POST')
        return {
          status: 201,
          data: {
            id: 'f-1',
            fileName: 'lich-hoc.png',
            contentType: 'image/png',
            sizeBytes: 4,
            createdAt: created.createdAt,
          },
        };
      if (req.path === '/complaints/c-2' && req.method === 'GET') return { data: created };
      if (req.path === '/complaints/c-1' && req.method === 'DELETE')
        return { data: { deleted: true } };
      return undefined;
    });
    renderRoute('/parent/khieu-nai');
    const user = userEvent.setup({ applyAccept: false });
    await screen.findByText(draft.title);

    await user.click(screen.getByRole('button', { name: 'Tạo khiếu nại' }));
    const dialog = screen.getByRole('dialog', { name: 'Tạo khiếu nại' });
    await user.type(within(dialog).getByLabelText(/Tiêu đề/), 'Gia sư đến muộn');
    await user.type(within(dialog).getByLabelText(/Nội dung/), 'Gia sư đến muộn nhiều buổi.');
    const evidence = within(dialog).getByLabelText('Đính kèm minh chứng');
    await user.upload(evidence, new File(['%PDF'], 'ghi-chu.txt', { type: 'text/plain' }));
    expect(within(dialog).getByRole('alert').textContent).toContain('chỉ nhận ảnh JPG');
    await user.upload(
      evidence,
      new File([new Uint8Array([137, 80, 78, 71])], 'lich-hoc.png', {
        type: 'image/png',
      }),
    );
    expect(within(dialog).getByText('lich-hoc.png')).toBeTruthy();
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
    const upload = calls.find((call) => call.path === '/complaints/c-2/attachments');
    expect(upload?.body).toBeInstanceOf(FormData);
    expect(((upload?.body as FormData).get('file') as File).name).toBe('lich-hoc.png');
    expect(upload?.headers.get('X-CSRF-Token')).toBe('csrf-test-token');

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

describe('tutor handbook', () => {
  it('lists "gia-su-" articles under the tutor area without the learner-only category', async () => {
    const tutorArticle = {
      ...article,
      id: 'a-2',
      slug: 'gia-su-chuan-bi-buoi-dau',
      title: 'Chuẩn Bị Cho Buổi Dạy Đầu Tiên',
      category: 'skills' as const,
    };
    const { calls } = mockApi((req) => {
      if (req.path === '/me') return sessionOf({ role: 'tutor' });
      if (req.path.startsWith('/content?'))
        return { data: { items: [tutorArticle], total: 1, page: 1, pageSize: 6 } };
      return undefined;
    });
    renderRoute('/tutor/cam-nang');
    expect(await screen.findByRole('heading', { name: 'Cẩm nang dành cho gia sư' })).toBeTruthy();
    expect((await screen.findByRole('link', { name: 'Đọc thêm' })).getAttribute('href')).toBe(
      '/tutor/cam-nang/gia-su-chuan-bi-buoi-dau',
    );
    expect(screen.queryByRole('button', { name: 'Chọn gia sư' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Tìm lớp dạy ngay' }).getAttribute('href')).toBe(
      '/tutor/new-classes',
    );
    expect(calls.some((call) => call.path.includes('slugPrefix=gia-su-'))).toBe(true);
  });
});

describe('learner pricing', () => {
  it('shows tutor-type cards, grouped price lists and the reference note', async () => {
    const guides: LearnerPriceGuide[] = [
      ['university_student', 'primary', 80_000, 100_000],
      ['university_student', 'upper_secondary', 120_000, 150_000],
      ['pedagogy_student', 'upper_secondary', 150_000, 200_000],
      ['teacher', 'university_prep', 250_000, 300_000],
    ].map(([tutorType, educationLevel, min, max], index) => ({
      id: `g-${index}`,
      dimension: 'tutor_type',
      tutorType: tutorType as LearnerPriceGuide['tutorType'],
      subjectId: null,
      subjectName: null,
      educationLevel: educationLevel as LearnerPriceGuide['educationLevel'],
      minPriceMinor: min as number,
      maxPriceMinor: max as number,
    }));
    const items: LearnerPriceItem[] = [
      {
        id: 'i-1',
        groupKey: 'primary',
        label: 'Toán, Tiếng Việt',
        minPriceMinor: 80_000,
        maxPriceMinor: 120_000,
        sortOrder: 1,
      },
      {
        id: 'i-2',
        groupKey: 'talent',
        label: 'Piano, Organ',
        minPriceMinor: 150_000,
        maxPriceMinor: 300_000,
        sortOrder: 1,
      },
      {
        id: 'i-3',
        groupKey: 'language',
        label: 'IELTS, TOEIC',
        minPriceMinor: 250_000,
        maxPriceMinor: 450_000,
        sortOrder: 1,
      },
    ];
    mockApi((req) => {
      if (req.path === '/me') return sessionOf({ role: 'student' });
      if (req.path === '/pricing/learner-guides') return { data: guides };
      if (req.path === '/pricing/learner-items') return { data: items };
      return undefined;
    });
    renderRoute('/parent/bang-gia');

    expect(await screen.findByRole('heading', { name: 'Giá Theo Đối Tượng Gia Sư' })).toBeTruthy();
    const student = (await screen.findByRole('heading', { name: 'Sinh viên', level: 2 })).closest(
      'li',
    )!;
    expect(within(student).getByText('80.000đ - 150.000đ/buổi')).toBeTruthy();
    const pedagogy = screen.getByRole('heading', { name: 'Sinh viên sư phạm' }).closest('li')!;
    expect(within(pedagogy).getByText('Phổ biến nhất')).toBeTruthy();
    expect(
      screen.getByRole('heading', { name: 'Bảng Giá Chi Tiết Theo Cấp Học & Môn Học' }),
    ).toBeTruthy();
    const talent = screen.getByRole('region', { name: 'Năng khiếu' });
    expect(within(talent).getByText('Piano, Organ')).toBeTruthy();
    expect(within(talent).getByText('150.000đ - 300.000đ/buổi')).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Ngoại ngữ' })).toBeTruthy();
    expect(screen.queryByRole('region', { name: 'Lớp 6-9 (THCS)' })).toBeNull();
    expect(
      screen.getByText(
        /Học phí trên là mức tham khảo, có thể thay đổi tùy theo khu vực và yêu cầu cụ thể và người học tìm kiếm gia sư qua trung tâm không mất phí môi giới/,
      ),
    ).toBeTruthy();
  });
});
