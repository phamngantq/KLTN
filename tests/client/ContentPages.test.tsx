import { QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  PublishedContentCollectionPage,
  PublishedContentPage,
} from '../../src/client/pages/public/PublishedContentPage';
import { PublicPricingPage } from '../../src/client/pages/public/PublicPricingPage';
import { PublicContactPage } from '../../src/client/pages/public/PublicContactPage';
import { AdminContentPage } from '../../src/client/pages/admin/AdminContentPage';
import { createQueryClient } from '../../src/client/lib/query-client';
import { anonymous, mockApi } from './helpers';

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

describe('published content pages', () => {
  it('renders published plain text without executing HTML-looking content', async () => {
    const unsafeText = '<img src=x onerror=alert(1)>';
    mockApi((req) => {
      if (req.path === '/me') return anonymous;
      if (req.path === '/content/page/about?audience=public') {
        return {
          data: {
            id: 'content-1',
            kind: 'page',
            slug: 'about',
            audience: 'public',
            revision: 1,
            title: 'Về Chúng Tôi',
            summary: 'Nội dung đã công bố.',
            bodyText: unsafeText,
            publishedAt: '2026-10-01T00:00:00.000Z',
          },
        };
      }
      return undefined;
    });
    const view = show(<PublishedContentPage kind="page" slug="about" fallbackTitle="Giới thiệu" />);
    expect(await screen.findByRole('heading', { name: 'Về Chúng Tôi' })).toBeTruthy();
    expect(screen.getByText(unsafeText)).toBeTruthy();
    expect(view.container.querySelector('img')).toBeNull();
  });

  it('uses published blog entries for the correct category and keeps article text escaped', async () => {
    const unsafeText = '<img src=x onerror=alert(1)>';
    const article = {
      id: 'blog-1',
      kind: 'blog',
      slug: 'phu-huynh-chon-gia-su',
      audience: 'public',
      revision: 1,
      title: 'Chọn gia sư cho con',
      summary: 'Gợi ý dành cho người học.',
      bodyText: unsafeText,
      publishedAt: '2026-10-01T00:00:00.000Z',
    };
    const { calls } = mockApi((req) => {
      if (req.path === '/me') return anonymous;
      if (
        req.path === '/content?kind=blog&audience=public&slugPrefix=phu-huynh-&page=1&pageSize=12'
      ) {
        return { data: { items: [article], page: 1, pageSize: 12, total: 1 } };
      }
      if (req.path === '/content/blog/phu-huynh-chon-gia-su?audience=public') {
        return { data: article };
      }
      return undefined;
    });
    const list = show(
      <PublishedContentCollectionPage
        kind="blog"
        slugPrefix="phu-huynh-"
        title="Tin tức người học"
        detailBase="/blog/phu-huynh"
      />,
    );
    expect(await screen.findByRole('heading', { name: 'Blog Dành Cho Phụ Huynh' })).toBeTruthy();
    expect(await screen.findByRole('heading', { name: article.title })).toBeTruthy();
    expect(screen.getByRole('link', { name: /Đọc ngay/ }).getAttribute('href')).toBe(
      '/blog/phu-huynh/phu-huynh-chon-gia-su',
    );
    expect(list.container.querySelector('img')).toBeNull();
    list.unmount();

    const detail = show(
      <PublishedContentPage
        kind="blog"
        slug={article.slug}
        fallbackTitle="Không tìm thấy bài viết"
      />,
    );
    expect(await screen.findByRole('heading', { name: article.title })).toBeTruthy();
    expect(screen.getByText(unsafeText)).toBeTruthy();
    expect(detail.container.querySelector('img')).toBeNull();
    expect(calls.some((call) => call.path.includes('slugPrefix=phu-huynh-'))).toBe(true);
  });

  it('shows parent-free policy but no fabricated tutor rate before publication', async () => {
    mockApi((req) => {
      if (req.path === '/me') return anonymous;
      if (req.path === '/content/page/pricing?audience=public') {
        return {
          status: 404,
          error: { code: 'CONTENT_NOT_FOUND', message: 'Không tìm thấy nội dung.' },
        };
      }
      if (req.path === '/fee-options/published') return { data: [] };
      if (req.path === '/pricing/tuition') return { data: [] };
      if (req.path === '/pricing/class-fees') return { data: [] };
      if (req.path === '/content?kind=faq&audience=public&page=1&pageSize=12') {
        return {
          data: {
            items: [
              {
                id: 'faq-1',
                kind: 'faq',
                slug: 'phu-huynh-co-mat-phi',
                audience: 'public',
                revision: 1,
                title: 'Tôi có phải trả phí môi giới không?',
                summary: '',
                bodyText: 'Người học không trả phí dịch vụ tìm gia sư.',
                publishedAt: '2026-10-11T00:00:00.000Z',
              },
            ],
            page: 1,
            pageSize: 12,
            total: 1,
          },
        };
      }
      if (req.path === '/subjects') return { data: [] };
      return undefined;
    });
    show(<PublicPricingPage />);
    expect(
      await screen.findByRole('heading', { name: 'Miễn phí dịch vụ tìm gia sư' }),
    ).toBeTruthy();
    expect(
      await screen.findByRole('heading', { name: 'Chưa có phương án phí được công bố' }),
    ).toBeTruthy();
    expect(await screen.findByText('Tôi có phải trả phí môi giới không?')).toBeTruthy();
    expect(screen.queryByText(/50%/)).toBeNull();
  });

  it('uses published contact content for phone and email actions', async () => {
    mockApi((req) => {
      if (req.path === '/me') return anonymous;
      if (req.path === '/content/page/contact?audience=public') {
        return {
          data: {
            id: 'contact-1',
            kind: 'page',
            slug: 'contact',
            audience: 'public',
            revision: 1,
            title: 'Liên Hệ Với Chúng Tôi',
            summary: 'Thông tin liên hệ',
            bodyText:
              'Địa chỉ: Số 41 Khuất Duy Tiến, Thanh Xuân, Hà Nội\nHotline: 0394 618 480\nEmail: tuyendunggiasugio@gmail.com',
            publishedAt: '2026-10-11T00:00:00.000Z',
          },
        };
      }
      return undefined;
    });
    show(<PublicContactPage />);
    expect(await screen.findByRole('heading', { name: 'Liên Hệ Với Chúng Tôi' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Gọi ngay' }).getAttribute('href')).toBe(
      'tel:0394618480',
    );
    expect(screen.getByRole('link', { name: 'Gửi email' }).getAttribute('href')).toBe(
      'mailto:tuyendunggiasugio@gmail.com',
    );
    expect(screen.queryByRole('button', { name: /gửi tin/i })).toBeNull();
  });

  it('does not report an admin draft as saved when the Worker rejects it', async () => {
    const { calls } = mockApi((req) => {
      if (req.path === '/admin/content?kind=service&page=1&pageSize=12') {
        return { data: { items: [], page: 1, pageSize: 12, total: 0 } };
      }
      if (req.path === '/admin/content' && req.method === 'POST') {
        return {
          status: 409,
          error: { code: 'CONTENT_DRAFT_EXISTS', message: 'Nội dung này đã có bản nháp.' },
        };
      }
      return undefined;
    });
    show(<AdminContentPage kind="service" title="Quản lý dịch vụ" />);
    const user = userEvent.setup();
    await screen.findByRole('heading', { name: 'Chưa có nội dung' });
    await user.type(screen.getByRole('textbox', { name: /Đường dẫn/i }), 'sample-service');
    await user.type(screen.getByRole('textbox', { name: /Tiêu đề/i }), 'Dịch vụ được duyệt');
    await user.type(
      screen.getByRole('textbox', { name: /Nội dung văn bản/i }),
      'Nội dung cần kiểm duyệt.',
    );
    await user.click(screen.getByRole('button', { name: 'Tạo bản nháp' }));
    expect(await screen.findByText('Nội dung này đã có bản nháp.')).toBeTruthy();
    expect(screen.queryByText(/Đã lưu bản nháp/)).toBeNull();
    expect(
      calls.find((call) => call.path === '/admin/content' && call.method === 'POST')?.body,
    ).toMatchObject({ kind: 'service', slug: 'sample-service' });
  });

  it('creates blog slugs in the selected public category', async () => {
    const { calls } = mockApi((req) => {
      if (req.path === '/admin/content?kind=blog&page=1&pageSize=12') {
        return { data: { items: [], page: 1, pageSize: 12, total: 0 } };
      }
      if (req.path === '/admin/content' && req.method === 'POST') {
        return {
          status: 409,
          error: { code: 'CONTENT_DRAFT_EXISTS', message: 'Nội dung này đã có bản nháp.' },
        };
      }
      return undefined;
    });
    show(<AdminContentPage kind="blog" title="Bài viết" />);
    const user = userEvent.setup();
    await screen.findByRole('heading', { name: 'Chưa có nội dung' });
    await user.selectOptions(screen.getByRole('combobox', { name: 'Danh mục bài viết' }), 'gia-su');
    await user.type(screen.getByRole('textbox', { name: /Đường dẫn/i }), 'chon-lop');
    await user.type(screen.getByRole('textbox', { name: /Tiêu đề/i }), 'Hướng dẫn chọn lớp');
    await user.type(
      screen.getByRole('textbox', { name: /Nội dung văn bản/i }),
      'Nội dung kiểm duyệt.',
    );
    await user.click(screen.getByRole('button', { name: 'Tạo bản nháp' }));
    expect(await screen.findByText('Nội dung này đã có bản nháp.')).toBeTruthy();
    expect(
      calls.find((call) => call.path === '/admin/content' && call.method === 'POST')?.body,
    ).toMatchObject({ kind: 'blog', slug: 'gia-su-chon-lop', audience: 'public' });
  });
});
