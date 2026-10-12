import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Clock3,
  GraduationCap,
  HeartHandshake,
  Mail,
  MapPin,
  Phone,
  Users,
} from 'lucide-react';
import { Link, useParams, useSearchParams } from 'react-router';
import type {
  ContentAudience,
  ContentKind,
  PublishedContent,
} from '../../../shared/schemas/content';
import { Button, ButtonLink } from '../../components/ui/Button';
import { Alert, EmptyState } from '../../components/ui/Feedback';
import { Skeleton } from '../../components/ui/Spinner';
import { usePublishedContent, usePublishedContentList } from '../../features/content/api';
import { isApiError } from '../../lib/api-client';

const KIND_LABELS: Record<ContentKind, string> = {
  page: 'THÔNG TIN',
  service: 'DỊCH VỤ',
  blog: 'BÀI VIẾT',
  faq: 'CÂU HỎI THƯỜNG GẶP',
  guide: 'HƯỚNG DẪN',
  contract: 'HỢP ĐỒNG',
  terms: 'ĐIỀU KHOẢN',
};

function Hero({ eyebrow, title, summary }: { eyebrow: string; title: string; summary?: string }) {
  return (
    <header className="bg-gradient-to-br from-primary to-primary-gradient-end px-4 py-12 text-on-primary md:py-16">
      <div className="mx-auto max-w-[var(--container-max)]">
        <p className="text-sm font-semibold tracking-wide text-accent">{eyebrow}</p>
        <h1 className="mt-3 max-w-3xl text-3xl leading-tight font-bold md:text-4xl">{title}</h1>
        {summary && <p className="mt-4 max-w-2xl text-lg text-on-primary/90">{summary}</p>}
      </div>
    </header>
  );
}

/** The CMS stores plain text; React escapes any HTML-looking text before rendering. */
export function ContentText({ text }: { text: string }) {
  return <div className="whitespace-pre-line break-words text-fg leading-7">{text}</div>;
}

function PublishedArticle({ item }: { item: PublishedContent }) {
  if (item.kind === 'blog') return <BlogArticle item={item} />;
  return (
    <>
      <Hero eyebrow={KIND_LABELS[item.kind]} title={item.title} summary={item.summary} />
      <article className="mx-auto max-w-[var(--container-max)] px-4 py-10">
        <div className="max-w-3xl rounded-xl border border-border bg-surface p-5 shadow-card sm:p-8">
          <ContentText text={item.bodyText} />
          <p className="mt-8 border-t border-border pt-4 text-sm text-muted">
            Phiên bản {item.revision} · Công bố{' '}
            <time dateTime={item.publishedAt}>
              {new Date(item.publishedAt).toLocaleDateString('vi-VN')}
            </time>
          </p>
        </div>
      </article>
    </>
  );
}

type BlogCategory = 'parent' | 'tutor';

function categoryOfBlog(item: PublishedContent): BlogCategory {
  return item.slug.startsWith('gia-su-') ? 'tutor' : 'parent';
}

function blogDate(value: string): string {
  return new Date(value).toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
}

function BlogVisual({ category }: { category: BlogCategory }) {
  const Icon = category === 'parent' ? BookOpen : GraduationCap;
  return (
    <div
      aria-hidden="true"
      className="flex min-h-56 flex-col items-center justify-center gap-4 bg-gradient-to-br from-primary to-primary-gradient-end p-8 text-center text-on-primary"
    >
      <span className="flex size-24 items-center justify-center rounded-2xl bg-accent text-on-accent">
        <Icon className="size-12" />
      </span>
      <span className="text-lg font-semibold">Gia Sư Đỗ Hằng</span>
    </div>
  );
}

function BlogCallToAction({ category }: { category: BlogCategory }) {
  const parent = category === 'parent';
  return (
    <section className="bg-surface px-4 py-16 text-center">
      <div className="mx-auto max-w-4xl">
        <h2 className="text-3xl font-semibold text-primary">
          {parent ? 'Cần Hỗ Trợ Tìm Gia Sư?' : 'Sẵn Sàng Trở Thành Gia Sư?'}
        </h2>
        <p className="mx-auto mt-5 max-w-2xl text-lg text-muted">
          {parent
            ? 'Gửi yêu cầu để kiểm duyệt viên tìm gia sư phù hợp với nhu cầu học tập của con.'
            : 'Đăng ký để xem lớp được công bố và ứng tuyển khi hoàn thành các điều kiện.'}
        </p>
        <ButtonLink
          to={parent ? '/sign-up?role=parent' : '/sign-up?role=tutor'}
          variant="accent"
          className="mt-8 rounded-xl"
        >
          {parent ? 'Đăng ký tìm gia sư ngay' : 'Đăng ký làm gia sư ngay'}
          <ArrowRight aria-hidden="true" className="size-4" />
        </ButtonLink>
      </div>
    </section>
  );
}

