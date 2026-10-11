import { useQuery } from '@tanstack/react-query';
import type { LucideIcon } from 'lucide-react';
import {
  BookOpen,
  CircleCheck,
  CircleX,
  ClipboardList,
  FileText,
  GraduationCap,
  Search,
  UserRound,
} from 'lucide-react';
import { Link } from 'react-router';
import type { ParentDashboard, TutorDashboard } from '../../../shared/schemas/reports';
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
  const report = useQuery({
    queryKey: ['tutor-dashboard'],
    queryFn: ({ signal }) => api.get<TutorDashboard>('/tutor/dashboard', { signal }),
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
    </section>
  );
}
