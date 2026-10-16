import { useQuery } from '@tanstack/react-query';
import type { LucideIcon } from 'lucide-react';
import {
  ArrowRight,
  BookOpen,
  CalendarDays,
  CircleCheck,
  CircleX,
  ClipboardList,
  FileText,
  GraduationCap,
  Lightbulb,
  MapPin,
  Search,
  Target,
  UserRound,
  Wallet,
} from 'lucide-react';
import { Link } from 'react-router';
import type { ClassRecommendation, PublicClass } from '../../../shared/schemas/classes';
import type { Page } from '../../../shared/schemas/discovery';
import type { ParentDashboard, TutorDashboard } from '../../../shared/schemas/reports';
import { useSession } from '../../app/auth';
import { Button } from '../../components/ui/Button';
import { Alert } from '../../components/ui/Feedback';
import { PageLoading } from '../../components/ui/Spinner';
import { classScheduleText } from '../../components/domain/ClassCard';
import { api, toQuery } from '../../lib/api-client';
import { formatVnd } from '../../lib/format';

type TileTone = 'primary' | 'accent' | 'success' | 'warning';

const TONE_CLASS: Record<TileTone, string> = {
  primary: 'bg-info-surface text-primary',
  accent: 'bg-accent text-on-accent',
  success: 'bg-success-surface text-success',
  warning: 'bg-warning-surface text-warning',
};

function WelcomeBanner({ title, description }: { title: string; description: string }) {
  return (
    <header className="rounded-2xl bg-gradient-to-r from-primary to-primary-gradient-end px-6 py-8 text-on-primary md:px-8">
      <h1 className="text-3xl font-bold leading-tight">{title}</h1>
      <p className="mt-2 max-w-2xl text-on-primary/90">{description}</p>
    </header>
  );
}

function MetricTile({
  label,
  hint,
  value,
  to,
  icon: Icon,
  tone = 'primary',
}: {
  label: string;
  hint?: string;
  value: number | null;
  to: string;
  icon: LucideIcon;
  tone?: TileTone;
}) {
  return (
    <Link
      to={to}
      className="flex min-h-28 items-center gap-4 rounded-xl border border-border bg-bg p-5 shadow-card transition-all hover:border-accent hover:shadow-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
    >
      <span
        aria-hidden="true"
        className={`flex size-12 shrink-0 items-center justify-center rounded-lg ${TONE_CLASS[tone]}`}
      >
        <Icon size={24} strokeWidth={2} />
      </span>
      <span className="min-w-0">
        <span className="block text-2xl font-bold text-primary">
          {value === null ? '…' : value.toLocaleString('vi-VN')}
        </span>
        <span className="block text-sm font-medium text-fg">{label}</span>
        {hint && <span className="mt-0.5 block text-xs text-muted">{hint}</span>}
      </span>
    </Link>
  );
}

function ActionCard({
  title,
  description,
  to,
  icon: Icon,
}: {
  title: string;
  description: string;
  to: string;
  icon: LucideIcon;
}) {
  return (
    <Link
      to={to}
      className="block h-full rounded-xl border border-border bg-bg p-6 shadow-card transition-all hover:border-accent hover:shadow-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
    >
      <span
        aria-hidden="true"
        className="flex size-12 items-center justify-center rounded-lg bg-accent text-on-accent"
      >
        <Icon size={24} strokeWidth={2} />
      </span>
      <h3 className="mt-4 text-lg font-semibold text-primary">{title}</h3>
      <p className="mt-2 text-sm text-muted">{description}</p>
    </Link>
  );
}

export function ParentDashboardPage() {
  const report = useQuery({
    queryKey: ['parent-dashboard'],
    queryFn: ({ signal }) => api.get<ParentDashboard>('/parent/dashboard', { signal }),
  });

  return (
    <section className="space-y-8">
      <WelcomeBanner
        title="Chào mừng đến với Gia Sư Đỗ Hằng!"
        description="Theo dõi yêu cầu tìm gia sư và tiến độ chọn lớp của bạn tại đây."
      />
      <div>
        <h2 className="text-2xl font-semibold text-primary">Tổng quan yêu cầu</h2>
        <p className="mt-1 text-sm text-muted">Các số liệu được cập nhật từ yêu cầu của bạn.</p>
      </div>
      {report.isPending ? (
        <PageLoading label="Đang tải tổng quan…" />
      ) : report.isError ? (
        <Alert
          tone="danger"
          action={
            <Button variant="secondary" onClick={() => void report.refetch()}>
              Thử lại
            </Button>
          }
        >
          {report.error.message}
        </Alert>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <MetricTile
            label="Bản nháp"
            value={report.data.draftRequests}
            to="/parent"
            icon={FileText}
          />
          <MetricTile
            label="Đã gửi"
            value={report.data.submittedRequests}
            to="/parent"
            icon={ClipboardList}
            tone="accent"
          />
          <MetricTile
            label="Đang tìm gia sư"
            value={report.data.sourcingRequests}
            to="/parent"
            icon={Search}
            tone="warning"
          />
          <MetricTile
            label="Đã gán gia sư"
            value={report.data.assignedRequests}
            to="/parent?group=found"
            icon={UserRound}
          />
          <MetricTile
            label="Đã hoàn tất"
            value={report.data.fulfilledRequests}
            to="/parent?group=confirmed"
            icon={CircleCheck}
            tone="success"
          />
          <MetricTile
            label="Đã hủy"
            value={report.data.cancelledRequests}
            to="/parent"
            icon={CircleX}
            tone="warning"
          />
        </div>
      )}
      <section aria-labelledby="parent-actions-title">
        <h2 id="parent-actions-title" className="mb-4 text-2xl font-semibold text-primary">
          Bắt đầu tại đây
        </h2>
        <div className="grid gap-4 md:grid-cols-3">
          <ActionCard
            title="Đăng ký thuê gia sư"
            description="Gửi nhu cầu học tập để kiểm duyệt viên tìm gia sư phù hợp."
            to="/parent/request"
            icon={ClipboardList}
          />
          <ActionCard
            title="Lớp học"
            description="Xem các lớp học đã được công bố trên hệ thống."
            to="/parent/lop-hoc"
            icon={GraduationCap}
          />
          <ActionCard
            title="Hồ sơ người học"
            description="Kiểm tra và cập nhật thông tin liên hệ của bạn."
            to="/parent/profile"
            icon={UserRound}
          />
        </div>
      </section>
    </section>
  );
}

