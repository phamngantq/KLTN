import { useQuery } from '@tanstack/react-query';
import type { LucideIcon } from 'lucide-react';
import { CircleCheck, GraduationCap, Info, School, Users } from 'lucide-react';
import {
  LEARNER_PRICE_GROUP_LABELS,
  LEARNER_PRICE_GROUPS,
  TUTOR_TYPE_LABELS,
  TUTOR_TYPES,
  type LearnerPriceGuide,
  type LearnerPriceItem,
  type TutorType,
} from '../../../shared/schemas/pricing';
import { Button, ButtonLink } from '../../components/ui/Button';
import { Alert, EmptyState } from '../../components/ui/Feedback';
import { Skeleton } from '../../components/ui/Spinner';
import { api } from '../../lib/api-client';

export const LEARNER_PRICE_NOTE =
  'Học phí trên là mức tham khảo, có thể thay đổi tùy theo khu vực và yêu cầu cụ thể và người học tìm kiếm gia sư qua trung tâm không mất phí môi giới';

/** Card copy per tutor type; prices come from D1. */
const TUTOR_CARDS: Record<
  TutorType,
  { icon: LucideIcon; iconClass: string; description: string; points: string[] }
> = {
  university_student: {
    icon: Users,
    iconClass: 'bg-primary text-on-primary',
    description: 'Sinh viên các trường đại học uy tín, nhiệt huyết và năng động',
    points: [
      'Sinh viên năm 2 trở lên',
      'Hồ sơ được kiểm duyệt viên duyệt trước khi nhận lớp',
      'Phù hợp kèm học sinh tiểu học và THCS',
      'Phương pháp giảng dạy trẻ trung, gần gũi',
    ],
  },
  pedagogy_student: {
    icon: GraduationCap,
    iconClass: 'bg-accent text-on-accent',
    description: 'Sinh viên sư phạm được đào tạo nghiệp vụ giảng dạy bài bản',
    points: [
      'Được học phương pháp giảng dạy chính quy',
      'Bám sát chương trình sách giáo khoa',
      'Phù hợp từ tiểu học đến THPT',
      'Chi phí hợp lý so với giáo viên',
    ],
  },
  teacher: {
    icon: School,
    iconClass: 'bg-warning text-white',
    description: 'Giáo viên có kinh nghiệm, chuyên môn cao',
    points: [
      'Đang hoặc từng giảng dạy tại các trường',
      'Phù hợp tất cả các cấp học',
      'Am hiểu chương trình học và đề thi',
      'Phù hợp lớp ôn thi, luyện thi',
    ],
  },
};
const FEATURED: TutorType = 'pedagogy_student';

const vnd = (value: number) => `${new Intl.NumberFormat('vi-VN').format(value)}đ`;
const range = (min: number, max: number) =>
  min === max ? `${vnd(min)}/buổi` : `${vnd(min)} - ${vnd(max)}/buổi`;

