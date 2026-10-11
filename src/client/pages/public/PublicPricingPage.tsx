import { useQuery } from '@tanstack/react-query';
import type { FeeOptionKey, FeeOptionVersion } from '../../../shared/schemas/classes';
import { Button, ButtonLink } from '../../components/ui/Button';
import { Alert, Badge, EmptyState } from '../../components/ui/Feedback';
import { Skeleton } from '../../components/ui/Spinner';
import { usePublishedContent, usePublishedContentList } from '../../features/content/api';
import { useSubjects } from '../../features/tutor-profile/api';
import { api, isApiError } from '../../lib/api-client';
import { ContentText } from './PublishedContentPage';

const OPTION_LABELS: Record<FeeOptionKey, string> = {
  first_lesson_percent: 'Theo buổi học đầu tiên',
  lesson_multiplier_with_deposit: 'Theo số buổi học và đặt cọc',
  monthly_percent: 'Theo học phí tháng',
};

function rateText(option: FeeOptionVersion): string {
  if (option.optionKey === 'lesson_multiplier_with_deposit') {
    const lessons = option.rateBasisPoints / 10_000;
    const deposit = (option.depositBasisPoints ?? 0) / 100;
    return `${lessons.toLocaleString('vi-VN')} buổi học · đặt cọc ${deposit.toLocaleString('vi-VN')}%`;
  }
  const percent = option.rateBasisPoints / 100;
  return `${percent.toLocaleString('vi-VN')}% ${option.optionKey === 'first_lesson_percent' ? 'học phí buổi đầu' : 'học phí tháng'}`;
}