const TUTOR_TIPS = [
  'Hoàn thiện hồ sơ, bổ sung minh chứng năng lực.',
  'Cập nhật môn học và khối lớp có thể dạy.',
  'Chọn lớp phù hợp với lịch rảnh.',
  'Phản hồi nhanh khi có lớp phù hợp.',
  'Duy trì chất lượng và uy tín giảng dạy.',
];

const NEW_CLASS_LIMIT = 4;

/** Newest open classes, the tutor's best matches first, each listed once. */
function useNewClassesForTutor(enabled: boolean) {
  const recommendations = useQuery({
    queryKey: ['tutor-dashboard', 'recommendations'],
    queryFn: ({ signal }) =>
      api.get<Page<ClassRecommendation>>(
        `/tutor/classes/recommendations${toQuery({ page: 1, pageSize: NEW_CLASS_LIMIT })}`,
        { signal },
      ),
    enabled,
  });
  const latest = useQuery({
    queryKey: ['tutor-dashboard', 'latest-classes'],
    queryFn: ({ signal }) =>
      api.get<Page<PublicClass>>(`/classes${toQuery({ page: 1, pageSize: NEW_CLASS_LIMIT * 2 })}`, {
        signal,
      }),
    enabled,
  });
  const matched = recommendations.data?.items ?? [];
  const seen = new Set(matched.map((item) => item.class.id));
  const items: { item: PublicClass; score: number | null }[] = [
    ...matched.map((item) => ({ item: item.class, score: item.match.score })),
    ...(latest.data?.items ?? [])
      .filter((item) => !seen.has(item.id))
      .map((item) => ({ item, score: null })),
  ].slice(0, NEW_CLASS_LIMIT);
  return {
    items,
    matchedTotal: recommendations.data?.total ?? null,
    isPending: recommendations.isPending || latest.isPending,
    error: recommendations.error ?? latest.error,
    refetch: () => {
      void recommendations.refetch();
      void latest.refetch();
    },
  };
}

