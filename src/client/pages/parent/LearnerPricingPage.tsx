import { useQuery } from '@tanstack/react-query';
import { BadgeCheck, BookOpen, GraduationCap, Info } from 'lucide-react';
import type { ReactNode } from 'react';
import {
  TUTOR_TYPE_LABELS,
  TUTOR_TYPES,
  type LearnerPriceGuide,
} from '../../../shared/schemas/pricing';
import {
  EDUCATION_LEVEL_LABELS,
  EDUCATION_LEVELS,
  type EducationLevel,
} from '../../../shared/schemas/requests';
import { Button, ButtonLink } from '../../components/ui/Button';
import { Alert, EmptyState } from '../../components/ui/Feedback';
import { Skeleton } from '../../components/ui/Spinner';
import { api } from '../../lib/api-client';

function priceRange(guide: LearnerPriceGuide | undefined): string {
  if (!guide) return '—';
  const thousands = (value: number) => new Intl.NumberFormat('vi-VN').format(value / 1000);
  return guide.minPriceMinor === guide.maxPriceMinor
    ? `${thousands(guide.minPriceMinor)}k`
    : `${thousands(guide.minPriceMinor)}k – ${thousands(guide.maxPriceMinor)}k`;
}

type Row = { key: string; label: string; byLevel: Map<EducationLevel, LearnerPriceGuide> };

function rows(guides: LearnerPriceGuide[], keyOf: (guide: LearnerPriceGuide) => string | null) {
  const map = new Map<string, Row>();
  for (const guide of guides) {
    const key = keyOf(guide);
    if (!key) continue;
    const label =
      guide.dimension === 'tutor_type'
        ? TUTOR_TYPE_LABELS[guide.tutorType!]
        : (guide.subjectName ?? key);
    const row = map.get(key) ?? { key, label, byLevel: new Map() };
    row.byLevel.set(guide.educationLevel, guide);
    map.set(key, row);
  }
  return [...map.values()];
}

export function LearnerPricingPage() {
  const guides = useQuery({
    queryKey: ['learner-price-guides'],
    queryFn: ({ signal }) => api.get<LearnerPriceGuide[]>('/pricing/learner-guides', { signal }),
  });
  const byTutorType = guides.data
    ? rows(
        guides.data.filter((guide) => guide.dimension === 'tutor_type'),
        (guide) => guide.tutorType,
      ).sort(
        (a, b) =>
          TUTOR_TYPES.indexOf(a.key as (typeof TUTOR_TYPES)[number]) -
          TUTOR_TYPES.indexOf(b.key as (typeof TUTOR_TYPES)[number]),
      )
    : [];
  const bySubject = guides.data
    ? rows(
        guides.data.filter((guide) => guide.dimension === 'subject'),
        (guide) => guide.subjectId,
      )
    : [];

  return (
    <section className="flex min-w-0 flex-col gap-8">
      <header className="text-center">
        <h1 className="text-3xl font-bold text-primary md:text-4xl">Bảng giá tham khảo</h1>
        <p className="mt-2 text-muted">
          Học phí tham khảo cho mỗi buổi học (90 phút) theo đối tượng gia sư và theo môn học
        </p>
      </header>

      <div className="mx-auto flex w-full max-w-4xl items-start gap-4 rounded-xl border-2 border-accent bg-warning-surface p-5">
        <BadgeCheck aria-hidden="true" className="mt-0.5 size-6 shrink-0 text-warning" />
        <div className="text-sm">
          <p className="font-semibold text-primary">Người học không mất phí dịch vụ tìm gia sư</p>
          <p className="mt-1 text-muted">
            Mức giá dưới đây chỉ để tham khảo. Học phí thực tế của từng lớp được thỏa thuận theo yêu
            cầu, khu vực và gia sư được gán.
          </p>
        </div>
      </div>

      {guides.isPending ? (
        <>
          <Skeleton className="h-56" />
          <Skeleton className="h-72" />
        </>
      ) : guides.isError ? (
        <Alert
          tone="danger"
          title="Không tải được bảng giá"
          action={
            <Button variant="secondary" onClick={() => void guides.refetch()}>
              Thử lại
            </Button>
          }
        >
          {guides.error.message}
        </Alert>
      ) : guides.data.length === 0 ? (
        <EmptyState
          title="Chưa có bảng giá tham khảo"
          description="Liên hệ trung tâm để được tư vấn mức học phí phù hợp."
        />
      ) : (
        <>
          <PriceTable
            id="tutor-type-prices"
            icon={<GraduationCap aria-hidden="true" className="size-5" />}
            title="Bảng giá tham khảo theo đối tượng gia sư"
            description="Mức học phí phụ thuộc kinh nghiệm và chuyên môn của gia sư."
            firstColumn="Đối tượng gia sư"
            rows={byTutorType}
          />
          <PriceTable
            id="subject-prices"
            icon={<BookOpen aria-hidden="true" className="size-5" />}
            title="Bảng giá tham khảo theo môn học"
            description="Mức học phí tham khảo cho từng môn theo cấp học."
            firstColumn="Môn học"
            rows={bySubject}
          />
        </>
      )}

      <p className="mx-auto flex max-w-4xl items-start gap-2 text-xs text-muted">
        <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
        Đơn vị: nghìn đồng/buổi. “—” là chưa có mức tham khảo. Học online thường thấp hơn học tại
        nhà; lớp luyện thi hoặc học sinh cần kèm sát có thể cao hơn khoảng tham khảo.
      </p>

      <aside className="mx-auto w-full max-w-5xl rounded-xl bg-surface px-6 py-10 text-center">
        <h2 className="text-2xl font-semibold text-primary">Muốn biết học phí cho lớp của bạn?</h2>
        <p className="mt-3 text-muted">
          Gửi yêu cầu để trung tâm tư vấn gia sư và mức học phí phù hợp
        </p>
        <ButtonLink to="/parent/request" variant="accent" className="mt-6">
          Tạo yêu cầu tìm gia sư
        </ButtonLink>
      </aside>
    </section>
  );
}

function PriceTable({
  id,
  icon,
  title,
  description,
  firstColumn,
  rows,
}: {
  id: string;
  icon: ReactNode;
  title: string;
  description: string;
  firstColumn: string;
  rows: Row[];
}) {
  return (
    <section aria-labelledby={id} className="mx-auto w-full max-w-5xl">
      <h2 id={id} className="flex items-center gap-2 text-2xl font-semibold text-primary">
        {icon}
        {title}
      </h2>
      <p className="mt-1 text-sm text-muted">{description}</p>
      {rows.length === 0 ? (
        <p className="mt-4 rounded-xl border border-border p-4 text-sm text-muted">
          Chưa có mức tham khảo cho mục này.
        </p>
      ) : (
        <div className="mt-4 overflow-x-auto rounded-xl border border-border bg-bg shadow-card">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="bg-primary text-on-primary">
              <tr>
                <th scope="col" className="px-4 py-3 font-semibold">
                  {firstColumn}
                </th>
                {EDUCATION_LEVELS.map((level) => (
                  <th key={level} scope="col" className="px-4 py-3 text-center font-semibold">
                    {EDUCATION_LEVEL_LABELS[level]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((row) => (
                <tr key={row.key} className="even:bg-surface">
                  <th scope="row" className="px-4 py-3 font-semibold text-primary">
                    {row.label}
                  </th>
                  {EDUCATION_LEVELS.map((level) => (
                    <td key={level} className="px-4 py-3 text-center whitespace-nowrap">
                      {priceRange(row.byLevel.get(level))}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
