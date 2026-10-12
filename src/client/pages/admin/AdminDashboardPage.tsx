import { useQuery } from '@tanstack/react-query';
import type { LucideIcon } from 'lucide-react';
import {
  AlertTriangle,
  ArrowRight,
  BookOpen,
  ClipboardList,
  GraduationCap,
  Search,
  Wallet,
} from 'lucide-react';
import { Link } from 'react-router';
import type { AdminApplication } from '../../../shared/schemas/admin-applications';
import { DEFAULT_TIMEZONE } from '../../../shared/schemas/availability';
import type { Page } from '../../../shared/schemas/discovery';
import type { AdminReportOverview } from '../../../shared/schemas/reports';
import type { AdminTutorOfferJoin } from '../../../shared/schemas/tutor-offer-joins';
import type { TutorOffer } from '../../../shared/schemas/tutor-offers';
import { addDays, todayIn } from '../../../shared/time';
import { Button, ButtonLink } from '../../components/ui/Button';
import { Alert, PageHeader } from '../../components/ui/Feedback';
import { PageLoading } from '../../components/ui/Spinner';
import { api, toQuery } from '../../lib/api-client';

function MetricCard({
  title,
  value,
  description,
  to,
  icon: Icon,
  iconClass,
}: {
  title: string;
  value: number | string;
  description: string;
  to: string;
  icon: LucideIcon;
  iconClass: string;
}) {
  return (
    <Link
      to={to}
      className="group flex min-h-40 items-start justify-between gap-3 rounded-xl border border-border border-l-4 border-l-accent bg-bg p-5 shadow-card transition-shadow hover:shadow-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
    >
      <span className="min-w-0">
        <span className="block text-sm text-muted">{title}</span>
        <span className="mt-2 block text-2xl font-bold text-primary md:text-3xl">
          {typeof value === 'number' ? value.toLocaleString('vi-VN') : value}
        </span>
        <span className="mt-2 block text-sm text-muted">{description}</span>
      </span>
      <span
        aria-hidden="true"
        className={`flex size-12 shrink-0 items-center justify-center rounded-lg ${iconClass}`}
      >
        <Icon size={24} />
      </span>
    </Link>
  );
}

function DataBar({
  label,
  value,
  maximum,
  color,
  percent,
}: {
  label: string;
  value: number;
  maximum: number;
  color: string;
  percent?: number | null;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="font-medium text-fg">{label}</span>
        <span className="shrink-0 text-muted">
          {value.toLocaleString('vi-VN')}
          {percent != null && ` (${percent.toLocaleString('vi-VN')}%)`}
        </span>
      </div>
      <div className="h-9 overflow-hidden rounded-lg bg-surface" aria-hidden="true">
        <div
          className={`h-full rounded-lg ${color}`}
          style={{ width: `${Math.min(100, (value / Math.max(1, maximum)) * 100)}%` }}
        />
      </div>
    </div>
  );
}