export function TutorDashboardPage() {
  const { user } = useSession();
  const isTutor = user?.role === 'tutor';
  const report = useQuery({
    queryKey: ['tutor-dashboard', 'metrics', user?.id],
    queryFn: ({ signal }) => api.get<TutorDashboard>('/tutor/dashboard', { signal }),
    enabled: isTutor,
  });
  const classes = useNewClassesForTutor(isTutor);

  return (
    <section className="space-y-8">
      <WelcomeBanner
        title="Chào mừng gia sư!"
        description="Theo dõi lớp đã đăng ký, lớp phù hợp và tìm lớp dạy mới tại đây."
      />
      {report.isPending ? (
        <PageLoading label="Đang tải tổng quan…" />
      ) : report.isError ? (
        <Alert
          tone="danger"
          action={
            <Button variant="secondary" onClick={() => void report.refetch()}>
              Thử lại
            </Button>
          }
        >
          {report.error.message}
        </Alert>
      ) : (
        <div className="grid gap-4 md:grid-cols-3">
          <MetricTile
            label="Lớp đã đăng ký nhận"
            hint="Tổng số lớp bạn đã gửi yêu cầu nhận"
            value={report.data.registeredClasses}
            to="/tutor/class-requests"
            icon={ClipboardList}
            tone="warning"
          />
          <MetricTile
            label="Lớp phù hợp"
            hint="Lớp khớp với hồ sơ và chuyên môn của bạn"
            value={classes.matchedTotal}
            to="/tutor/matched-classes"
            icon={Target}
            tone="primary"
          />
          <MetricTile
            label="Lớp đã hoàn tất nhận"
            hint="Lớp trung tâm đã xác nhận bạn nhận dạy"
            value={report.data.acceptedClasses}
            to="/tutor/classes"
            icon={CircleCheck}
            tone="success"
          />
        </div>
      )}
      <section aria-labelledby="tutor-actions-title">
        <h2 id="tutor-actions-title" className="mb-4 text-2xl font-semibold text-primary">
          Lối tắt chức năng
        </h2>
        <div className="grid gap-4 md:grid-cols-3">
          <ActionCard
            title="Tìm lớp học"
            description="Xem danh sách lớp mới và gửi yêu cầu nhận lớp phù hợp."
            to="/tutor/new-classes"
            icon={Search}
          />
          <ActionCard
            title="Hồ sơ của tôi"
            description="Cập nhật thông tin, môn học, khu vực và thời gian có thể dạy."
            to="/tutor/profile"
            icon={UserRound}
          />
          <ActionCard
            title="Cẩm nang gia sư"
            description="Kinh nghiệm giảng dạy và làm việc với phụ huynh."
            to="/tutor/cam-nang"
            icon={BookOpen}
          />
        </div>
      </section>
      <section
        aria-labelledby="tutor-new-classes-title"
        className="rounded-xl border border-border bg-bg p-5 shadow-card sm:p-6"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 id="tutor-new-classes-title" className="text-2xl font-semibold text-primary">
              Lớp học mới
            </h2>
            <p className="mt-1 text-sm text-muted">Lớp mới đăng, ưu tiên lớp phù hợp với bạn.</p>
          </div>
          <Link
            to="/tutor/new-classes"
            className="inline-flex min-h-11 items-center gap-1 rounded-md px-3 text-sm font-semibold text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          >
            Xem tất cả lớp học
            <ArrowRight aria-hidden="true" className="size-4" />
          </Link>
        </div>
        {classes.isPending ? (
          <div className="mt-4">
            <PageLoading label="Đang tải lớp học mới…" />
          </div>
        ) : classes.error ? (
          <div className="mt-4">
            <Alert
              tone="danger"
              title="Không tải được lớp học mới"
              action={
                <Button variant="secondary" onClick={classes.refetch}>
                  Thử lại
                </Button>
              }
            >
              {classes.error.message}
            </Alert>
          </div>
        ) : classes.items.length === 0 ? (
          <p className="mt-4 text-sm text-muted">
            Chưa có lớp mới. Lớp sẽ xuất hiện ở đây khi trung tâm đăng lớp tìm gia sư.
          </p>
        ) : (
          <ul className="mt-4 grid gap-3 lg:grid-cols-2">
            {classes.items.map(({ item, score }) => (
              <li
                key={item.id}
                className="flex min-w-0 flex-col gap-3 rounded-lg border border-border p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <h3 className="font-semibold text-primary">
                    {item.subjectName} - {item.grade}
                  </h3>
                  {score !== null && (
                    <span className="rounded-full bg-success-surface px-2.5 py-0.5 text-xs font-semibold text-success">
                      Phù hợp {score}%
                    </span>
                  )}
                </div>
                <dl className="grid gap-1.5 text-sm text-muted">
                  <div className="flex items-start gap-2">
                    <dt className="sr-only">Khu vực</dt>
                    <MapPin aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />
                    <dd>
                      {item.mode === 'online'
                        ? 'Trực tuyến'
                        : `Trực tiếp · ${item.publicArea ?? 'Khu vực chưa công bố'}`}
                    </dd>
                  </div>
                  <div className="flex items-start gap-2">
                    <dt className="sr-only">Lịch học</dt>
                    <CalendarDays
                      aria-hidden="true"
                      className="mt-0.5 size-4 shrink-0 text-primary"
                    />
                    <dd>{classScheduleText(item)}</dd>
                  </div>
                  <div className="flex items-start gap-2">
                    <dt className="sr-only">Mức thù lao</dt>
                    <Wallet aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />
                    <dd>
                      {item.expectedBudgetMinor === null ? (
                        'Thù lao thỏa thuận'
                      ) : (
                        <strong className="text-primary">
                          {formatVnd(item.expectedBudgetMinor)}/buổi
                        </strong>
                      )}
                    </dd>
                  </div>
                </dl>
                <Link
                  to={`/tutor/new-classes/${encodeURIComponent(item.id)}`}
                  aria-label={`Xem chi tiết lớp ${item.code}`}
                  className="inline-flex min-h-11 items-center self-start rounded-md border border-primary px-4 text-sm font-medium text-primary hover:bg-info-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                >
                  Xem chi tiết
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section
        aria-labelledby="tutor-tips-title"
        className="rounded-xl border border-accent bg-warning-surface p-5 shadow-card sm:p-6"
      >
        <h2
          id="tutor-tips-title"
          className="flex items-center gap-2 text-xl font-semibold text-primary"
        >
          <Lightbulb aria-hidden="true" className="size-6 text-warning" />
          Mẹo tăng cơ hội nhận lớp
        </h2>
        <ul className="mt-4 grid gap-2 text-sm text-fg sm:grid-cols-2">
          {TUTOR_TIPS.map((tip) => (
            <li key={tip} className="flex items-start gap-2">
              <CircleCheck aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-success" />
              {tip}
            </li>
          ))}
        </ul>
      </section>
    </section>
  );
}
