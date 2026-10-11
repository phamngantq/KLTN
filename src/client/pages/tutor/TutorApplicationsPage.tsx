import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { isReadOnlyPreview } from '../../app/preview';
import { Button, ButtonLink } from '../../components/ui/Button';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { Alert, Badge, EmptyState, PageHeader } from '../../components/ui/Feedback';
import { PageLoading } from '../../components/ui/Spinner';
import {
  useTutorApplications,
  useWithdrawApplication,
  type TutorClassApplication,
} from '../../features/classes/api';
import { formatDate } from '../../lib/format';

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
      <PageHeader
        title="Đơn ứng tuyển lớp"
        description="Theo dõi trạng thái đơn được lưu trên hệ thống."
        actions={<ButtonLink to="/tutor/new-classes">Tìm lớp mới</ButtonLink>}
      />
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
          <p className="text-sm text-muted">
            {applications.data.total} đơn · Trang {applications.data.page}
          </p>
          <ul className="grid gap-4">
            {applications.data.items.map((application) => (
              <li
                key={application.id}
                className="rounded-xl border border-border bg-bg p-5 shadow-card"
              >
                <article className="flex flex-col gap-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-xs text-muted">{application.class.code}</p>
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
                  <p className="text-sm text-muted">
                    {application.class.mode === 'online'
                      ? 'Trực tuyến'
                      : application.class.publicArea || 'Trực tiếp'}
                    {' · '}Gửi ngày {formatDate(application.createdAt, 'Asia/Ho_Chi_Minh')}
                  </p>
                  <div className="flex flex-wrap items-center gap-3 border-t border-border pt-3">
                    {application.class.status === 'open' && (
                      <Link
                        to={`/tutor/new-classes/${encodeURIComponent(application.classId)}`}
                        className="inline-flex min-h-11 items-center font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                      >
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