function DashboardData({
  overview,
  pendingApplications,
  pendingTutorOffers,
  submittedOfferJoins,
}: {
  overview: AdminReportOverview;
  pendingApplications: number;
  pendingTutorOffers: number;
  submittedOfferJoins: number;
}) {
  const conversion = overview.conversion;
  const funnel = [
    { label: 'Yêu cầu', value: conversion.submittedRequests, percent: 100, color: 'bg-primary' },
    {
      label: 'Tạo lớp',
      value: conversion.publishedClasses,
      percent: conversion.publishRatePercent,
      color: 'bg-primary-hover',
    },
    {
      label: 'Có gia sư',
      value: conversion.assignedClasses,
      percent: conversion.assignRatePercent,
      color: 'bg-success',
    },
    {
      label: 'Hoàn tất',
      value: conversion.completedClasses,
      percent: conversion.completeRatePercent,
      color: 'bg-accent',
    },
  ];
  const statuses = [
    { label: 'Đang tuyển gia sư', value: overview.openClasses, color: 'bg-warning' },
    { label: 'Đang hoạt động', value: overview.activeClasses, color: 'bg-success' },
    { label: 'Hoàn tất', value: overview.completedClasses, color: 'bg-primary' },
  ];
  const statusTotal = statuses.reduce((total, item) => total + item.value, 0);
  const hasAlerts = overview.openWithoutApplications > 0 || pendingApplications > 0;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          title="Yêu cầu tìm gia sư"
          value={conversion.submittedRequests}
          description="Đã gửi trong kỳ"
          to="/admin/requests/find-tutor"
          icon={Search}
          iconClass="bg-info-surface text-primary"
        />
        <MetricCard
          title="Yêu cầu nhận lớp"
          value={pendingApplications}
          description="Đơn đang chờ xem xét · toàn thời gian"
          to="/admin/requests/accept-class"
          icon={ClipboardList}
          iconClass="bg-success-surface text-success"
        />
        <MetricCard
          title="Lớp mới"
          value={conversion.publishedClasses}
          description="Từ yêu cầu đã gửi trong kỳ"
          to="/admin/classes"
          icon={GraduationCap}
          iconClass="bg-info-surface text-primary"
        />
        <MetricCard
          title="Doanh thu tháng này"
          value="Chưa có dữ liệu"
          description="Chưa tích hợp nguồn thanh toán đã xác minh"
          to="/admin/reports/revenue"
          icon={Wallet}
          iconClass="bg-accent text-on-accent"
        />
      </div>

      <section aria-labelledby="dashboard-tutor-offer-queues-title" className="space-y-4">
        <h2 id="dashboard-tutor-offer-queues-title" className="text-xl font-semibold text-primary">
          Hàng chờ lớp tìm học viên
        </h2>
        <div className="grid gap-4 md:grid-cols-2">
          <MetricCard
            title="Lớp chờ duyệt hợp đồng"
            value={pendingTutorOffers}
            description="Gia sư đã gửi · toàn thời gian"
            to="/admin/tutor-offers?status=pending"
            icon={BookOpen}
            iconClass="bg-info-surface text-primary"
          />
          <MetricCard
            title="Yêu cầu tham gia lớp chờ duyệt"
            value={submittedOfferJoins}
            description="Người học đã gửi · toàn thời gian"
            to="/admin/tutor-offer-joins?status=submitted"
            icon={ClipboardList}
            iconClass="bg-warning-surface text-warning"
          />
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section
          aria-labelledby="dashboard-funnel-title"
          className="rounded-xl border border-border bg-bg p-5 shadow-card"
        >
          <h2 id="dashboard-funnel-title" className="text-xl font-semibold text-primary">
            Biểu đồ chuyển đổi (Funnel)
          </h2>
          <p className="mt-1 text-sm text-muted">
            Theo dõi những yêu cầu được gửi trong kỳ và các bước tiếp theo của cùng nhóm yêu cầu.
          </p>
          {conversion.submittedRequests === 0 ? (
            <p className="mt-6 rounded-lg bg-surface p-4 text-sm text-muted">
              Chưa có yêu cầu được gửi trong kỳ.
            </p>
          ) : (
            <div className="mt-6 space-y-4">
              {funnel.map((item) => (
                <DataBar key={item.label} {...item} maximum={conversion.submittedRequests} />
              ))}
              <p className="border-t border-border pt-4 text-sm text-muted">
                Tỷ lệ từ yêu cầu đến hoàn tất:{' '}
                <strong className="text-primary">
                  {conversion.completeRatePercent == null
                    ? '—'
                    : `${conversion.completeRatePercent.toLocaleString('vi-VN')}%`}
                </strong>
              </p>
            </div>
          )}
        </section>

        <section
          aria-labelledby="dashboard-status-title"
          className="rounded-xl border border-border bg-bg p-5 shadow-card"
        >
          <h2 id="dashboard-status-title" className="text-xl font-semibold text-primary">
            Trạng thái lớp học
          </h2>
          <p className="mt-1 text-sm text-muted">
            Trạng thái hiện tại của các lớp được công bố trong kỳ.
          </p>
          {statusTotal === 0 ? (
            <p className="mt-6 rounded-lg bg-surface p-4 text-sm text-muted">
              Chưa có lớp được công bố trong kỳ.
            </p>
          ) : (
            <div className="mt-6 space-y-4">
              {statuses.map((item) => (
                <DataBar key={item.label} {...item} maximum={statusTotal} />
              ))}
            </div>
          )}
        </section>
      </div>

      <section
        aria-labelledby="dashboard-alerts-title"
        className="rounded-xl border border-border border-l-4 border-l-warning bg-bg p-5 shadow-card"
      >
        <h2
          id="dashboard-alerts-title"
          className="flex items-center gap-2 text-xl font-semibold text-primary"
        >
          <AlertTriangle aria-hidden="true" className="size-6 text-warning" />
          Cảnh báo vận hành
        </h2>
        {hasAlerts ? (
          <div className="mt-5 space-y-3">
            {overview.openWithoutApplications > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border-l-4 border-l-warning bg-warning-surface p-4">
                <div>
                  <h3 className="font-semibold text-primary">Lớp chưa có gia sư ứng tuyển</h3>
                  <p className="mt-1 text-sm text-fg">
                    {overview.openWithoutApplications.toLocaleString('vi-VN')} lớp đang tuyển được
                    công bố trong kỳ chưa có đơn ứng tuyển.
                  </p>
                </div>
                <ButtonLink variant="secondary" to="/admin/reports/no-tutor">
                  Xử lý <ArrowRight aria-hidden="true" size={16} />
                </ButtonLink>
              </div>
            )}
            {pendingApplications > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border-l-4 border-l-primary bg-info-surface p-4">
                <div>
                  <h3 className="font-semibold text-primary">Đơn nhận lớp chờ xem xét</h3>
                  <p className="mt-1 text-sm text-fg">
                    {pendingApplications.toLocaleString('vi-VN')} đơn đang chờ kiểm duyệt viên xử
                    lý.
                  </p>
                </div>
                <ButtonLink variant="secondary" to="/admin/requests/accept-class">
                  Xử lý <ArrowRight aria-hidden="true" size={16} />
                </ButtonLink>
              </div>
            )}
          </div>
        ) : (
          <p className="mt-4 text-sm text-muted">Chưa có cảnh báo từ các chỉ số đang theo dõi.</p>
        )}
      </section>
    </div>
  );
}