function BlogArticle({ item }: { item: PublishedContent }) {
  const category = categoryOfBlog(item);
  const categorySlug = category === 'parent' ? 'phu-huynh' : 'gia-su';
  return (
    <>
      <div className="bg-surface px-4 py-4">
        <div className="mx-auto max-w-4xl">
          <Link
            to={`/blog/${categorySlug}`}
            className="inline-flex min-h-11 items-center gap-2 rounded-lg text-sm font-medium text-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          >
            <ArrowLeft aria-hidden="true" className="size-4" />
            Quay lại bài viết
          </Link>
        </div>
      </div>
      <header className="bg-surface px-4 pb-10 pt-4">
        <div className="mx-auto max-w-4xl">
          <span className="inline-flex rounded-full bg-accent px-3 py-1 text-sm font-medium text-on-accent">
            Blog {category === 'parent' ? 'Phụ Huynh' : 'Gia Sư'}
          </span>
          <h1 className="mt-5 text-4xl font-bold leading-tight text-primary md:text-5xl">
            {item.title}
          </h1>
          {item.summary && (
            <p className="mt-5 text-lg leading-relaxed text-muted">{item.summary}</p>
          )}
          <p className="mt-6 flex items-center gap-2 text-sm text-muted">
            <Clock3 aria-hidden="true" className="size-4" />
            Công bố <time dateTime={item.publishedAt}>{blogDate(item.publishedAt)}</time>
          </p>
        </div>
      </header>
      <div className="mx-auto max-w-4xl px-4 pt-8">
        <div className="overflow-hidden rounded-2xl shadow-card">
          <BlogVisual category={category} />
        </div>
      </div>
      <article className="mx-auto max-w-4xl px-4 py-10">
        <div className="rounded-xl border border-border bg-bg p-6 shadow-card sm:p-10">
          <ContentText text={item.bodyText} />
          <p className="mt-8 border-t border-border pt-4 text-sm text-muted">
            Phiên bản {item.revision} · Công bố{' '}
            <time dateTime={item.publishedAt}>{blogDate(item.publishedAt)}</time>
          </p>
        </div>
      </article>
      <BlogCallToAction category={category} />
    </>
  );
}

function BlogHero({ category }: { category: BlogCategory }) {
  const parent = category === 'parent';
  const Icon = parent ? BookOpen : GraduationCap;
  return (
    <header className="bg-gradient-to-br from-primary to-primary-gradient-end px-4 py-16 text-center text-on-primary">
      <div className="mx-auto max-w-4xl">
        <Icon aria-hidden="true" className="mx-auto mb-6 size-16 text-accent" />
        <h1 className="text-4xl font-bold md:text-5xl">
          {parent ? 'Blog Dành Cho Phụ Huynh' : 'Blog Dành Cho Gia Sư'}
        </h1>
        <p className="mt-6 text-xl text-on-primary/90">
          {parent
            ? 'Chia sẻ kiến thức và kinh nghiệm giúp con em học tập hiệu quả hơn'
            : 'Kinh nghiệm và hướng dẫn để phát triển công việc gia sư'}
        </p>
      </div>
    </header>
  );
}

function BlogCard({
  item,
  category,
  detailBase,
  lead,
}: {
  item: PublishedContent;
  category: BlogCategory;
  detailBase: string;
  lead: boolean;
}) {
  const excerpt =
    item.summary || `${item.bodyText.slice(0, 180)}${item.bodyText.length > 180 ? '…' : ''}`;
  return (
    <li
      className={`overflow-hidden rounded-xl bg-bg shadow-card ${lead ? 'border-2 border-accent' : 'border border-primary/20'}`}
    >
      <article
        className={`grid ${lead ? 'md:grid-cols-2' : 'md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]'}`}
      >
        <BlogVisual category={category} />
        <div className="flex min-w-0 flex-col justify-center p-6 sm:p-8">
          <h2
            className={`${lead ? 'text-3xl' : 'text-2xl'} font-semibold leading-tight text-primary`}
          >
            {item.title}
          </h2>
          <p className="mt-4 flex items-center gap-2 text-sm text-muted">
            <Clock3 aria-hidden="true" className="size-4" />
            Công bố <time dateTime={item.publishedAt}>{blogDate(item.publishedAt)}</time>
          </p>
          <p className="mt-5 line-clamp-4 break-words leading-relaxed text-muted">{excerpt}</p>
          <ButtonLink
            to={`${detailBase}/${encodeURIComponent(item.slug)}`}
            variant={category === 'parent' ? 'primary' : 'accent'}
            className="mt-6 self-start rounded-xl"
          >
            {lead ? 'Đọc ngay' : 'Đọc thêm'}
            <ArrowRight aria-hidden="true" className="size-4" />
          </ButtonLink>
        </div>
      </article>
    </li>
  );
}

