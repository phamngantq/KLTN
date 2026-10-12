import { QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AdminPricingPage } from '../../src/client/pages/admin/AdminPricingPage';
import { PublicPricingPage } from '../../src/client/pages/public/PublicPricingPage';
import { createQueryClient } from '../../src/client/lib/query-client';
import type {
  ClassFeeGuidanceVersion,
  TuitionPriceVersion,
} from '../../src/shared/schemas/pricing';
import { mockApi } from './helpers';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function show(node: React.ReactNode) {
  return render(
    <QueryClientProvider client={createQueryClient()}>
      <MemoryRouter>{node}</MemoryRouter>
    </QueryClientProvider>,
  );
}

const tuition: TuitionPriceVersion = {
  id: '00000000-0000-4000-8000-000000000001',
  subjectId: 'subj_math',
  subjectName: 'Toán',
  gradeLabel: 'Lớp 6-7',
  level: 'basic',
  mode: 'online',
  pricePerSessionMinor: 165_000,
  version: 1,
  editVersion: 1,
  status: 'published',
  publishedAt: '2026-10-12T00:00:00.000Z',
  createdAt: '2026-10-12T00:00:00.000Z',
};

const classFee: ClassFeeGuidanceVersion = {
  id: '00000000-0000-4000-8000-000000000002',
  mode: 'offline',
  minFeeMinor: 100_000,
  maxFeeMinor: 210_000,
  description: 'Khoảng phí tham khảo khi dạy trực tiếp.',
  version: 1,
  editVersion: 1,
  status: 'published',
  publishedAt: '2026-10-12T00:00:00.000Z',
  createdAt: '2026-10-12T00:00:00.000Z',
};

