import { useQuery } from '@tanstack/react-query';
import type { LucideIcon } from 'lucide-react';
import {
  BookOpen,
  CircleCheck,
  CircleX,
  ClipboardList,
  FileText,
  GraduationCap,
  Lightbulb,
  MapPin,
  Search,
  UserRound,
} from 'lucide-react';
import { Link } from 'react-router';
import type { TutorAssignment } from '../../../shared/schemas/admin-assignments';
import type { Page } from '../../../shared/schemas/discovery';
import type { ParentDashboard, TutorDashboard } from '../../../shared/schemas/reports';
import { useSession } from '../../app/auth';
import { Button } from '../../components/ui/Button';
import { Alert } from '../../components/ui/Feedback';
import { PageLoading } from '../../components/ui/Spinner';
import { api } from '../../lib/api-client';

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
  value,
  to,
  icon: Icon,
  tone = 'primary',
}: {
  label: string;
  value: number;
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
          {value.toLocaleString('vi-VN')}
        </span>
        <span className="block text-sm text-muted">{label}</span>
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
            to="/parent?status=draft"
            icon={FileText}
          />
          <MetricTile
            label="Đã gửi"
            value={report.data.submittedRequests}
            to="/parent?status=submitted"
            icon={ClipboardList}
            tone="accent"
          />
          <MetricTile
            label="Đang tìm gia sư"
            value={report.data.sourcingRequests}
            to="/parent?status=sourcing"
            icon={Search}
            tone="warning"
          />
          <MetricTile
            label="Đã gán gia sư"
            value={report.data.assignedRequests}
            to="/parent?status=assigned"
            icon={UserRound}
          />
          <MetricTile
            label="Đã hoàn tất"
            value={report.data.fulfilledRequests}
            to="/parent?status=fulfilled"
            icon={CircleCheck}
            tone="success"
          />
          <MetricTile
            label="Đã hủy"
            value={report.data.cancelledRequests}
            to="/parent?status=cancelled"
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
            title="Hồ sơ phụ huynh"
            description="Kiểm tra và cập nhật thông tin liên hệ của bạn."
            to="/parent/profile"
            icon={UserRound}
          />
        </div>
      </section>
    </section>
  );
}

