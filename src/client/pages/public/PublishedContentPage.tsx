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
  return <PublishedArticle item={content.data} />;
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
      <Hero eyebrow={KIND_LABELS[kind]} title={title} summary={description} />
      <section className="mx-auto max-w-[var(--container-max)] px-4 py-10" aria-live="polite">
        {content.isPending ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3" aria-busy="true">
            {Array.from({ length: 6 }, (_, index) => (
              <Skeleton className="h-48" key={index} />
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