function AboutArticle({ item }: { item: PublishedContent }) {
  const contact = usePublishedContent('page', 'contact', 'public');
  const contactLines = contact.data?.bodyText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /^(Địa chỉ|Hotline|Email):/i.test(line));
  const actors = [
    {
      icon: Users,
      title: 'Người học',
      detail: 'Gửi yêu cầu tìm gia sư và theo dõi việc điều phối lớp học.',
    },
    {
      icon: GraduationCap,
      title: 'Gia sư',
      detail: 'Xem lớp đã công bố, hoàn thành điều khoản và gửi ứng tuyển.',
    },
    {
      icon: HeartHandshake,
      title: 'Kiểm duyệt viên',
      detail: 'Xem xét yêu cầu, ứng tuyển và gán gia sư cho lớp.',
    },
  ];

  return (
    <>
      <header className="bg-gradient-to-br from-primary to-primary-gradient-end px-4 py-16 text-center text-on-primary">
        <div className="mx-auto max-w-4xl">
          <h1 className="text-4xl font-bold md:text-5xl">{item.title}</h1>
          {item.summary && <p className="mt-6 text-xl text-on-primary/90">{item.summary}</p>}
        </div>
      </header>
      <section className="px-4 py-16">
        <div className="mx-auto grid max-w-[var(--container-max)] gap-12 lg:grid-cols-2 lg:items-center">
          <div>
            <h2 className="mb-6 text-3xl font-semibold text-primary">Giới Thiệu Chung</h2>
            <ContentText text={item.bodyText} />
            {contactLines && contactLines.length > 0 && (
              <ul className="mt-8 space-y-3">
                {contactLines.map((line, index) => {
                  const separator = line.indexOf(':');
                  const label = line.slice(0, separator);
                  const Icon = /^địa chỉ$/i.test(label)
                    ? MapPin
                    : /^hotline$/i.test(label)
                      ? Phone
                      : Mail;
                  return (
                    <li
                      key={`${label}-${index}`}
                      className="flex items-center gap-3 rounded-xl border border-primary/20 bg-bg p-4 shadow-card"
                    >
                      <Icon aria-hidden="true" className="size-5 shrink-0 text-primary" />
                      <div className="min-w-0">
                        <p className="font-semibold text-primary">{line.slice(0, separator)}</p>
                        <p className="break-words text-sm text-muted">
                          {line.slice(separator + 1).trim()}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          <div className="relative min-h-80">
            <div
              aria-hidden="true"
              className="absolute -right-3 -bottom-3 size-36 rounded-2xl bg-accent md:-right-6 md:-bottom-6"
            />
            <div className="relative flex h-full min-h-80 flex-col items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-primary-gradient-end p-8 text-center text-on-primary shadow-card">
              <GraduationCap aria-hidden="true" className="mb-6 size-20 text-accent" />
              <p className="text-3xl font-bold">Gia Sư Đỗ Hằng</p>
              <p className="mt-4 max-w-sm text-on-primary/90">
                Kết nối người học và gia sư qua yêu cầu, ứng tuyển và điều phối lớp.
              </p>
            </div>
          </div>
        </div>
      </section>
      <section className="bg-surface px-4 py-16">
        <div className="mx-auto grid max-w-[var(--container-max)] gap-8 md:grid-cols-3">
          {actors.map(({ icon: Icon, title, detail }) => (
            <article
              key={title}
              className="rounded-xl border border-primary/20 bg-bg p-8 shadow-card"
            >
              <span
                aria-hidden="true"
                className="mb-6 flex size-16 items-center justify-center rounded-xl bg-accent text-on-accent"
              >
                <Icon className="size-8" />
              </span>
              <h2 className="text-2xl font-semibold text-primary">{title}</h2>
              <p className="mt-4 leading-relaxed text-muted">{detail}</p>
            </article>
          ))}
        </div>
      </section>
      <section className="px-4 py-16">
        <div className="mx-auto max-w-4xl">
          <h2 className="mb-10 text-center text-3xl font-semibold text-primary">
            Lĩnh Vực & Dịch Vụ Kinh Doanh
          </h2>
          <div className="rounded-xl border border-primary/20 bg-bg p-8 shadow-card">
            <BookOpen aria-hidden="true" className="mb-4 size-10 text-primary" />
            <p className="leading-relaxed text-muted">
              Người học có thể tìm gia sư theo môn học hoặc gửi yêu cầu. Gia sư xem lớp công khai và
              ứng tuyển; kiểm duyệt viên điều phối lớp theo yêu cầu đã được xem xét.
            </p>
            <ButtonLink to="/dich-vu" variant="secondary" className="mt-6">
              Xem dịch vụ
            </ButtonLink>
          </div>
          <p className="mt-8 text-sm text-muted">
            Phiên bản {item.revision} · Công bố{' '}
            <time dateTime={item.publishedAt}>
              {new Date(item.publishedAt).toLocaleDateString('vi-VN')}
            </time>
          </p>
        </div>
      </section>
      <section className="bg-gradient-to-br from-primary to-primary-gradient-end px-4 py-12 text-center text-on-primary">
        <div className="mx-auto max-w-3xl">
          <h2 className="text-3xl font-semibold">Tìm gia sư cho nhu cầu học tập</h2>
          <p className="mt-4 text-lg text-on-primary/90">
            Xem thông tin dịch vụ đã công bố hoặc gửi yêu cầu tìm gia sư.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <ButtonLink to="/parent/request" variant="accent">
              Gửi yêu cầu
            </ButtonLink>
            <ButtonLink
              to="/lien-he"
              className="border border-white/30 bg-primary hover:bg-primary-hover"
            >
              Liên hệ
            </ButtonLink>
          </div>
        </div>
      </section>
    </>
  );
}

export function PublishedContentPage({
  kind,
  slug,
  audience = 'public',
  fallbackTitle,
}: {
  kind: ContentKind;
  slug: string;
  audience?: ContentAudience;
  fallbackTitle: string;
}) {
  const content = usePublishedContent(kind, slug, audience);
  if (content.isPending) {
    return (
      <div className="mx-auto max-w-[var(--container-max)] space-y-4 px-4 py-10" aria-busy="true">
        <Skeleton className="h-16 w-3/4" />
        <Skeleton className="h-80" />
      </div>
    );
  }
  if (content.isError) {
    return (
      <div className="mx-auto max-w-[var(--container-max)] px-4 py-10">
        {isApiError(content.error, 'CONTENT_NOT_FOUND') ? (
          <EmptyState
            title={fallbackTitle}
            description="Chưa có nội dung được công bố."
            action={<ButtonLink to="/">Về trang chủ</ButtonLink>}
          />
        ) : (
          <Alert
            tone="danger"
            title="Không tải được nội dung"
            action={
              <Button variant="secondary" onClick={() => void content.refetch()}>
                Thử lại
              </Button>
            }
          >
            {content.error.message}
          </Alert>
        )}
      </div>
    );
  }
  return kind === 'page' && slug === 'about' ? (
    <AboutArticle item={content.data} />
  ) : (
    <PublishedArticle item={content.data} />
  );
}

export function PublishedContentCollectionPage({
  kind,
  audience = 'public',
  slugPrefix,
  title,
  description,
  detailBase,
}: {
  kind: ContentKind;
  audience?: ContentAudience;
  slugPrefix?: string;
  title: string;
  description?: string;
  detailBase?: string;
}) {
  const [params, setParams] = useSearchParams();
  const requestedPage = Number(params.get('page') ?? 1);
  const page =
    Number.isSafeInteger(requestedPage) && requestedPage >= 1 && requestedPage <= 1000
      ? requestedPage
      : 1;
  const blogCategory: BlogCategory | null =
    kind === 'blog' && slugPrefix === 'phu-huynh-'
      ? 'parent'
      : kind === 'blog' && slugPrefix === 'gia-su-'
        ? 'tutor'
        : null;
  const content = usePublishedContentList({ kind, audience, slugPrefix, page, pageSize: 12 });
  function goToPage(nextPage: number) {
    const next = new URLSearchParams(params);
    if (nextPage === 1) next.delete('page');
    else next.set('page', String(nextPage));
    setParams(next);
    document.getElementById('main')?.focus();
  }
  return (
    <>
      {blogCategory ? (
        <BlogHero category={blogCategory} />
      ) : (
        <Hero eyebrow={KIND_LABELS[kind]} title={title} summary={description} />
      )}
      <section
        className={`mx-auto max-w-[var(--container-max)] px-4 ${blogCategory ? 'py-16' : 'py-10'}`}
        aria-live="polite"
      >
        {content.isPending ? (
          <div
            className={blogCategory ? 'space-y-8' : 'grid gap-4 md:grid-cols-2 lg:grid-cols-3'}
            aria-busy="true"
          >
            {Array.from({ length: blogCategory ? 3 : 6 }, (_, index) => (
              <Skeleton className={blogCategory ? 'h-64' : 'h-48'} key={index} />
            ))}
          </div>
        ) : content.isError ? (
          <Alert
            tone="danger"
            title="Không tải được danh sách"
            action={
              <Button variant="secondary" onClick={() => void content.refetch()}>
                Thử lại
              </Button>
            }
          >
            {content.error.message}
          </Alert>
        ) : content.data.items.length === 0 ? (
          <EmptyState title="Chưa có nội dung được công bố" />
        ) : (
          <>
            {blogCategory && detailBase ? (
              <>
                <h2 className="mb-8 text-3xl font-semibold text-primary">Bài Viết</h2>
                <ul className="space-y-8">
                  {content.data.items.map((item, index) => (
                    <BlogCard
                      key={item.id}
                      item={item}
                      category={blogCategory}
                      detailBase={detailBase}
                      lead={blogCategory === 'parent' && page === 1 && index === 0}
                    />
                  ))}
                </ul>
              </>
            ) : (
              <ul className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {content.data.items.map((item) => (
                  <li
                    key={item.id}
                    className="rounded-xl border border-border bg-surface p-5 shadow-card"
                  >
                    <p className="text-xs font-semibold uppercase tracking-wide text-primary">
                      {KIND_LABELS[item.kind]}
                    </p>
                    <h2 className="mt-2 text-xl font-semibold text-fg">{item.title}</h2>
                    {item.summary && <p className="mt-2 text-sm text-muted">{item.summary}</p>}
                    {detailBase ? (
                      <Link
                        className="mt-4 inline-flex min-h-11 items-center font-medium text-primary underline underline-offset-4"
                        to={`${detailBase}/${encodeURIComponent(item.slug)}`}
                      >
                        Xem chi tiết
                      </Link>
                    ) : (
                      <div className="mt-4">
                        <ContentText text={item.bodyText} />
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {content.data.total > content.data.pageSize && (
              <nav
                aria-label="Trang nội dung"
                className="mt-8 flex items-center justify-center gap-4"
              >
                <Button variant="secondary" disabled={page <= 1} onClick={() => goToPage(page - 1)}>
                  Trang trước
                </Button>
                <span className="text-sm text-muted">
                  {page} / {Math.ceil(content.data.total / content.data.pageSize)}
                </span>
                <Button
                  variant="secondary"
                  disabled={page * content.data.pageSize >= content.data.total}
                  onClick={() => goToPage(page + 1)}
                >
                  Trang sau
                </Button>
              </nav>
            )}
          </>
        )}
      </section>
      {blogCategory && content.isSuccess && <BlogCallToAction category={blogCategory} />}
    </>
  );
}

export function PublishedContentRoute({
  kind,
  audience = 'public',
  fallbackTitle,
}: {
  kind: ContentKind;
  audience?: ContentAudience;
  fallbackTitle: string;
}) {
  const { id } = useParams();
  return (
    <PublishedContentPage
      kind={kind}
      slug={id ?? ''}
      audience={audience}
      fallbackTitle={fallbackTitle}
    />
  );
}

export function PublishedBlogArticleRoute() {
  const { category, id } = useParams();
  const prefix = category === 'phu-huynh' ? 'phu-huynh-' : category === 'gia-su' ? 'gia-su-' : null;
  if (!prefix || !id?.startsWith(prefix)) {
    return (
      <div className="mx-auto max-w-[var(--container-max)] px-4 py-10">
        <EmptyState
          title="Không tìm thấy bài viết"
          action={<ButtonLink to="/blog/phu-huynh">Xem bài viết</ButtonLink>}
        />
      </div>
    );
  }
  return <PublishedContentPage kind="blog" slug={id} fallbackTitle="Không tìm thấy bài viết" />;
}

/** Tutor-area article: only "gia-su-" articles are reachable here. */
export function TutorBlogArticleRoute() {
  const { id } = useParams();
  if (!id?.startsWith('gia-su-')) {
    return (
      <EmptyState
        title="Không tìm thấy bài viết"
        action={<ButtonLink to="/tutor/blog">Xem bài viết</ButtonLink>}
      />
    );
  }
  return <PublishedContentPage kind="blog" slug={id} fallbackTitle="Không tìm thấy bài viết" />;
}