export function PublicPricingPage() {
  const editorial = usePublishedContent('page', 'pricing', 'public');
  const faq = usePublishedContentList({ kind: 'faq', audience: 'public', page: 1, pageSize: 12 });
  const subjects = useSubjects();
  const fees = useQuery({
    queryKey: ['published-fee-options'],
    queryFn: ({ signal }) => api.get<FeeOptionVersion[]>('/fee-options/published', { signal }),
  });
  const editorialMissing = editorial.isError && isApiError(editorial.error, 'CONTENT_NOT_FOUND');
  const subjectName = new Map(subjects.data?.map((subject) => [subject.id, subject.name]));

  return (
    <>
      <header className="bg-gradient-to-br from-primary to-primary-gradient-end px-4 py-12 text-on-primary md:py-16">
        <div className="mx-auto max-w-[var(--container-max)]">
          <p className="text-sm font-semibold tracking-wide text-accent">BẢNG GIÁ</p>
          <h1 className="mt-3 text-3xl font-bold md:text-4xl">Phí dịch vụ</h1>
          <p className="mt-4 max-w-2xl text-lg text-on-primary/90">
            Phụ huynh gửi yêu cầu tìm gia sư miễn phí. Gia sư chọn phương án phí đã công bố khi ứng
            tuyển lớp.
          </p>
        </div>
      </header>
      <div className="mx-auto max-w-[var(--container-max)] space-y-10 px-4 py-10">
        <section
          aria-labelledby="parent-fee-heading"
          className="rounded-xl border border-border bg-surface p-6 shadow-card"
        >
          <Badge tone="success">Phụ huynh</Badge>
          <h2 id="parent-fee-heading" className="mt-3 text-2xl font-semibold">
            Miễn phí dịch vụ tìm gia sư
          </h2>
          <p className="mt-2 text-muted">
            Học phí của lớp được thỏa thuận theo yêu cầu và gia sư được gán.
          </p>
          <ButtonLink to="/parent/request" className="mt-5">
            Gửi yêu cầu
          </ButtonLink>
        </section>

        {editorial.isPending ? (
          <Skeleton className="h-32" />
        ) : editorial.isSuccess ? (
          <section
            aria-labelledby="pricing-copy-heading"
            className="rounded-xl border border-border bg-surface p-6"
          >
            <h2 id="pricing-copy-heading" className="text-2xl font-semibold">
              {editorial.data.title}
            </h2>
            {editorial.data.summary && <p className="mt-2 text-muted">{editorial.data.summary}</p>}
            <div className="mt-4">
              <ContentText text={editorial.data.bodyText} />
            </div>
          </section>
        ) : !editorialMissing ? (
          <Alert
            tone="danger"
            title="Không tải được phần giới thiệu"
            action={
              <Button variant="secondary" onClick={() => void editorial.refetch()}>
                Thử lại
              </Button>
            }
          >
            {editorial.error.message}
          </Alert>
        ) : null}

        <section aria-labelledby="tutor-fee-heading" className="space-y-4">
          <div>
            <h2 id="tutor-fee-heading" className="text-2xl font-semibold">
              Phương án phí dành cho gia sư
            </h2>
            <p className="mt-2 text-muted">
              Kiểm duyệt viên công bố mức phí và thời điểm áp dụng cho từng phương án. Phí nhận lớp
              chỉ được lựa chọn trong quy trình ứng tuyển.
            </p>
          </div>
          {fees.isPending ? (
            <div className="grid gap-4 md:grid-cols-3">
              {Array.from({ length: 3 }, (_, index) => (
                <Skeleton key={index} className="h-52" />
              ))}
            </div>
          ) : fees.isError ? (
            <Alert
              tone="danger"
              title="Không tải được phương án phí"
              action={
                <Button variant="secondary" onClick={() => void fees.refetch()}>
                  Thử lại
                </Button>
              }
            >
              {fees.error.message}
            </Alert>
          ) : fees.data.length === 0 ? (
            <EmptyState
              title="Chưa có phương án phí được công bố"
              description="Kiểm duyệt viên chưa công bố mức phí áp dụng. Hệ thống chưa nhận ứng tuyển lớp khi không có phương án phù hợp."
            />
          ) : (
            <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {fees.data.map((option) => (
                <li
                  key={option.id}
                  className="rounded-xl border border-border bg-surface p-5 shadow-card"
                >
                  <p className="text-sm font-semibold text-primary">
                    {OPTION_LABELS[option.optionKey]}
                  </p>
                  <h3 className="mt-2 text-xl font-bold">{option.title}</h3>
                  <p className="mt-3 text-lg font-semibold">{rateText(option)}</p>
                  <p className="mt-3 whitespace-pre-line text-sm text-muted">{option.policyText}</p>
                  <dl className="mt-4 space-y-1 border-t border-border pt-3 text-sm">
                    {option.scopeSubjectId && (
                      <div className="flex gap-2">
                        <dt className="font-medium">Môn:</dt>
                        <dd>{subjectName.get(option.scopeSubjectId) ?? 'Môn được chỉ định'}</dd>
                      </div>
                    )}
                    {option.scopeMode && (
                      <div className="flex gap-2">
                        <dt className="font-medium">Hình thức:</dt>
                        <dd>{option.scopeMode === 'online' ? 'Trực tuyến' : 'Trực tiếp'}</dd>
                      </div>
                    )}
                    <div className="flex gap-2">
                      <dt className="font-medium">Phiên bản:</dt>
                      <dd>{option.version}</dd>
                    </div>
                  </dl>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section aria-labelledby="pricing-faq-heading" className="space-y-4">
          <h2 id="pricing-faq-heading" className="text-2xl font-semibold">
            Câu Hỏi Thường Gặp
          </h2>
          {faq.isPending ? (
            <Skeleton className="h-24" />
          ) : faq.isError ? (
            <Alert
              tone="danger"
              title="Không tải được câu hỏi thường gặp"
              action={
                <Button variant="secondary" onClick={() => void faq.refetch()}>
                  Thử lại
                </Button>
              }
            >
              {faq.error.message}
            </Alert>
          ) : faq.data.items.length ? (
            <div className="space-y-3">
              {faq.data.items.map((item) => (
                <details key={item.id} className="rounded-xl border border-border bg-surface p-4">
                  <summary className="min-h-11 cursor-pointer font-semibold text-primary focus-visible:outline-2 focus-visible:outline-focus">
                    {item.title}
                  </summary>
                  <div className="mt-3">
                    <ContentText text={item.bodyText} />
                  </div>
                </details>
              ))}
            </div>
          ) : (
            <p className="text-muted">Chưa có câu hỏi thường gặp được công bố.</p>
          )}
        </section>
      </div>
    </>
  );
}
