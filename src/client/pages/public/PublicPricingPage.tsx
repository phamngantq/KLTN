import { useQuery } from '@tanstack/react-query';
import { BadgeCheck, CheckCircle2, CircleHelp, GraduationCap, Info, Wallet } from 'lucide-react';
import type { FeeOptionKey, FeeOptionVersion } from '../../../shared/schemas/classes';
import type { ClassFeeGuidanceVersion, TuitionPriceVersion } from '../../../shared/schemas/pricing';
import { Button, ButtonLink } from '../../components/ui/Button';
import { Alert, Badge, EmptyState } from '../../components/ui/Feedback';
import { Skeleton } from '../../components/ui/Spinner';
import { usePublishedContent, usePublishedContentList } from '../../features/content/api';
import { useSubjects } from '../../features/tutor-profile/api';
import { api, isApiError } from '../../lib/api-client';
import { formatVnd } from '../../lib/format';
import { ContentText } from './PublishedContentPage';

const OPTION_LABELS: Record<FeeOptionKey, string> = {
  first_lesson_percent: 'Theo buổi học đầu tiên',
  lesson_multiplier_with_deposit: 'Theo số buổi học và đặt cọc',
  monthly_percent: 'Theo học phí tháng',
};

const LEVEL_LABELS = {
  basic: 'Cơ bản',
  advanced: 'Nâng cao',
  intensive: 'Luyện thi chuyên sâu',
} as const;

