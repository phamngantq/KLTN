import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarDays, CircleCheck, CircleX, Eye, GraduationCap, Wallet } from 'lucide-react';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import type { AdminApplication } from '../../../shared/schemas/admin-applications';
import { APPLICATION_STATUSES, type ApplicationStatus } from '../../../shared/schemas/classes';
import type { Page } from '../../../shared/schemas/discovery';
import { isReadOnlyPreview } from '../../app/preview';
import { ApplicationMatchSummary } from '../../components/domain/MatchExplanation';
import { Button } from '../../components/ui/Button';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { Alert, Badge, EmptyState } from '../../components/ui/Feedback';
import { TextareaField, TextField } from '../../components/ui/Field';
import { PageLoading } from '../../components/ui/Spinner';
import { api, fieldErrors, toQuery } from '../../lib/api-client';
import { formatDate, formatVnd } from '../../lib/format';

const LABELS: Record<ApplicationStatus, string> = {
  submitted: 'Chờ xem xét',
  withdrawn: 'Đã rút',
  rejected: 'Không được chọn',
  selected: 'Đã được gán lớp',
};

const CLASS_LABELS = {
  draft: 'Bản nháp',
  open: 'Đang tuyển gia sư',
  active: 'Đang hoạt động',
  completed: 'Đã hoàn thành',
  cancelled: 'Đã hủy',
} as const;

function search(status: ApplicationStatus | '', classId: string | null, page: number) {
  const params = new URLSearchParams();
  if (status) params.set('status', status);
  if (classId) params.set('classId', classId);
  if (page > 1) params.set('page', String(page));
  return params;
}

type Action = 'select' | 'reject';

function ModeratorMatchSnapshot({ item }: { item: AdminApplication }) {
  return (
    <div className="space-y-2 text-sm">
      {item.matchSnapshot ? (
        <>
          <ApplicationMatchSummary snapshot={item.matchSnapshot} />
          <p className="text-muted">
            Điểm tính khi nộp đơn theo lớp phiên bản {item.matchSnapshot.classVersion}. Gia sư xác
            nhận điều chỉnh cho riêng lớp này; người học chưa xác nhận các điều chỉnh đó.
          </p>
        </>
      ) : (
        <p className="rounded-md bg-info-surface p-3 text-muted">
          Đơn cũ chưa lưu điểm phù hợp; cần xem xét hồ sơ thủ công.
        </p>
      )}
      <p className="text-muted">Điểm chỉ hỗ trợ kiểm duyệt, không tự quyết định gán lớp.</p>
    </div>
  );
}

