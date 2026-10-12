import { BookOpen, CheckCircle2, GraduationCap, HeartHandshake, Search } from 'lucide-react';
import { useSearchParams } from 'react-router';
import { Button, ButtonLink } from '../../components/ui/Button';
import { Alert, EmptyState } from '../../components/ui/Feedback';
import { Skeleton } from '../../components/ui/Spinner';
import { usePublishedContentList } from '../../features/content/api';
import { ContentText } from './PublishedContentPage';

const STEPS = [
  {
    title: 'Gửi yêu cầu',
    description: 'Người học nhập môn học, khối lớp, hình thức và lịch mong muốn.',
  },
  {
    title: 'Kiểm duyệt lớp',
    description: 'Kiểm duyệt viên xem yêu cầu trước khi công bố thông tin lớp có thể chia sẻ.',
  },
  {
    title: 'Gia sư ứng tuyển',
    description: 'Gia sư xem lớp được công bố và chọn phương án phí hiện hành khi ứng tuyển.',
  },
  {
    title: 'Điều phối',
    description: 'Kiểm duyệt viên gán gia sư cho lớp và lớp bắt đầu hoạt động.',
  },
] as const;

export function PublicServicesPage() {
  const [params, setParams] = useSearchParams();
  const requestedPage = Number(params.get('page') ?? 1);
  const page =
    Number.isSafeInteger(requestedPage) && requestedPage >= 1 && requestedPage <= 1000
      ? requestedPage
      : 1;
  const services = usePublishedContentList({
    kind: 'service',
    audience: 'public',
    page,
    pageSize: 12,
  });
  const serviceIcons = [Search, GraduationCap, BookOpen, HeartHandshake];

  function goToPage(nextPage: number) {
    const next = new URLSearchParams(params);
    if (nextPage === 1) next.delete('page');
    else next.set('page', String(nextPage));
    setParams(next);
    document.getElementById('main')?.focus();
  }

  return (
    <>
      <header className="bg-gradient-to-br from-primary to-primary-gradient-end px-4 py-16 text-center text-on-primary">
        <div className="mx-auto max-w-4xl">
          <h1 className="text-4xl font-bold md:text-5xl">Dịch Vụ Của Chúng Tôi</h1>
          <p className="mt-6 text-xl text-on-primary/90">
            Kết nối nhu cầu học tập của người học với gia sư qua quy trình điều phối lớp.
          </p>
        </div>
      </header>

      <section className="px-4 py-16" aria-labelledby="services-heading">
        <div className="mx-auto max-w-[var(--container-max)]">
          <div className="mb-12 text-center">
            <h2 id="services-heading" className="text-3xl font-bold text-primary">
              Các Dịch Vụ Chính
            </h2>
            <p className="mt-4 text-lg text-muted">Nội dung dịch vụ đã được công bố.</p>
          </div>
          <div aria-live="polite">
            {services.isPending ? (
              <div className="grid gap-8 md:grid-cols-2" aria-busy="true">
                {Array.from({ length: 4 }, (_, index) => (
                  <Skeleton key={index} className="h-64" />
                ))}
              </div>
            ) : services.isError ? (
              <Alert
                tone="danger"
                title="Không tải được danh sách"
                action={
                  <Button variant="secondary" onClick={() => void services.refetch()}>
                    Thử lại
                  </Button>
                }
              >
                {services.error.message}
              </Alert>
            ) : services.data.items.length === 0 ? (
              <EmptyState title="Chưa có nội dung được công bố" />
            ) : (
              <>
                <ul className="grid gap-8 md:grid-cols-2">
                  {services.data.items.map((item, index) => {
                    const Icon = serviceIcons[index % serviceIcons.length]!;
                    return (
                      <li
                        key={item.id}
                        className="rounded-xl border border-primary/20 bg-bg p-6 shadow-card transition-shadow hover:shadow-lg motion-reduce:transition-none"
                      >
                        <span
                          aria-hidden="true"
                          className="mb-5 flex size-16 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-primary-gradient-end text-on-primary"
                        >
                          <Icon className="size-8" />
                        </span>
                        <h3 className="text-2xl font-semibold text-primary">{item.title}</h3>
                        {item.summary && <p className="mt-2 text-muted">{item.summary}</p>}
                        <div className="mt-5 border-t border-border pt-5">
                          <ContentText text={item.bodyText} />
                        </div>
                      </li>
                    );
                  })}
                </ul>
                {services.data.total > services.data.pageSize && (
                  <nav
                    aria-label="Trang dịch vụ"
                    className="mt-8 flex items-center justify-center gap-4"
                  >
                    <Button
                      variant="secondary"
                      disabled={page <= 1}
                      onClick={() => goToPage(page - 1)}
                    >
                      Trang trước
                    </Button>
                    <span className="text-sm text-muted">
                      {page} / {Math.ceil(services.data.total / services.data.pageSize)}
                    </span>
                    <Button
                      variant="secondary"
                      disabled={page * services.data.pageSize >= services.data.total}
                      onClick={() => goToPage(page + 1)}
                    >
                      Trang sau
                    </Button>
                  </nav>
                )}
              </>
            )}
          </div>
        </div>
      </section>

      <section className="bg-surface px-4 py-16" aria-labelledby="service-fee-heading">
        <div className="mx-auto max-w-5xl rounded-xl border-2 border-accent bg-bg p-6 shadow-card md:p-8">
          <div className="flex items-start gap-4">
            <span
              aria-hidden="true"
              className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-accent text-on-accent"
            >
              <CheckCircle2 className="size-6" />
            </span>
            <div>
              <h2 id="service-fee-heading" className="text-2xl font-semibold text-primary">
                Người học tìm gia sư miễn phí
              </h2>
              <p className="mt-2 text-muted">
                Người học không trả phí dịch vụ tìm gia sư. Gia sư xem phương án phí nhận lớp do
                kiểm duyệt viên công bố khi ứng tuyển.
              </p>
              <ButtonLink to="/bang-gia" variant="secondary" className="mt-5">
                Xem bảng giá
              </ButtonLink>
            </div>
          </div>
        </div>
      </section>

      <section className="px-4 py-16" aria-labelledby="service-process-heading">
        <div className="mx-auto max-w-[var(--container-max)]">
          <div className="mb-12 text-center">
            <h2 id="service-process-heading" className="text-3xl font-bold text-primary">
              Quy Trình Làm Việc
            </h2>
          </div>
          <ol className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
            {STEPS.map((step, index) => (
              <li
                key={step.title}
                className="rounded-xl border border-primary/20 bg-bg p-6 text-center shadow-card"
              >
                <span className="mx-auto flex size-14 items-center justify-center rounded-full bg-accent text-lg font-bold text-on-accent">
                  {String(index + 1).padStart(2, '0')}
                </span>
                <h3 className="mt-4 text-lg font-semibold text-primary">{step.title}</h3>
                <p className="mt-2 text-sm text-muted">{step.description}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="bg-gradient-to-br from-primary to-primary-gradient-end px-4 py-16 text-center text-on-primary">
        <div className="mx-auto max-w-3xl">
          <h2 className="text-3xl font-bold">Sẵn Sàng Bắt Đầu?</h2>
          <p className="mt-4 text-xl text-on-primary/90">
            Gửi yêu cầu tìm gia sư hoặc xem các lớp đang nhận ứng tuyển.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-4">
            <ButtonLink to="/parent/request" variant="accent" className="px-8 text-lg">
              Gửi yêu cầu tìm gia sư
            </ButtonLink>
            <ButtonLink
              to="/lop-hoc"
              className="border border-white/30 bg-primary px-8 text-lg hover:bg-primary-hover"
            >
              Xem lớp đang tìm gia sư
            </ButtonLink>
          </div>
        </div>
      </section>
    </>
  );
}