export function TutorDashboardPage() {
  const { user } = useSession();
  const report = useQuery({
    queryKey: ['tutor-dashboard', 'metrics', user?.id],
    queryFn: ({ signal }) => api.get<TutorDashboard>('/tutor/dashboard', { signal }),
    enabled: user?.role === 'tutor',
  });
  const recentClasses = useQuery({
    queryKey: ['tutor-dashboard', 'recent-assignments', user?.id],
    queryFn: ({ signal }) =>
      api.get<Page<TutorAssignment>>('/tutor/assignments?page=1&pageSize=2', { signal }),
    enabled: user?.role === 'tutor',
  });

  return (
    <section className="space-y-8">
      <WelcomeBanner
        title="Chào mừng gia sư!"
        description="Xem đơn nhận lớp và lớp học đang hoạt động của bạn."
      />
      <div>
        <h2 className="text-2xl font-semibold text-primary">Tổng quan nhận lớp</h2>
        <p className="mt-1 text-sm text-muted">Số liệu được cập nhật từ đơn và lớp của bạn.</p>
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
            label="Đơn đang chờ"
            value={report.data.submittedApplications}
            to="/tutor/class-requests?status=submitted"
            icon={ClipboardList}
            tone="warning"
          />
          <MetricTile
            label="Đơn được chọn"
            value={report.data.selectedApplications}
            to="/tutor/class-requests?status=selected"
            icon={CircleCheck}
            tone="success"
          />
          <MetricTile
            label="Lớp đang hoạt động"
            value={report.data.activeAssignments}
            to="/tutor/classes"
            icon={GraduationCap}
            tone="accent"
          />
        </div>
      )}
      <section aria-labelledby="tutor-actions-title">
        <h2 id="tutor-actions-title" className="mb-4 text-2xl font-semibold text-primary">
          Lối tắt
        </h2>
        <div className="grid gap-4 md:grid-cols-3">
          <ActionCard
            title="Tìm lớp học"
            description="Xem lớp mới và gửi đơn ứng tuyển khi bạn đủ điều kiện."
            to="/tutor/new-classes"
            icon={Search}
          />
          <ActionCard
            title="Hồ sơ của tôi"
            description="Cập nhật thông tin và gửi hồ sơ để kiểm duyệt."
            to="/tutor/profile"
            icon={FileText}
          />
          <ActionCard
            title="Blog gia sư"
            description="Đọc nội dung đã được công bố dành cho gia sư."
            to="/tutor/blog"
            icon={BookOpen}
          />
        </div>
      </section>
      <section
        aria-labelledby="tutor-recent-title"
        className="rounded-xl border border-border bg-bg p-5 shadow-card sm:p-6"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="tutor-recent-title" className="text-2xl font-semibold text-primary">
            Lớp học gần đây
          </h2>
          <Link
            to="/tutor/classes"
            className="inline-flex min-h-11 items-center rounded-md px-3 text-sm font-semibold text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          >
            Xem tất cả lớp của tôi
          </Link>
        </div>
        {recentClasses.isPending ? (
          <div className="mt-4">
            <PageLoading label="Đang tải lớp gần đây…" />
          </div>
        ) : recentClasses.isError ? (
          <div className="mt-4">
            <Alert
              tone="danger"
              title="Không tải được lớp gần đây"
              action={
                <Button variant="secondary" onClick={() => void recentClasses.refetch()}>
                  Thử lại
                </Button>
              }
            >
              {recentClasses.error.message}
            </Alert>
          </div>
        ) : recentClasses.data.items.length === 0 ? (
          <p className="mt-4 text-sm text-muted">
            Chưa có lớp được gán. Lớp sẽ xuất hiện ở đây sau khi kiểm duyệt viên chọn bạn.
          </p>
        ) : (
          <ul className="mt-4 space-y-3">
            {recentClasses.data.items.map((item) => (
              <li
                key={item.id}
                className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-border p-4"
              >
                <div className="min-w-0">
                  <h3 className="font-semibold text-primary">
                    {item.subjectName} - {item.grade}
                  </h3>
                  <p className="mt-1 text-sm text-muted">Mã lớp: {item.classCode}</p>
                  <p className="mt-1 inline-flex flex-wrap items-center gap-1 text-sm text-muted">
                    <MapPin aria-hidden="true" className="size-4 shrink-0 text-primary" />
                    {item.mode === 'online'
                      ? 'Trực tuyến'
                      : `Trực tiếp · ${item.publicArea ?? 'Khu vực chưa công bố'}`}
                  </p>
                </div>
                <Link
                  to="/tutor/classes"
                  className="inline-flex min-h-11 items-center rounded-md border border-primary px-4 text-sm font-medium text-primary hover:bg-info-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                >
                  Xem lớp
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section
        aria-labelledby="tutor-tips-title"
        className="rounded-xl border border-accent bg-bg p-5 shadow-card sm:p-6"
      >
        <h2
          id="tutor-tips-title"
          className="flex items-center gap-2 text-xl font-semibold text-primary"
        >
          <Lightbulb aria-hidden="true" className="size-5 text-primary" />
          Mẹo tăng cơ hội nhận lớp
        </h2>
        <ul className="mt-4 list-inside list-disc space-y-2 text-sm text-fg">
          <li>Cập nhật hồ sơ gia sư để kiểm duyệt viên xem xét.</li>
          <li>Đọc, vượt bài kiểm tra và xác nhận điều khoản trước khi ứng tuyển.</li>
          <li>Xem lớp mới và theo dõi trạng thái đơn nhận lớp của bạn.</li>
        </ul>
        <div className="mt-5 flex flex-wrap gap-3">
          <Link
            to="/tutor/how-to-accept"
            className="inline-flex min-h-11 items-center rounded-md bg-primary px-4 text-sm font-medium text-on-primary hover:bg-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          >
            Xem hướng dẫn nhận lớp
          </Link>
          <Link
            to="/tutor/terms"
            className="inline-flex min-h-11 items-center rounded-md border border-primary px-4 text-sm font-medium text-primary hover:bg-info-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          >
            Điều khoản trách nhiệm
          </Link>
        </div>
      </section>
    </section>
  );
}