export function AdminApplicationsPage() {
  const [params, setParams] = useSearchParams();
  const statusParam = params.get('status');
  const status: ApplicationStatus | '' = APPLICATION_STATUSES.includes(
    statusParam as ApplicationStatus,
  )
    ? (statusParam as ApplicationStatus)
    : '';
  const classId = params.get('classId');
  const rawPage = Number(params.get('page') ?? 1);
  const page = Number.isSafeInteger(rawPage) && rawPage >= 1 && rawPage <= 1000 ? rawPage : 1;
  const queryClient = useQueryClient();
  const applications = useQuery({
    queryKey: ['admin-applications', status, classId, page],
    queryFn: ({ signal }) =>
      api.get<Page<AdminApplication>>(
        `/admin/applications${toQuery({ status: status || undefined, classId, page })}`,
        { signal },
      ),
    placeholderData: keepPreviousData,
  });
  const reject = useMutation({
    mutationFn: ({ item, reason }: { item: AdminApplication; reason: string }) =>
      api.post<AdminApplication>(`/admin/applications/${encodeURIComponent(item.id)}/reject`, {
        version: item.version,
        reason: reason.trim(),
      }),
  });
  const select = useMutation({
    mutationFn: ({
      item,
      agreedTuitionPerSessionMinor,
    }: {
      item: AdminApplication;
      agreedTuitionPerSessionMinor: number;
    }) =>
      api.post<{ id: string; classId: string }>(
        `/admin/classes/${encodeURIComponent(item.classId)}/assign`,
        {
          applicationId: item.id,
          classVersion: item.classVersion,
          applicationVersion: item.version,
          requestVersion: item.requestVersion,
          agreedTuitionPerSessionMinor,
          partiesAgreed: true,
        },
      ),
  });
  const [dialog, setDialog] = useState<{ item: AdminApplication; action: Action } | null>(null);
  const [reason, setReason] = useState('');
  const [tuition, setTuition] = useState('');
  const [partiesAgreed, setPartiesAgreed] = useState(false);
  const [notice, setNotice] = useState('');
  const [localError, setLocalError] = useState('');

  function open(item: AdminApplication, action: Action) {
    reject.reset();
    select.reset();
    setReason('');
    setTuition('');
    setPartiesAgreed(false);
    setLocalError('');
    setNotice('');
    setDialog({ item, action });
  }

  function confirm() {
    if (!dialog) return;
    if (dialog.action === 'reject') {
      if (!reason.trim()) {
        setLocalError('Cần nêu lý do từ chối.');
        return;
      }
      reject.mutate(
        { item: dialog.item, reason },
        {
          onSuccess: () => {
            setDialog(null);
            setNotice(`Đã từ chối đơn ứng tuyển của ${dialog.item.tutorDisplayName}.`);
            void queryClient.invalidateQueries({ queryKey: ['admin-applications'] });
          },
        },
      );
      return;
    }
    const normalizedTuition = tuition.trim();
    const amount = Number(normalizedTuition);
    if (
      !/^\d+$/.test(normalizedTuition) ||
      !Number.isSafeInteger(amount) ||
      amount < 1 ||
      amount > 100_000_000
    ) {
      setLocalError('Nhập học phí đã chốt từ 1 đến 100.000.000 VNĐ mỗi buổi.');
      return;
    }
    if (!partiesAgreed) {
      setLocalError('Cần xác nhận hai bên đã thống nhất mức học phí này.');
      return;
    }
    select.mutate(
      { item: dialog.item, agreedTuitionPerSessionMinor: amount },
      {
        onSuccess: () => {
          setDialog(null);
          setNotice(
            `Đã gán lớp ${dialog.item.classCode} cho ${dialog.item.tutorDisplayName} với học phí đã chốt ${formatVnd(amount)}/buổi. Lớp đã hoạt động.`,
          );
          void queryClient.invalidateQueries({ queryKey: ['admin-applications'] });
          void queryClient.invalidateQueries({ queryKey: ['admin-classes'] });
          void queryClient.invalidateQueries({ queryKey: ['admin-requests'] });
        },
      },
    );
  }

  const pending = reject.isPending || select.isPending;
  const actionError = dialog?.action === 'reject' ? reject.error : select.error;
  const errors = fieldErrors(actionError);

  return (
    <section className="flex min-w-0 flex-col gap-6">
      <header>
        <h1 className="text-3xl font-bold text-primary">Yêu cầu nhận lớp</h1>
        <p className="mt-2 text-muted">
          Xem đơn ứng tuyển và chọn gia sư cho lớp đang tuyển. Thao tác gán làm lớp hoạt động ngay.
        </p>
      </header>
      {isReadOnlyPreview() && (
        <Alert tone="info">
          Bản xem trước chỉ cho phép xem; thao tác duyệt đơn cần môi trường có quyền ghi.
        </Alert>
      )}
      {notice && <Alert tone="success">{notice}</Alert>}
      <div className="rounded-xl border border-primary/20 bg-bg p-4 shadow-card">
        <nav aria-label="Trạng thái đơn nhận lớp" className="overflow-x-auto">
          <ul className="flex min-w-max gap-2">
            {(
              [
                { value: '', label: 'Tất cả' },
                ...APPLICATION_STATUSES.map((value) => ({ value, label: LABELS[value] })),
              ] as const
            ).map((item) => (
              <li key={item.value || 'all'}>
                <Link
                  to={`?${search(item.value as ApplicationStatus | '', classId, 1)}`}
                  aria-current={status === item.value ? 'page' : undefined}
                  className={`inline-flex min-h-11 items-center rounded-md px-4 text-sm font-medium whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus ${
                    status === item.value
                      ? 'bg-accent text-on-accent'
                      : 'text-primary hover:bg-info-surface'
                  }`}
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        {classId && (
          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border pt-3">
            <p className="text-sm text-muted">Đang lọc đơn theo một lớp học</p>
            <Button variant="secondary" onClick={() => setParams(search(status, null, 1))}>
              Bỏ lọc lớp
            </Button>
          </div>
        )}
      </div>
      {applications.isPending ? (
        <PageLoading label="Đang tải đơn nhận lớp…" />
      ) : applications.isError ? (
        <Alert
          tone="danger"
          title="Không tải được đơn nhận lớp"
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
          title="Chưa có đơn ứng tuyển phù hợp"
          description="Đơn chỉ xuất hiện sau khi lớp và phương án phí đã được công bố, gia sư đủ điều kiện gửi ứng tuyển."
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
            {applications.data.items.map((item) => (
              <li key={item.id} className="min-w-0">
                <article className="flex h-full flex-col gap-4 rounded-xl border border-primary/20 border-l-4 border-l-accent bg-bg p-5 shadow-card transition-shadow hover:shadow-lg">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-muted">Lớp {item.classCode}</p>
                      <h2 className="mt-1 break-words text-lg font-semibold text-primary">
                        {item.classCode} · {item.tutorDisplayName}
                      </h2>
                    </div>
                    <Badge
                      tone={
                        item.status === 'selected'
                          ? 'success'
                          : item.status === 'submitted'
                            ? 'info'
                            : 'neutral'
                      }
                    >
                      {LABELS[item.status]}
                    </Badge>
                  </div>
                  <dl className="grid gap-3 text-sm sm:grid-cols-2">
                    <div className="flex items-start gap-2">
                      <GraduationCap
                        aria-hidden="true"
                        size={18}
                        className="mt-0.5 shrink-0 text-warning"
                      />
                      <div>
                        <dt className="text-xs text-muted">Trạng thái lớp</dt>
                        <dd>{CLASS_LABELS[item.classStatus]}</dd>
                      </div>
                    </div>
                    <div className="flex items-start gap-2">
                      <CalendarDays
                        aria-hidden="true"
                        size={18}
                        className="mt-0.5 shrink-0 text-warning"
                      />
                      <div>
                        <dt className="text-xs text-muted">Ngày ứng tuyển</dt>
                        <dd>{formatDate(item.createdAt, 'Asia/Ho_Chi_Minh')}</dd>
                      </div>
                    </div>
                    <div className="flex items-start gap-2 sm:col-span-2">
                      <Wallet
                        aria-hidden="true"
                        size={18}
                        className="mt-0.5 shrink-0 text-warning"
                      />
                      <div>
                        <dt className="text-xs text-muted">Phương án phí đã chọn</dt>
                        <dd className="font-medium text-primary">
                          {item.feeOptionTitle} (v{item.feeOptionVersion})
                        </dd>
                      </div>
                    </div>
                  </dl>
                  <ModeratorMatchSnapshot item={item} />
                  {item.rejectionReason && (
                    <p className="rounded-md bg-danger-surface p-3 text-sm">
                      <strong>Lý do:</strong> {item.rejectionReason}
                    </p>
                  )}
                  <div className="mt-auto flex flex-wrap gap-2 border-t border-border pt-4">
                    <Link
                      className="inline-flex min-h-11 items-center gap-2 rounded-md border border-border-strong px-3 text-sm font-medium text-primary transition-colors hover:bg-info-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                      to={`/admin/classes?status=${encodeURIComponent(item.classStatus)}`}
                    >
                      <Eye aria-hidden="true" size={16} />
                      Xem lớp
                    </Link>
                    {item.status === 'submitted' && item.classStatus === 'open' && (
                      <>
                        <Button disabled={isReadOnlyPreview()} onClick={() => open(item, 'select')}>
                          <CircleCheck aria-hidden="true" size={16} />
                          Gán gia sư
                        </Button>
                        <Button
                          variant="danger"
                          disabled={isReadOnlyPreview()}
                          onClick={() => open(item, 'reject')}
                        >
                          <CircleX aria-hidden="true" size={16} />
                          Từ chối
                        </Button>
                      </>
                    )}
                  </div>
                </article>
              </li>
            ))}
          </ul>
          <nav aria-label="Trang đơn nhận lớp" className="flex flex-wrap items-center gap-3">
            <Button
              variant="secondary"
              disabled={page <= 1}
              onClick={() => setParams(search(status, classId, page - 1))}
            >
              Trang trước
            </Button>
            <span className="text-sm text-muted">
              Trang {page} /{' '}
              {Math.max(1, Math.ceil(applications.data.total / applications.data.pageSize))}
            </span>
            <Button
              variant="secondary"
              disabled={page * applications.data.pageSize >= applications.data.total}
              onClick={() => setParams(search(status, classId, page + 1))}
            >
              Trang sau
            </Button>
          </nav>
        </>
      )}
      <ConfirmDialog
        open={dialog !== null}
        title={dialog?.action === 'select' ? 'Gán gia sư cho lớp' : 'Từ chối đơn nhận lớp'}
        description={
          dialog?.action === 'select'
            ? `Gán ${dialog.item.tutorDisplayName} cho lớp ${dialog.item.classCode} sẽ kích hoạt lớp ngay và cho gia sư được chọn xem liên hệ riêng tư của người học.`
            : `Từ chối đơn của ${dialog?.item.tutorDisplayName ?? ''} cho lớp ${dialog?.item.classCode ?? ''}.`
        }
        confirmLabel={dialog?.action === 'select' ? 'Gán và kích hoạt lớp' : 'Từ chối đơn'}
        tone={dialog?.action === 'reject' ? 'danger' : 'primary'}
        loading={pending}
        onCancel={() => setDialog(null)}
        onConfirm={confirm}
      >
        {dialog?.action === 'select' && (
          <>
            <ModeratorMatchSnapshot item={dialog.item} />
            <TextField
              label="Học phí đã chốt (VNĐ/buổi)"
              type="number"
              inputMode="numeric"
              min={1}
              max={100_000_000}
              step={1}
              value={tuition}
              onChange={(event) => {
                setTuition(event.target.value);
                setLocalError('');
              }}
              required
              hint="Chỉ ghi mức người học và gia sư đã thống nhất. Mức này tách khỏi phí nhận lớp."
              error={errors.agreedTuitionPerSessionMinor}
            />
            <label className="flex items-start gap-3 text-sm">
              <input
                type="checkbox"
                checked={partiesAgreed}
                onChange={(event) => {
                  setPartiesAgreed(event.target.checked);
                  setLocalError('');
                }}
                className="mt-1 size-4 accent-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
              />
              Tôi xác nhận người học và gia sư đã thống nhất mức học phí này.
            </label>
            {localError && <Alert tone="danger">{localError}</Alert>}
          </>
        )}
        {dialog?.action === 'reject' && (
          <TextareaField
            label="Lý do từ chối"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            maxLength={500}
            required
            error={errors.reason || localError}
          />
        )}
        {actionError && <Alert tone="danger">{actionError.message}</Alert>}
      </ConfirmDialog>
    </section>
  );
}
