import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import type { ParentDashboard, TutorDashboard } from '../../../shared/schemas/reports';
import { Button } from '../../components/ui/Button';
import { Alert, PageHeader } from '../../components/ui/Feedback';
import { PageLoading } from '../../components/ui/Spinner';
import { api } from '../../lib/api-client';

function Tile({ label, value, to }: { label: string; value: number; to: string }) {
  return (
    <Link
      to={to}
      className="rounded-lg border border-border bg-bg p-4 shadow-card focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
    >
      <p className="text-sm text-muted">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-primary">{value.toLocaleString('vi-VN')}</p>
    </Link>
  );
}

export function ParentDashboardPage() {
  const report = useQuery({
    queryKey: ['parent-dashboard'],
    queryFn: ({ signal }) => api.get<ParentDashboard>('/parent/dashboard', { signal }),
  });
  return (
    <section className="flex flex-col gap-5">
      <PageHeader
        title="Tổng quan phụ huynh"
        description="Các yêu cầu của bạn được đếm từ trạng thái hiện tại trên hệ thống."
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
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <Tile label="Bản nháp" value={report.data.draftRequests} to="/parent?status=draft" />
          <Tile
            label="Đã gửi"
            value={report.data.submittedRequests}
            to="/parent?status=submitted"
          />
          <Tile
            label="Đang tìm gia sư"
            value={report.data.sourcingRequests}
            to="/parent?status=sourcing"
          />
          <Tile
            label="Đã gán gia sư"
            value={report.data.assignedRequests}
            to="/parent?status=assigned"
          />
          <Tile
            label="Đã hoàn tất"
            value={report.data.fulfilledRequests}
            to="/parent?status=fulfilled"
          />
          <Tile
            label="Đã hủy"
            value={report.data.cancelledRequests}
            to="/parent?status=cancelled"
          />
        </div>
      )}
    </section>
  );
}

export function TutorDashboardPage() {
  const report = useQuery({
    queryKey: ['tutor-dashboard'],
    queryFn: ({ signal }) => api.get<TutorDashboard>('/tutor/dashboard', { signal }),
  });
  return (
    <section className="flex flex-col gap-5">
      <PageHeader
        title="Tổng quan gia sư"
        description="Đơn nhận lớp và lớp được giao từ dữ liệu hiện tại."
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
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <Tile
            label="Đơn đang chờ"
            value={report.data.submittedApplications}
            to="/tutor/class-requests?status=submitted"
          />
          <Tile
            label="Đơn được chọn"
            value={report.data.selectedApplications}
            to="/tutor/class-requests?status=selected"
          />
          <Tile
            label="Lớp đang hoạt động"
            value={report.data.activeAssignments}
            to="/tutor/classes"
          />
        </div>
      )}
    </section>
  );
}
