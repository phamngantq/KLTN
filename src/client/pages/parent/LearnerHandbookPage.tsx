import { useState, type FormEvent } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Brain,
  CalendarDays,
  Clock,
  GraduationCap,
  Search,
  Sparkles,
  Target,
  UserRound,
  UserSearch,
} from 'lucide-react';
import { Link, useParams, useSearchParams } from 'react-router';
import {
  CONTENT_CATEGORIES,
  CONTENT_CATEGORY_LABELS,
  type ContentCategory,
  type PublishedContent,
} from '../../../shared/schemas/content';
import { Button, ButtonLink } from '../../components/ui/Button';
import { Alert, EmptyState } from '../../components/ui/Feedback';
import { Skeleton } from '../../components/ui/Spinner';
import { usePublishedContentList } from '../../features/content/api';
import { requestDate } from '../../features/parent-requests/format';
import { PublishedContentPage } from '../public/PublishedContentPage';

/** Learner articles are the public blog collection with the "phu-huynh-" slug prefix. */
const SLUG_PREFIX = 'phu-huynh-';
const PAGE_SIZE = 6;

// No article images are stored; each category gets an illustrated panel instead.
const CATEGORY_ART: Record<ContentCategory | 'none', { icon: LucideIcon; className: string }> = {
  choosing_tutor: { icon: UserSearch, className: 'from-primary to-primary-gradient-end' },
  study_methods: { icon: BookOpen, className: 'from-success to-primary' },
  motivation: { icon: Sparkles, className: 'from-accent to-warning' },
  exam_prep: { icon: Target, className: 'from-danger to-primary' },
  skills: { icon: Brain, className: 'from-primary-gradient-end to-success' },
  none: { icon: GraduationCap, className: 'from-primary to-primary-gradient-end' },
};

/** Roughly 200 Vietnamese words per minute. */
function readingMinutes(text: string): number {
  return Math.max(1, Math.round(text.trim().split(/\s+/).length / 200));
}

export function LearnerHandbookPage() {
  const [params, setParams] = useSearchParams();
  const categoryParam = params.get('category');
  const category = CONTENT_CATEGORIES.includes(categoryParam as ContentCategory)
    ? (categoryParam as ContentCategory)
    : undefined;
  const q = params.get('q')?.slice(0, 100) ?? '';
  const rawPage = Number(params.get('page') ?? 1);
  const page = Number.isSafeInteger(rawPage) && rawPage >= 1 && rawPage <= 1000 ? rawPage : 1;
  const [keyword, setKeyword] = useState(q);
  const articles = usePublishedContentList({
    kind: 'blog',
    audience: 'public',
    slugPrefix: SLUG_PREFIX,
    category,
    q: q || undefined,
    page,
    pageSize: PAGE_SIZE,
  });

  function navigate(next: { category?: ContentCategory | null; q?: string; page?: number }) {
    const search = new URLSearchParams();
    const nextCategory = next.category === undefined ? category : next.category;
    const nextQ = next.q ?? q;
    if (nextCategory) search.set('category', nextCategory);
    if (nextQ) search.set('q', nextQ);
    if (next.page && next.page > 1) search.set('page', String(next.page));
    setParams(search);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    navigate({ q: keyword.trim() });
  }

  const totalPages = articles.data
    ? Math.max(1, Math.ceil(articles.data.total / articles.data.pageSize))
    : 1;

  return (
    <section className="flex min-w-0 flex-col gap-8">
      <header className="text-center">
        <h1 className="text-3xl font-bold text-primary md:text-4xl">Cẩm nang dành cho người học</h1>
        <p className="mt-2 text-muted">
          Kinh nghiệm chọn gia sư, phương pháp học và bí quyết ôn thi hiệu quả
        </p>
      </header>

      <div className="mx-auto flex w-full max-w-4xl flex-col gap-4">
        <form onSubmit={submit} role="search" className="flex gap-2">
          <label htmlFor="handbook-search" className="sr-only">
            Tìm bài cẩm nang
          </label>
          <div className="relative min-w-0 flex-1">
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted"
            />
            <input
              id="handbook-search"
              type="search"
              maxLength={100}
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              placeholder="Tìm theo tiêu đề hoặc nội dung…"
              className="min-h-11 w-full rounded-lg border border-border-strong bg-bg py-2 pr-3 pl-9 text-fg focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus"
            />
          </div>
          <Button type="submit">Tìm kiếm</Button>
        </form>
        <div role="group" aria-label="Danh mục cẩm nang" className="flex flex-wrap gap-2">
          {[null, ...CONTENT_CATEGORIES].map((value) => {
            const selected = (value ?? undefined) === category;
            return (
              <button
                key={value ?? 'all'}
                type="button"
                aria-pressed={selected}
                onClick={() => navigate({ category: value, page: 1 })}
                className={`min-h-11 rounded-full border px-4 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus ${
                  selected
                    ? 'border-primary bg-primary text-on-primary'
                    : 'border-border bg-bg text-primary hover:bg-info-surface'
                }`}
              >
                {value ? CONTENT_CATEGORY_LABELS[value] : 'Tất cả'}
              </button>
            );
          })}
        </div>
        {(q || category) && articles.data && (
          <p role="status" className="text-sm text-muted">
            Tìm thấy {articles.data.total} bài
            {category ? ` trong “${CONTENT_CATEGORY_LABELS[category]}”` : ''}
            {q ? ` cho “${q}”` : ''}.{' '}
            <button
              type="button"
              className="font-medium text-primary underline underline-offset-4"
              onClick={() => {
                setKeyword('');
                navigate({ category: null, q: '' });
              }}
            >
              Xóa bộ lọc
            </button>
          </p>
        )}
      </div>

      <div className="mx-auto flex w-full max-w-4xl flex-col gap-5">
        {articles.isPending ? (
          <>
            <Skeleton className="h-48" />
            <Skeleton className="h-48" />
          </>
        ) : articles.isError ? (
          <Alert
            tone="danger"
            title="Không tải được cẩm nang"
            action={
              <Button variant="secondary" onClick={() => void articles.refetch()}>
                Thử lại
              </Button>
            }
          >
            {articles.error.message}
          </Alert>
        ) : articles.data.items.length === 0 ? (
          <EmptyState
            title="Chưa có bài cẩm nang phù hợp"
            description="Thử từ khóa khác hoặc chọn danh mục khác."
          />
        ) : (
          articles.data.items.map((article) => <ArticleCard key={article.id} article={article} />)
        )}
        {articles.data && totalPages > 1 && (
          <nav aria-label="Trang cẩm nang" className="flex items-center justify-center gap-3">
            <Button
              variant="secondary"
              disabled={page <= 1}
              onClick={() => navigate({ page: page - 1 })}
            >
              Trang trước
            </Button>
            <span className="text-sm text-muted">
              Trang {page} / {totalPages}
            </span>
            <Button
              variant="secondary"
              disabled={page >= totalPages}
              onClick={() => navigate({ page: page + 1 })}
            >
              Trang sau
            </Button>
          </nav>
        )}
      </div>

      <aside className="mx-auto w-full max-w-5xl rounded-xl bg-surface px-6 py-10 text-center">
        <h2 className="text-2xl font-semibold text-primary">Cần Hỗ Trợ Tìm Gia Sư?</h2>
        <p className="mt-3 text-muted">
          Chúng tôi luôn sẵn sàng tư vấn và giúp bạn tìm gia sư phù hợp nhất
        </p>
        <ButtonLink to="/parent/request" variant="accent" className="mt-6">
          Đăng ký tìm gia sư ngay
        </ButtonLink>
      </aside>
    </section>
  );
}

