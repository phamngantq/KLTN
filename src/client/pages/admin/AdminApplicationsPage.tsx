import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import type { AdminApplication } from '../../../shared/schemas/admin-applications';
import { APPLICATION_STATUSES, type ApplicationStatus } from '../../../shared/schemas/classes';
import type { Page } from '../../../shared/schemas/discovery';
import { isReadOnlyPreview } from '../../app/preview';
import { Button } from '../../components/ui/Button';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { Alert, Badge, EmptyState, PageHeader } from '../../components/ui/Feedback';
import { SelectField, TextareaField } from '../../components/ui/Field';
import { PageLoading } from '../../components/ui/Spinner';
import { api, fieldErrors, toQuery } from '../../lib/api-client';

const LABELS: Record<ApplicationStatus, string> = {
  submitted: 'Chờ xem xét',
  withdrawn: 'Đã rút',
  rejected: 'Không được chọn',
  selected: 'Đã được gán lớp',
};

function search(status: ApplicationStatus | '', classId: string | null, page: number) {
  const params = new URLSearchParams();
  if (status) params.set('status', status);
  if (classId) params.set('classId', classId);
  if (page > 1) params.set('page', String(page));
  return params;
}

type Action = 'select' | 'reject';

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
    mutationFn: (item: AdminApplication) =>
      api.post<{ id: string; classId: string }>(
        `/admin/classes/${encodeURIComponent(item.classId)}/assign`,
        {
          applicationId: item.id,
          classVersion: item.classVersion,
          applicationVersion: item.version,
          requestVersion: item.requestVersion,
        },
      ),
  });
  const [dialog, setDialog] = useState<{ item: AdminApplication; action: Action } | null>(null);
  const [reason, setReason] = useState('');
  const [notice, setNotice] = useState('');
  const [localError, setLocalError] = useState('');

  function open(item: AdminApplication, action: Action) {
    reject.reset();
    select.reset();
    setReason('');
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
    select.mutate(dialog.item, {
      onSuccess: () => {
        setDialog(null);
        setNotice(
          `Đã gán lớp ${dialog.item.classCode} cho ${dialog.item.tutorDisplayName}. Lớp đã hoạt động.`,
        );
        void queryClient.invalidateQueries({ queryKey: ['admin-applications'] });
        void queryClient.invalidateQueries({ queryKey: ['admin-classes'] });
        void queryClient.invalidateQueries({ queryKey: ['admin-requests'] });
      },
    });
  }

  const pending = reject.isPending || select.isPending;
  const actionError = dialog?.action === 'reject' ? reject.error : select.error;
  const errors = fieldErrors(actionError);

  return (
    <section className="flex min-w-0 flex-col gap-5">
      <PageHeader
        title="Đơn nhận lớp"
        description="Xem đơn ứng tuyển và chọn gia sư cho lớp đang tuyển. Thao tác gán làm lớp hoạt động ngay."
      />
      {isReadOnlyPreview() && (
        <Alert tone="info">
          Bản xem trước chỉ cho phép xem; thao tác duyệt đơn cần môi trường có quyền ghi.
        </Alert>
      )}
      {notice && <Alert tone="success">{notice}</Alert>}
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-full max-w-xs">
          <SelectField
            label="Lọc trạng thái"
            value={status}
            onChange={(event) =>
              setParams(search(event.target.value as ApplicationStatus | '', classId, 1))
            }
          >
            <option value="">Tất cả trạng thái</option>
            {APPLICATION_STATUSES.map((value) => (
              <option key={value} value={value}>
                {LABELS[value]}
              </option>
            ))}
          </SelectField>
        </div>
        {classId && (
          <Button variant="secondary" onClick={() => setParams(search(status, null, 1))}>
            Bỏ lọc lớp
          </Button>
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
            {applications.data.total} đơn · Trang {applications.data.page}
          </p>
          <ul className="grid gap-4">
            {applications.data.items.map((item) => (
              <li key={item.id} className="rounded-lg border border-border bg-bg p-4 shadow-card">
                <article className="flex flex-col gap-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2 className="font-semibold text-primary">
                      {item.classCode} · {item.tutorDisplayName}
                    </h2>
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
                  <p className="text-sm text-muted">
                    Phương án phí: {item.feeOptionTitle} (v{item.feeOptionVersion})
                  </p>
                  {item.rejectionReason && <p className="text-sm">Lý do: {item.rejectionReason}</p>}
                  <div className="flex flex-wrap gap-2">
                    <Link
                      className="text-sm text-primary underline"
                      to={`/admin/classes?status=${encodeURIComponent(item.classStatus)}`}
                    >
                      Xem lớp
                    </Link>
                    {item.status === 'submitted' && item.classStatus === 'open' && (
                      <>
                        <Button disabled={isReadOnlyPreview()} onClick={() => open(item, 'select')}>
                          Gán gia sư
                        </Button>
                        <Button
                          variant="secondary"
                          disabled={isReadOnlyPreview()}
                          onClick={() => open(item, 'reject')}
                        >
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
            ? `Gán ${dialog.item.tutorDisplayName} cho lớp ${dialog.item.classCode} sẽ kích hoạt lớp ngay và cho gia sư được chọn xem liên hệ riêng tư của phụ huynh.`
            : `Từ chối đơn của ${dialog?.item.tutorDisplayName ?? ''} cho lớp ${dialog?.item.classCode ?? ''}.`
        }
        confirmLabel={dialog?.action === 'select' ? 'Gán và kích hoạt lớp' : 'Từ chối đơn'}
        tone={dialog?.action === 'reject' ? 'danger' : 'primary'}
        loading={pending}
        onCancel={() => setDialog(null)}
        onConfirm={confirm}
      >
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
