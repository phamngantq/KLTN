import {
  CalendarDays,
  Clock3,
  Eye,
  FileText,
  GraduationCap,
  MapPin,
  Search,
  Wallet,
} from 'lucide-react';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { isReadOnlyPreview } from '../../app/preview';
import { classScheduleText } from '../../components/domain/ClassCard';
import { Button, ButtonLink } from '../../components/ui/Button';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { Alert, Badge, EmptyState } from '../../components/ui/Feedback';
import { PageLoading } from '../../components/ui/Spinner';
import {
  useTutorApplications,
  useWithdrawApplication,
  type TutorClassApplication,
} from '../../features/classes/api';
import { formatDate, formatVnd } from '../../lib/format';

const STATUS_LABELS: Record<string, string> = {
  pending: 'Chờ xét duyệt',
  submitted: 'Chờ xét duyệt',
  approved: 'Đã duyệt',
  selected: 'Được chọn',
  assigned: 'Đã được gán',
  rejected: 'Đã từ chối',
  withdrawn: 'Đã rút',
};

function applicationStatus(status: string): string {
  return STATUS_LABELS[status] ?? status;
}

function pageFromUrl(params: URLSearchParams): number {
  const value = Number(params.get('page') ?? '1');
  return Number.isSafeInteger(value) && value > 0 && value <= 1000 ? value : 1;
}