function ArticleCard({ article }: { article: PublishedContent }) {
  const art = CATEGORY_ART[article.category ?? 'none'];
  const Icon = art.icon;
  const to = `/parent/cam-nang/${encodeURIComponent(article.slug)}`;
  return (
    <article className="grid overflow-hidden rounded-xl border border-border bg-bg shadow-card md:grid-cols-[16rem_minmax(0,1fr)]">
      <div
        aria-hidden="true"
        className={`flex min-h-40 items-center justify-center bg-gradient-to-br ${art.className}`}
      >
        <Icon className="size-16 text-white/90" strokeWidth={1.5} />
      </div>
      <div className="flex min-w-0 flex-col gap-3 p-5 md:p-6">
        {article.category && (
          <span className="self-start rounded-full bg-info-surface px-3 py-0.5 text-xs font-medium text-primary">
            {CONTENT_CATEGORY_LABELS[article.category]}
          </span>
        )}
        <h2 className="text-xl font-semibold text-primary">
          <Link
            to={to}
            className="underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          >
            {article.title}
          </Link>
        </h2>
        <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
          {article.authorName && (
            <span className="inline-flex items-center gap-1">
              <UserRound aria-hidden="true" className="size-3.5" />
              {article.authorName}
            </span>
          )}
          <span className="inline-flex items-center gap-1">
            <CalendarDays aria-hidden="true" className="size-3.5" />
            {requestDate(article.publishedAt)}
          </span>
          <span className="inline-flex items-center gap-1">
            <Clock aria-hidden="true" className="size-3.5" />
            {readingMinutes(article.bodyText)} phút đọc
          </span>
        </p>
        {article.summary && <p className="line-clamp-2 text-sm text-muted">{article.summary}</p>}
        <ButtonLink to={to} size="sm" className="mt-1 gap-2 self-start">
          Đọc thêm
          <ArrowRight aria-hidden="true" className="size-4" />
        </ButtonLink>
      </div>
    </article>
  );
}

export function LearnerHandbookArticlePage() {
  const { id } = useParams();
  if (!id?.startsWith(SLUG_PREFIX)) {
    return (
      <EmptyState
        title="Không tìm thấy bài viết"
        action={<ButtonLink to="/parent/cam-nang">Về cẩm nang</ButtonLink>}
      />
    );
  }
  return (
    <div className="flex flex-col gap-4">
      <Link
        to="/parent/cam-nang"
        className="inline-flex min-h-11 items-center gap-2 self-start text-sm font-medium text-primary underline-offset-4 hover:underline"
      >
        <ArrowLeft aria-hidden="true" className="size-4" />
        Về cẩm nang
      </Link>
      <PublishedContentPage kind="blog" slug={id} fallbackTitle="Không tìm thấy bài viết" />
    </div>
  );
}