function modeText(mode: 'online' | 'offline'): string {
  return mode === 'online' ? 'Trực tuyến' : 'Trực tiếp';
}

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
  const tuition = useQuery({
    queryKey: ['published-tuition-prices'],
    queryFn: ({ signal }) => api.get<TuitionPriceVersion[]>('/pricing/tuition', { signal }),
  });
  const classFeeGuidance = useQuery({
    queryKey: ['published-class-fee-guidance'],
    queryFn: ({ signal }) => api.get<ClassFeeGuidanceVersion[]>('/pricing/class-fees', { signal }),
  });
  const editorialMissing = editorial.isError && isApiError(editorial.error, 'CONTENT_NOT_FOUND');
  const subjectName = new Map(subjects.data?.map((subject) => [subject.id, subject.name]));
  const tuitionByGrade = new Map<string, TuitionPriceVersion[]>();
  for (const item of tuition.data ?? []) {
    const rows = tuitionByGrade.get(item.gradeLabel) ?? [];
    rows.push(item);
    tuitionByGrade.set(item.gradeLabel, rows);
  }

  return (
    <>
      <header className="bg-gradient-to-br from-primary to-primary-gradient-end px-4 py-16 text-center text-on-primary">
        <div className="mx-auto max-w-4xl">
          <Wallet aria-hidden="true" className="mx-auto mb-6 size-16 text-accent" />
          <h1 className="text-4xl font-bold md:text-5xl">Bảng Giá Gia Sư</h1>
          <p className="mt-6 text-xl text-on-primary/90">
            Phụ huynh tìm gia sư miễn phí. Phương án phí nhận lớp dành cho gia sư được công bố theo
            từng phiên bản.
          </p>
        </div>
      </header>
      <div className="mx-auto max-w-[var(--container-max)] space-y-16 px-4 py-16">
        <div className="text-center">
          <h2 className="text-3xl font-bold text-primary">Phí dịch vụ</h2>
          <p className="mt-3 text-lg text-muted">
            Xem chính sách dành cho phụ huynh và phương án đã công bố cho gia sư.
          </p>
        </div>
        <section
          aria-labelledby="parent-fee-heading"
          className="mx-auto max-w-4xl rounded-xl border-2 border-accent bg-gradient-to-br from-warning-surface to-bg p-6 shadow-card md:p-8"
        >
          <div className="flex flex-col items-start gap-5 sm:flex-row">
            <span
              aria-hidden="true"
              className="flex size-16 shrink-0 items-center justify-center rounded-xl bg-accent text-on-accent"
            >
              <BadgeCheck className="size-8" />
            </span>
            <div>
              <Badge tone="success">Phụ huynh</Badge>
              <h2 id="parent-fee-heading" className="mt-3 text-2xl font-semibold text-primary">
                Miễn phí dịch vụ tìm gia sư
              </h2>
              <p className="mt-2 text-muted">
                Học phí của lớp được thỏa thuận theo yêu cầu và gia sư được gán.
              </p>
              <ButtonLink to="/parent/request" className="mt-5">
                Gửi yêu cầu
              </ButtonLink>
            </div>
          </div>
        </section>

        <section aria-labelledby="tuition-prices-heading" className="space-y-6">
          <div className="text-center">
            <h2 id="tuition-prices-heading" className="text-3xl font-bold text-primary">
              Bảng giá học phí theo môn và lớp
            </h2>
            <p className="mt-3 text-muted">
              Mức học phí tham khảo cho mỗi buổi học. Mức dự kiến của từng lớp được hiển thị riêng
              trong thông tin lớp.
            </p>
          </div>
          {tuition.isPending ? (
            <Skeleton className="h-48" />
          ) : tuition.isError ? (
            <Alert
              tone="danger"
              title="Không tải được bảng giá học phí"
              action={
                <Button variant="secondary" onClick={() => void tuition.refetch()}>
                  Thử lại
                </Button>
              }
            >
              {tuition.error.message}
            </Alert>
          ) : tuition.data.length === 0 ? (
            <EmptyState
              title="Chưa có bảng giá học phí được công bố"
              description="Liên hệ trung tâm để được tư vấn mức học phí phù hợp."
            />
          ) : (
            <div className="grid gap-6 lg:grid-cols-2">
              {[...tuitionByGrade].map(([grade, rows]) => (
                <div
                  key={grade}
                  className="overflow-hidden rounded-xl border border-primary/20 bg-bg shadow-card"
                >
                  <h3 className="bg-gradient-to-r from-primary to-primary-gradient-end px-5 py-4 text-xl font-semibold text-on-primary">
                    {grade}
                  </h3>
                  <ul className="divide-y divide-border">
                    {rows.map((item) => (
                      <li
                        key={item.id}
                        className="flex flex-col gap-2 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div>
                          <p className="font-semibold text-fg">{item.subjectName}</p>
                          <p className="text-sm text-muted">
                            {LEVEL_LABELS[item.level]} · {modeText(item.mode)}
                          </p>
                        </div>
                        <p className="font-bold text-primary">
                          {formatVnd(item.pricePerSessionMinor)}/buổi
                        </p>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </section>

        {editorial.isPending ? (
          <Skeleton className="h-32" />
        ) : editorial.isSuccess ? (
          <section
            aria-labelledby="pricing-copy-heading"
            className="mx-auto max-w-4xl rounded-xl border-2 border-accent bg-warning-surface p-6 shadow-card"
          >
            <h2
              id="pricing-copy-heading"
              className="flex items-center gap-3 text-2xl font-semibold text-primary"
            >
              <Info aria-hidden="true" className="size-7 shrink-0" />
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

        <section aria-labelledby="tutor-fee-heading" className="space-y-8">
          <div className="text-center">
            <GraduationCap aria-hidden="true" className="mx-auto mb-3 size-10 text-primary" />
            <h2 id="tutor-fee-heading" className="text-3xl font-bold text-primary">
              Phương án phí dành cho gia sư
            </h2>
            <p className="mx-auto mt-3 max-w-2xl text-lg text-muted">
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
            <ul className="grid gap-8 md:grid-cols-2 xl:grid-cols-3">
              {fees.data.map((option) => (
                <li
                  key={option.id}
                  className="overflow-hidden rounded-xl border-2 border-primary/20 bg-bg shadow-card"
                >
                  <div className="bg-gradient-to-r from-primary to-primary-gradient-end px-5 py-4 text-on-primary">
                    <p className="text-sm font-semibold text-accent">
                      {OPTION_LABELS[option.optionKey]}
                    </p>
                    <h3 className="mt-2 text-xl font-bold">{option.title}</h3>
                  </div>
                  <div className="p-5">
                    <p className="text-lg font-semibold text-primary">{rateText(option)}</p>
                    <p className="mt-3 whitespace-pre-line text-sm text-muted">
                      {option.policyText}
                    </p>
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
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section aria-labelledby="class-fee-guidance-heading" className="space-y-5">
          <div className="text-center">
            <h2 id="class-fee-guidance-heading" className="text-3xl font-bold text-primary">
              Khoảng phí nhận lớp tham khảo
            </h2>
            <p className="mt-3 text-muted">
              Khoảng theo hình thức dạy chỉ để tham khảo. Phí áp dụng được xác định theo phương án
              gia sư chọn khi ứng tuyển, không phải khoản thu thêm của phụ huynh.
            </p>
          </div>
          {classFeeGuidance.isPending ? (
            <Skeleton className="h-32" />
          ) : classFeeGuidance.isError ? (
            <Alert
              tone="danger"
              title="Không tải được khoảng phí tham khảo"
              action={
                <Button variant="secondary" onClick={() => void classFeeGuidance.refetch()}>
                  Thử lại
                </Button>
              }
            >
              {classFeeGuidance.error.message}
            </Alert>
          ) : classFeeGuidance.data.length === 0 ? (
            <EmptyState title="Chưa có khoảng phí tham khảo được công bố" />
          ) : (
            <ul className="grid gap-4 md:grid-cols-2">
              {classFeeGuidance.data.map((item) => (
                <li
                  key={item.id}
                  className="rounded-xl border border-primary/20 bg-bg p-5 shadow-card"
                >
                  <h3 className="text-lg font-semibold text-primary">{modeText(item.mode)}</h3>
                  <p className="mt-2 text-2xl font-bold text-primary">
                    {formatVnd(item.minFeeMinor)} – {formatVnd(item.maxFeeMinor)}
                  </p>
                  <p className="mt-2 text-sm text-muted">{item.description}</p>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section aria-labelledby="pricing-faq-heading" className="space-y-8 bg-surface px-4 py-12">
          <div className="text-center">
            <CircleHelp aria-hidden="true" className="mx-auto mb-3 size-10 text-primary" />
            <h2 id="pricing-faq-heading" className="text-3xl font-bold text-primary">
              Câu Hỏi Thường Gặp
            </h2>
          </div>
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
            <div className="mx-auto max-w-3xl space-y-4">
              {faq.data.items.map((item) => (
                <details
                  key={item.id}
                  className="rounded-xl border border-primary/20 bg-bg p-5 shadow-card"
                >
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
      <section className="bg-gradient-to-br from-primary to-primary-gradient-end px-4 py-16 text-center text-on-primary">
        <div className="mx-auto max-w-3xl">
          <h2 className="text-3xl font-bold">Bạn Cần Tư Vấn Thêm?</h2>
          <p className="mt-4 text-xl text-on-primary/90">
            Xem các thông tin đã công bố hoặc liên hệ để trao đổi về nhu cầu học tập.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-4">
            <ButtonLink to="/parent/request" variant="accent" className="px-8 text-lg">
              <CheckCircle2 aria-hidden="true" className="size-5" />
              Đăng ký tìm gia sư
            </ButtonLink>
            <ButtonLink
              to="/lien-he"
              className="border border-white/30 bg-primary px-8 text-lg hover:bg-primary-hover"
            >
              Liên hệ tư vấn
            </ButtonLink>
          </div>
        </div>
      </section>
    </>
  );
}
