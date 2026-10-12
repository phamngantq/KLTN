import { GraduationCap, Mail, MapPin, MessageCircle, Phone, ShieldCheck } from 'lucide-react';
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
      <header className="bg-gradient-to-br from-primary to-primary-gradient-end px-4 py-16 text-center text-on-primary">
        <div className="mx-auto max-w-4xl">
          <h1 className="text-4xl font-bold md:text-5xl">{content.data.title}</h1>
          {content.data.summary && (
            <p className="mt-6 text-xl text-on-primary/90">{content.data.summary}</p>
          )}
        </div>
      </header>
      <section className="px-4 py-16">
        <div className="mx-auto grid max-w-[var(--container-max)] gap-8 lg:grid-cols-5">
          <div className="lg:col-span-2">
            <h2 className="mb-6 text-2xl font-semibold text-primary">Thông tin liên hệ</h2>
            <dl className="space-y-4">
              {lines.map((line, index) => {
                const separator = line.indexOf(':');
                const label = separator > 0 ? line.slice(0, separator) : 'Thông tin';
                const value = separator > 0 ? line.slice(separator + 1).trim() : line;
                const Icon = /^địa chỉ$/i.test(label)
                  ? MapPin
                  : /^hotline$/i.test(label)
                    ? Phone
                    : /^email$/i.test(label)
                      ? Mail
                      : MessageCircle;
                return separator > 0 ? (
                  <div
                    key={index}
                    className="flex items-start gap-4 rounded-xl border border-primary/20 bg-bg p-4 shadow-card"
                  >
                    <span
                      aria-hidden="true"
                      className={`flex size-12 shrink-0 items-center justify-center rounded-lg ${index % 2 === 0 ? 'bg-gradient-to-br from-primary to-primary-gradient-end text-on-primary' : 'bg-accent text-on-accent'}`}
                    >
                      <Icon className="size-6" />
                    </span>
                    <div className="min-w-0">
                      <dt className="font-semibold text-primary">{label}</dt>
                      <dd className="mt-1 break-words text-sm text-muted">{value}</dd>
                    </div>
                  </div>
                ) : (
                  <div
                    key={index}
                    className="rounded-xl border border-primary/20 bg-bg p-4 shadow-card"
                  >
                    <dd>{value}</dd>
                  </div>
                );
              })}
            </dl>
          </div>
          <div className="lg:col-span-3">
            <div className="flex h-full min-h-80 flex-col justify-center rounded-xl border border-primary/20 bg-surface p-6 shadow-card md:p-10">
              <span
                aria-hidden="true"
                className="mb-5 flex size-16 items-center justify-center rounded-xl bg-accent text-on-accent"
              >
                <GraduationCap className="size-8" />
              </span>
              <h2 className="text-2xl font-semibold text-primary">Gửi tin nhắn cho chúng tôi</h2>
              <p className="mt-3 max-w-prose leading-relaxed text-muted">
                Liên hệ qua số điện thoại hoặc email đã được công bố để trao đổi về nhu cầu tìm gia
                sư. Hệ thống chưa mở biểu mẫu gửi tin trực tuyến.
              </p>
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
          </div>
        </div>
      </section>
      <section className="bg-surface px-4 py-12">
        <div className="mx-auto grid max-w-[var(--container-max)] gap-6 md:grid-cols-3">
          {[
            {
              icon: Phone,
              title: 'Tư vấn tìm gia sư',
              detail: 'Người học có thể gọi qua số điện thoại đã công bố.',
            },
            {
              icon: MessageCircle,
              title: 'Trao đổi nhu cầu',
              detail: 'Nêu môn học, cấp lớp và hình thức học mong muốn.',
            },
            {
              icon: ShieldCheck,
              title: 'Theo dõi yêu cầu',
              detail: 'Yêu cầu được kiểm duyệt trước khi công bố lớp.',
            },
          ].map(({ icon: Icon, title, detail }) => (
            <article
              key={title}
              className="rounded-xl border border-primary/20 bg-bg p-8 text-center shadow-card"
            >
              <span
                aria-hidden="true"
                className="mx-auto mb-4 flex size-16 items-center justify-center rounded-full bg-primary text-on-primary"
              >
                <Icon className="size-8" />
              </span>
              <h3 className="text-xl font-semibold text-primary">{title}</h3>
              <p className="mt-2 text-sm text-muted">{detail}</p>
            </article>
          ))}
        </div>
      </section>
      <section className="bg-gradient-to-br from-primary to-primary-gradient-end px-4 py-16 text-center text-on-primary">
        <div className="mx-auto max-w-3xl">
          <h2 className="text-3xl font-bold">Cần Tư Vấn Ngay?</h2>
          <p className="mt-4 text-xl text-on-primary/90">
            Chọn kênh liên hệ đã công bố để trao đổi trực tiếp.
          </p>
          {dial && (
            <a className={buttonClass('accent', 'md', 'mt-8 px-8 text-lg')} href={`tel:${dial}`}>
              <Phone aria-hidden="true" className="size-5" />
              Gọi điện tư vấn
            </a>
          )}
        </div>
      </section>
    </>
  );
}