export function AdminDashboardPage() {
  const to = todayIn(DEFAULT_TIMEZONE);
  const range = { from: addDays(to, -29), to, timeZone: DEFAULT_TIMEZONE } as const;
  const overview = useQuery({
    queryKey: ['admin-report-overview', range.from, range.to],
    queryFn: ({ signal }) =>
      api.get<AdminReportOverview>(`/admin/reports/overview${toQuery(range)}`, { signal }),
  });
  const applications = useQuery({
    queryKey: ['admin-dashboard-applications'],
    queryFn: ({ signal }) =>
      api.get<Page<AdminApplication>>('/admin/applications?status=submitted&pageSize=1', {
        signal,
      }),
  });
  const tutorOffers = useQuery({
    queryKey: ['admin-dashboard-tutor-offers'],
    queryFn: ({ signal }) =>
      api.get<Page<TutorOffer>>('/admin/tutor-offers?status=pending&page=1&pageSize=1', { signal }),
  });
  const offerJoins = useQuery({
    queryKey: ['admin-dashboard-tutor-offer-joins'],
    queryFn: ({ signal }) =>
      api.get<Page<AdminTutorOfferJoin>>(
        '/admin/tutor-offer-joins?status=submitted&page=1&pageSize=1',
        { signal },
      ),
  });

  return (
    <section className="flex min-w-0 flex-col gap-6">
      <PageHeader
        title="Dashboard"
        description="Tổng quan KPI và vận hành hệ thống"
        actions={<ButtonLink to="/admin/reports">Xem báo cáo chi tiết</ButtonLink>}
      />
      <p className="text-sm text-muted">
        Kỳ báo cáo: {range.from} đến {range.to} · Múi giờ {range.timeZone}
      </p>
      {overview.isPending ||
      applications.isPending ||
      tutorOffers.isPending ||
      offerJoins.isPending ? (
        <PageLoading label="Đang tải dashboard…" />
      ) : overview.isError || applications.isError || tutorOffers.isError || offerJoins.isError ? (
        <Alert
          tone="danger"
          title="Không tải được dashboard"
          action={
            <Button
              variant="secondary"
              onClick={() => {
                void overview.refetch();
                void applications.refetch();
                void tutorOffers.refetch();
                void offerJoins.refetch();
              }}
            >
              Thử lại
            </Button>
          }
        >
          {overview.error?.message ??
            applications.error?.message ??
            tutorOffers.error?.message ??
            offerJoins.error?.message}
        </Alert>
      ) : (
        <DashboardData
          overview={overview.data}
          pendingApplications={applications.data.total}
          pendingTutorOffers={tutorOffers.data.total}
          submittedOfferJoins={offerJoins.data.total}
        />
      )}
    </section>
  );
}
