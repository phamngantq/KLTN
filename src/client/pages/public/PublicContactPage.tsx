import { Button, buttonClass } from '../../components/ui/Button';
import { Alert, EmptyState } from '../../components/ui/Feedback';
import { Skeleton } from '../../components/ui/Spinner';
import { usePublishedContent } from '../../features/content/api';
import { isApiError } from '../../lib/api-client';

function contactLinks(text: string) {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const phone = lines.find((line) => /^Hotline:/i.test(line))?.replace(/^Hotline:\s*/i, '');
  const email = lines.find((line) => /^Email:/i.test(line))?.replace(/^Email:\s*/i, '');
  const dial = phone?.replace(/[^+\d]/g, '');
  return {
    lines,
    dial: dial && /^\+?\d{7,15}$/.test(dial) ? dial : null,
    email: email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null,
  };
}

export function PublicContactPage() {
  const content = usePublishedContent('page', 'contact', 'public');
  if (content.isPending) {
    return (
      <div className="mx-auto max-w-[var(--container-max)] space-y-4 px-4 py-10" aria-busy="true">
        <Skeleton className="h-16 w-3/4" />
        <Skeleton className="h-64" />
      </div>
    );
  }
  if (content.isError) {
    return (
      <div className="mx-auto max-w-[var(--container-max)] px-4 py-10">
        {isApiError(content.error, 'CONTENT_NOT_FOUND') ? (
          <EmptyState title="Chưa có thông tin liên hệ được công bố" />
        ) : (
          <Alert
            tone="danger"
            title="Không tải được thông tin liên hệ"
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
  const { lines, dial, email } = contactLinks(content.data.bodyText);
  return (
    <>
      <header className="bg-gradient-to-br from-primary to-primary-gradient-end px-4 py-12 text-on-primary md:py-16">
        <div className="mx-auto max-w-[var(--container-max)]">
          <p className="text-sm font-semibold tracking-wide text-accent">LIÊN HỆ</p>
          <h1 className="mt-3 text-3xl font-bold md:text-4xl">{content.data.title}</h1>
          {content.data.summary && (
            <p className="mt-4 text-lg text-on-primary/90">{content.data.summary}</p>
          )}
        </div>
      </header>
      <section className="mx-auto grid max-w-[var(--container-max)] gap-6 px-4 py-10 lg:grid-cols-[2fr_1fr]">
        <div className="rounded-xl border border-border bg-surface p-6 shadow-card">
          <h2 className="text-xl font-semibold text-primary">Thông tin liên hệ</h2>
          <dl className="mt-5 space-y-4">
            {lines.map((line, index) => {
              const separator = line.indexOf(':');
              return separator > 0 ? (
                <div key={index}>
                  <dt className="text-sm font-semibold">{line.slice(0, separator)}</dt>
                  <dd className="mt-1 break-words text-muted">
                    {line.slice(separator + 1).trim()}
                  </dd>
                </div>
              ) : (
                <div key={index}>
                  <dd>{line}</dd>
                </div>
              );
            })}
          </dl>
          <div className="mt-6 flex flex-wrap gap-3">
            {dial && (
              <a className={buttonClass()} href={`tel:${dial}`}>
                Gọi ngay
              </a>
            )}
            {email && (
              <a className={buttonClass('secondary')} href={`mailto:${email}`}>
                Gửi email
              </a>
            )}
          </div>
        </div>
        <Alert tone="info" title="Kênh liên hệ">
          Hãy liên hệ qua số điện thoại hoặc email đã được công bố. Biểu mẫu gửi tin trực tuyến chưa
          mở.
        </Alert>
      </section>
    </>
  );
}