export function TutorApplicationsPage() {
  const [params, setParams] = useSearchParams();
  const page = pageFromUrl(params);
  const applications = useTutorApplications(page);
  const withdraw = useWithdrawApplication();
  const [selected, setSelected] = useState<TutorClassApplication | null>(null);
  const preview = isReadOnlyPreview();

  function goToPage(nextPage: number) {
    setParams(
      nextPage === 1 ? new URLSearchParams() : new URLSearchParams({ page: String(nextPage) }),
    );
    document.getElementById('main')?.focus();
  }

  function confirmWithdraw() {
    if (!selected || withdraw.isPending || preview) return;
    withdraw.mutate(
      { id: selected.id, version: selected.version },
      {
        onSuccess: () => setSelected(null),
        onError: () => void applications.refetch(),
      },
    );
  }

  return (
    <section className="flex min-w-0 flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-primary">Yêu cầu nhận lớp</h1>
          <p className="mt-2 text-muted">Theo dõi trạng thái đơn ứng tuyển đã gửi trên hệ thống.</p>
        </div>
        <ButtonLink to="/tutor/new-classes" variant="accent">
          <Search aria-hidden="true" size={18} />
          Tìm lớp mới
        </ButtonLink>
      </header>
      <nav
        aria-label="Khu vực nhận lớp"
        className="rounded-xl border border-primary/20 bg-bg p-2 shadow-card"
      >
        <ul className="grid gap-2 sm:grid-cols-3">
          <li>
            <Link
              to="/tutor/class-requests"
              aria-current="page"
              className="flex min-h-11 items-center justify-center gap-2 rounded-md bg-accent px-3 text-sm font-semibold text-on-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
            >
              <FileText aria-hidden="true" size={18} />
              Đơn của tôi
            </Link>
          </li>
          <li>
            <Link
              to="/tutor/classes"
              className="flex min-h-11 items-center justify-center gap-2 rounded-md px-3 text-sm font-medium text-primary hover:bg-info-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
            >
              <GraduationCap aria-hidden="true" size={18} />
              Lớp đã nhận
            </Link>
          </li>
          <li>
            <Link
              to="/tutor/class-history"
              className="flex min-h-11 items-center justify-center gap-2 rounded-md px-3 text-sm font-medium text-primary hover:bg-info-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
            >
              <CalendarDays aria-hidden="true" size={18} />
              Lịch sử lớp
            </Link>
          </li>
        </ul>
      </nav>
      {applications.isPending ? (
        <PageLoading label="Đang tải đơn ứng tuyển…" />
      ) : applications.isError ? (
        <Alert
          tone="danger"
          title="Không tải được đơn ứng tuyển"
          action={
            <Button variant="secondary" onClick={() => void applications.refetch()}>
              Thử lại
            </Button>
          }
        >
          {applications.error.message}
        </Alert>
      ) : applications.data.items.length === 0 ? (
        <EmptyState
          title="Chưa có đơn ứng tuyển"
          description="Xem các lớp đã công bố và chọn phương án phí để gửi đơn."
          action={<ButtonLink to="/tutor/new-classes">Xem lớp mới</ButtonLink>}
        />
      ) : (
        <>
          <p className="text-sm text-muted" role="status">
            Tìm thấy{' '}
            <strong className="text-primary">
              {applications.data.total.toLocaleString('vi-VN')}
            </strong>{' '}
            đơn · Trang {applications.data.page}
          </p>
          <ul className="grid gap-4 lg:grid-cols-2">
            {applications.data.items.map((application) => (
              <li key={application.id} className="min-w-0">
                <article className="flex h-full flex-col gap-4 rounded-xl border border-primary/20 border-l-4 border-l-accent bg-bg p-5 shadow-card transition-shadow hover:shadow-lg">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold text-muted">
                        Lớp {application.class.code}
                      </p>
                      <h2 className="text-lg font-semibold text-primary">
                        {application.class.subjectName} · {application.class.grade}
                      </h2>
                    </div>
                    <Badge
                      tone={
                        application.status === 'selected'
                          ? 'success'
                          : application.status === 'rejected'
                            ? 'danger'
                            : 'info'
                      }
                    >
                      {applicationStatus(application.status)}
                    </Badge>
                  </div>
                  <dl className="grid gap-3 text-sm sm:grid-cols-2">
                    <div className="flex items-start gap-2">
                      <MapPin
                        aria-hidden="true"
                        size={18}
                        className="mt-0.5 shrink-0 text-warning"
                      />
                      <div>
                        <dt className="sr-only">Khu vực</dt>
                        <dd>
                          {application.class.mode === 'online'
                            ? 'Trực tuyến'
                            : application.class.publicArea || 'Trực tiếp'}
                        </dd>
                      </div>
                    </div>
                    <div className="flex items-start gap-2">
                      <CalendarDays
                        aria-hidden="true"
                        size={18}
                        className="mt-0.5 shrink-0 text-warning"
                      />
                      <div>
                        <dt className="sr-only">Ngày gửi</dt>
                        <dd>Gửi ngày {formatDate(application.createdAt, 'Asia/Ho_Chi_Minh')}</dd>
                      </div>
                    </div>
                    <div className="flex items-start gap-2 sm:col-span-2">
                      <Clock3
                        aria-hidden="true"
                        size={18}
                        className="mt-0.5 shrink-0 text-warning"
                      />
                      <div>
                        <dt className="sr-only">Lịch mong muốn</dt>
                        <dd>{classScheduleText(application.class)}</dd>
                      </div>
                    </div>
                    {application.class.expectedBudgetMinor !== null && (
                      <div className="flex items-start gap-2 sm:col-span-2">
                        <Wallet
                          aria-hidden="true"
                          size={18}
                          className="mt-0.5 shrink-0 text-warning"
                        />
                        <div>
                          <dt className="text-xs text-muted">Học phí dự kiến</dt>
                          <dd className="font-semibold text-primary">
                            {formatVnd(application.class.expectedBudgetMinor)}
                          </dd>
                        </div>
                      </div>
                    )}
                  </dl>
                  <div className="mt-auto flex flex-wrap items-center gap-3 border-t border-border pt-4">
                    {application.class.status === 'open' && (
                      <Link
                        to={`/tutor/new-classes/${encodeURIComponent(application.classId)}`}
                        className="inline-flex min-h-11 items-center gap-2 rounded-md border border-primary px-3 font-medium text-primary transition-colors hover:bg-primary hover:text-on-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                      >
                        <Eye aria-hidden="true" size={16} />
                        Xem lớp
                      </Link>
                    )}
                    {application.status === 'submitted' && !preview && (
                      <Button
                        variant="secondary"
                        onClick={() => {
                          withdraw.reset();
                          setSelected(application);
                        }}
                      >
                        Rút ứng tuyển
                      </Button>
                    )}
                  </div>
                </article>
              </li>
            ))}
          </ul>
          {applications.data.total > applications.data.pageSize && (
            <nav aria-label="Trang đơn ứng tuyển" className="flex flex-wrap items-center gap-3">
              <Button variant="secondary" disabled={page <= 1} onClick={() => goToPage(page - 1)}>
                Trang trước
              </Button>
              <span className="text-sm text-muted">
                Trang {page} / {Math.ceil(applications.data.total / applications.data.pageSize)}
              </span>
              <Button
                variant="secondary"
                disabled={page * applications.data.pageSize >= applications.data.total}
                onClick={() => goToPage(page + 1)}
              >
                Trang sau
              </Button>
            </nav>
          )}
        </>
      )}
      <ConfirmDialog
        open={selected !== null}
        title="Rút đơn ứng tuyển?"
        description="Đơn đang chờ sẽ được chuyển sang trạng thái đã rút sau khi máy chủ xác nhận."
        confirmLabel="Rút đơn"
        tone="danger"
        loading={withdraw.isPending}
        onConfirm={confirmWithdraw}
        onCancel={() => setSelected(null)}
      >
        {withdraw.isError && <Alert tone="danger">{withdraw.error.message}</Alert>}
      </ConfirmDialog>
    </section>
  );
}