export function LearnerPricingPage() {
  const guides = useQuery({
    queryKey: ['learner-price-guides'],
    queryFn: ({ signal }) => api.get<LearnerPriceGuide[]>('/pricing/learner-guides', { signal }),
  });
  const items = useQuery({
    queryKey: ['learner-price-items'],
    queryFn: ({ signal }) => api.get<LearnerPriceItem[]>('/pricing/learner-items', { signal }),
  });

  const cards = TUTOR_TYPES.map((type) => {
    const rows = (guides.data ?? []).filter(
      (guide) => guide.dimension === 'tutor_type' && guide.tutorType === type,
    );
    return {
      type,
      min: rows.length ? Math.min(...rows.map((row) => row.minPriceMinor)) : null,
      max: rows.length ? Math.max(...rows.map((row) => row.maxPriceMinor)) : null,
    };
  }).filter((card) => card.min !== null);
  const groups = LEARNER_PRICE_GROUPS.map((group) => ({
    group,
    rows: (items.data ?? []).filter((item) => item.groupKey === group),
  })).filter(({ rows }) => rows.length > 0);
  const failed = guides.error ?? items.error;

  return (
    <section className="flex min-w-0 flex-col gap-12">
      <section aria-labelledby="tutor-type-prices" className="flex flex-col gap-8">
        <header className="text-center">
          <h1 id="tutor-type-prices" className="text-3xl font-semibold text-primary">
            Giá Theo Đối Tượng Gia Sư
          </h1>
          <p className="mt-2 text-muted">Chọn loại gia sư phù hợp với nhu cầu và ngân sách</p>
        </header>
        {guides.isPending || items.isPending ? (
          <div className="grid gap-6 md:grid-cols-3">
            <Skeleton className="h-96" />
            <Skeleton className="h-96" />
            <Skeleton className="h-96" />
          </div>
        ) : failed ? (
          <Alert
            tone="danger"
            title="Không tải được bảng giá"
            action={
              <Button
                variant="secondary"
                onClick={() => {
                  void guides.refetch();
                  void items.refetch();
                }}
              >
                Thử lại
              </Button>
            }
          >
            {failed.message}
          </Alert>
        ) : cards.length === 0 && groups.length === 0 ? (
          <EmptyState
            title="Chưa có bảng giá tham khảo"
            description="Liên hệ trung tâm để được tư vấn mức học phí phù hợp."
          />
        ) : (
          <ul className="mx-auto grid w-full max-w-6xl items-start gap-6 md:grid-cols-3">
            {cards.map((card) => (
              <TutorCard
                key={card.type}
                type={card.type}
                min={card.min!}
                max={card.max!}
                featured={card.type === FEATURED}
              />
            ))}
          </ul>
        )}
      </section>

      {groups.length > 0 && (
        <section
          aria-labelledby="detail-prices"
          className="-mx-4 flex flex-col gap-8 bg-surface px-4 py-12"
        >
          <header className="text-center">
            <h2 id="detail-prices" className="text-3xl font-semibold text-primary">
              Bảng Giá Chi Tiết Theo Cấp Học &amp; Môn Học
            </h2>
            <p className="mt-2 text-muted">Tham khảo mức giá cụ thể cho từng môn học</p>
          </header>
          <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
            {groups.map(({ group, rows }) => (
              <section
                key={group}
                aria-labelledby={`price-group-${group}`}
                className="overflow-hidden rounded-xl border border-border bg-bg shadow-card"
              >
                <h3
                  id={`price-group-${group}`}
                  className="bg-gradient-to-r from-primary to-primary-gradient-end px-6 py-4 text-lg font-semibold text-on-primary"
                >
                  {LEARNER_PRICE_GROUP_LABELS[group]}
                </h3>
                <ol className="divide-y divide-border">
                  {rows.map((row, index) => (
                    <li
                      key={row.id}
                      className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-4 sm:px-6"
                    >
                      <span
                        aria-hidden="true"
                        className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-accent font-semibold text-on-accent"
                      >
                        {index + 1}
                      </span>
                      <span className="min-w-0 flex-1 font-medium text-fg">{row.label}</span>
                      <span className="font-semibold whitespace-nowrap text-primary">
                        {range(row.minPriceMinor, row.maxPriceMinor)}
                      </span>
                    </li>
                  ))}
                </ol>
              </section>
            ))}
          </div>
        </section>
      )}

      <aside
        aria-label="Lưu ý về học phí"
        className="mx-auto flex w-full max-w-5xl items-start gap-3 rounded-xl border-2 border-accent bg-warning-surface p-5"
      >
        <Info aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-warning" />
        <p className="text-sm text-fg">
          <strong className="text-primary">Lưu ý: </strong>
          {LEARNER_PRICE_NOTE}
        </p>
      </aside>

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

function TutorCard({
  type,
  min,
  max,
  featured,
}: {
  type: TutorType;
  min: number;
  max: number;
  featured: boolean;
}) {
  const card = TUTOR_CARDS[type];
  const Icon = card.icon;
  return (
    <li
      className={`flex flex-col overflow-hidden rounded-xl border-2 bg-bg ${
        featured ? 'border-accent shadow-card md:-mt-6' : 'border-border'
      }`}
    >
      {featured && (
        <p className="bg-accent py-2 text-center text-sm font-semibold tracking-wide text-on-accent uppercase">
          Phổ biến nhất
        </p>
      )}
      <div
        className={`flex flex-col items-center gap-3 px-6 text-center ${featured ? 'pt-10' : 'pt-6'}`}
      >
        <span
          aria-hidden="true"
          className={`flex size-16 items-center justify-center rounded-xl ${card.iconClass}`}
        >
          <Icon className="size-8" />
        </span>
        <h2 className="text-2xl font-semibold text-primary">{TUTOR_TYPE_LABELS[type]}</h2>
        <p className="text-2xl font-bold text-primary">{range(min, max)}</p>
        <p className="text-muted">{card.description}</p>
      </div>
      <ul className="flex flex-col gap-3 px-6 pt-6 pb-8">
        {card.points.map((point) => (
          <li key={point} className="flex items-start gap-2 text-sm">
            <CircleCheck aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-warning" />
            {point}
          </li>
        ))}
      </ul>
    </li>
  );
}