describe('D1 pricing catalogues', () => {
  it('shows published tuition and class-fee guidance while keeping parents free', async () => {
    const { calls } = mockApi((req) => {
      if (req.path === '/pricing/tuition') return { data: [tuition] };
      if (req.path === '/pricing/class-fees') return { data: [classFee] };
      if (req.path === '/fee-options/published') return { data: [] };
      if (req.path === '/subjects') return { data: [] };
      if (req.path === '/content/page/pricing?audience=public')
        return { status: 404, error: { code: 'CONTENT_NOT_FOUND', message: 'Chưa có.' } };
      if (req.path === '/content?kind=faq&audience=public&page=1&pageSize=12')
        return { data: { items: [], page: 1, pageSize: 12, total: 0 } };
      return undefined;
    });
    show(<PublicPricingPage />);
    expect(
      await screen.findByRole('heading', { name: 'Miễn phí dịch vụ tìm gia sư' }),
    ).toBeTruthy();
    expect(
      await screen.findByRole('heading', { name: 'Bảng giá học phí theo môn và lớp' }),
    ).toBeTruthy();
    expect(await screen.findByText(/165.000/)).toBeTruthy();
    expect(await screen.findByText(/100.000.*210.000/)).toBeTruthy();
    expect(screen.getByText(/không phải khoản thu thêm của người học/)).toBeTruthy();
    expect(calls.some((call) => call.path === '/pricing/tuition')).toBe(true);
    expect(calls.some((call) => call.path === '/pricing/class-fees')).toBe(true);
  });

  it('creates a tuition draft and publishes the server-confirmed version', async () => {
    let current: TuitionPriceVersion[] = [];
    const { calls } = mockApi((req) => {
      if (req.path === '/subjects')
        return { data: [{ id: 'subj_math', slug: 'toan', name: 'Toán' }] };
      if (req.path === '/admin/fee-options') return { data: [] };
      if (req.path === '/admin/pricing/tuition' && req.method === 'GET') return { data: current };
      if (req.path === '/admin/pricing/tuition' && req.method === 'POST') {
        const version = (current[0]?.version ?? 0) + 1;
        current = [
          {
            ...tuition,
            ...(req.body as object),
            id: `00000000-0000-4000-8000-${String(version).padStart(12, '0')}`,
            version,
            status: 'draft',
            publishedAt: null,
          },
        ];
        return { status: 201, data: current[0] };
      }
      if (req.path === `/admin/pricing/tuition/${tuition.id}/publish` && req.method === 'POST') {
        current = [
          { ...current[0]!, status: 'published', publishedAt: '2026-10-12T00:00:00.000Z' },
        ];
        return { data: current[0] };
      }
      return undefined;
    });
    show(<AdminPricingPage />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Thêm mục giá' }));
    await user.selectOptions(screen.getByLabelText(/Môn học/), 'subj_math');
    await user.type(screen.getByLabelText(/Lớp \/ nhóm lớp/), 'Lớp 6-7');
    await user.type(screen.getByLabelText(/Học phí \(₫\/buổi\)/), '165000');
    await user.click(screen.getByRole('button', { name: 'Lưu bản nháp' }));
    expect(await screen.findByText(/Đã lưu bản nháp học phí/)).toBeTruthy();
    expect(
      calls.find((call) => call.path === '/admin/pricing/tuition' && call.method === 'POST')?.body,
    ).toEqual({
      subjectId: 'subj_math',
      gradeLabel: 'Lớp 6-7',
      level: 'basic',
      mode: 'online',
      pricePerSessionMinor: 165_000,
    });
    await user.click(await screen.findByRole('button', { name: 'Công bố' }));
    await user.click(screen.getAllByRole('button', { name: 'Công bố' }).at(-1)!);
    expect(await screen.findByText('Đã công bố mức học phí.')).toBeTruthy();
    expect(calls.find((call) => call.path.endsWith('/publish'))?.body).toEqual({ editVersion: 1 });
    expect(await screen.findByText('Đã công bố')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Tạo phiên bản mới' }));
    expect((screen.getByLabelText(/Lớp \/ nhóm lớp/) as HTMLInputElement).disabled).toBe(true);
    await user.clear(screen.getByLabelText(/Học phí \(₫\/buổi\)/));
    await user.type(screen.getByLabelText(/Học phí \(₫\/buổi\)/), '180000');
    await user.click(screen.getByRole('button', { name: 'Lưu bản nháp' }));
    await waitFor(() =>
      expect(
        calls.filter((call) => call.path === '/admin/pricing/tuition' && call.method === 'POST'),
      ).toHaveLength(2),
    );
    expect(
      calls
        .filter((call) => call.path === '/admin/pricing/tuition' && call.method === 'POST')
        .at(-1)?.body,
    ).toEqual({
      subjectId: 'subj_math',
      gradeLabel: 'Lớp 6-7',
      level: 'basic',
      mode: 'online',
      pricePerSessionMinor: 180_000,
    });
    expect(await screen.findByText(/phiên bản 2/i)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Ba phương án phí' }));
    expect(await screen.findByRole('heading', { name: 'Chưa có phương án phí' })).toBeTruthy();
  });

  it('rejects an inverted flat fee range before write and does not report a failed save as success', async () => {
    const { calls } = mockApi((req) => {
      if (req.path === '/subjects') return { data: [] };
      if (req.path === '/admin/pricing/class-fees' && req.method === 'GET') return { data: [] };
      if (req.path === '/admin/pricing/class-fees' && req.method === 'POST')
        return {
          status: 409,
          error: { code: 'PRICING_CONFLICT', message: 'Khoảng phí đã tồn tại.' },
        };
      return undefined;
    });
    show(<AdminPricingPage />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Khoảng phí nhận lớp' }));
    await user.click(await screen.findByRole('button', { name: 'Thêm khoảng phí' }));
    await user.type(screen.getByLabelText(/Phí tối thiểu/), '500000');
    await user.type(screen.getByLabelText(/Phí tối đa/), '300000');
    await user.type(screen.getByLabelText(/Mô tả/), 'Khoảng phí tham khảo khi dạy trực tuyến.');
    await user.click(screen.getByRole('button', { name: 'Lưu bản nháp' }));
    expect(
      await screen.findByText('Phí tối đa phải bằng hoặc cao hơn phí tối thiểu.'),
    ).toBeTruthy();
    expect(
      calls.some((call) => call.path === '/admin/pricing/class-fees' && call.method === 'POST'),
    ).toBe(false);
    await user.clear(screen.getByLabelText(/Phí tối đa/));
    await user.type(screen.getByLabelText(/Phí tối đa/), '600000');
    await user.click(screen.getByRole('button', { name: 'Lưu bản nháp' }));
    expect(await screen.findByText('Khoảng phí đã tồn tại.')).toBeTruthy();
    expect(screen.queryByText(/Đã lưu bản nháp khoảng phí/)).toBeNull();
    await waitFor(() =>
      expect(
        calls.filter((call) => call.path === '/admin/pricing/class-fees' && call.method === 'POST'),
      ).toHaveLength(1),
    );
  });
});
