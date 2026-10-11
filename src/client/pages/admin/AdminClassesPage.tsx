import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { CLASS_STATUSES, type AdminClass, type ClassStatus } from '../../../shared/schemas/classes';
import type { AdminRequestDetail } from '../../../shared/schemas/admin-requests';
import type { Page } from '../../../shared/schemas/discovery';
import { isReadOnlyPreview } from '../../app/preview';
import { Button, ButtonLink } from '../../components/ui/Button';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { Alert, Badge, EmptyState, PageHeader } from '../../components/ui/Feedback';
import { SelectField, TextField } from '../../components/ui/Field';
import { PageLoading } from '../../components/ui/Spinner';
import { api, toQuery } from '../../lib/api-client';
import { formatVnd } from '../../lib/format';
import { AdminClassLifecyclePanel } from './AdminClassLifecyclePanel';

const LABELS: Record<ClassStatus, string> = {
  draft: 'Bản nháp',
  open: 'Đang tuyển gia sư',
  active: 'Đang hoạt động',
  completed: 'Đã hoàn thành',
  cancelled: 'Đã hủy',
};

function search(status: ClassStatus | '', page: number) {
  const params = new URLSearchParams();
  if (status) params.set('status', status);
  if (page > 1) params.set('page', String(page));
  return params;
}

export function AdminClassesPage() {
  const [params, setParams] = useSearchParams();
  const statusParam = params.get('status');
  const status: ClassStatus | '' = CLASS_STATUSES.includes(statusParam as ClassStatus)
    ? (statusParam as ClassStatus)
    : '';
  const rawPage = Number(params.get('page') ?? 1);
  const page = Number.isSafeInteger(rawPage) && rawPage >= 1 && rawPage <= 1000 ? rawPage : 1;
  const queryClient = useQueryClient();
  const classes = useQuery({
    queryKey: ['admin-classes', status, page],
    queryFn: ({ signal }) =>
      api.get<Page<AdminClass>>(`/admin/classes${toQuery({ status: status || undefined, page })}`, {
        signal,
      }),
    placeholderData: keepPreviousData,
  });
  const publish = useMutation({
    mutationFn: (item: AdminClass) =>
      api.post<AdminClass>(`/admin/classes/${encodeURIComponent(item.id)}/publish`, {
        version: item.version,
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-classes'] }),
  });
  const [refreshFrom, setRefreshFrom] = useState<AdminClass | null>(null);
  const [refreshPublicArea, setRefreshPublicArea] = useState('');
  const source = useQuery({
    queryKey: ['admin-class-source', refreshFrom?.sourceRequestId],
    queryFn: ({ signal }) =>
      api.get<AdminRequestDetail>(
        `/admin/requests/${encodeURIComponent(refreshFrom!.sourceRequestId)}`,
        { signal },
      ),
    enabled: Boolean(refreshFrom),
  });
  const refresh = useMutation({
    mutationFn: ({ item, request }: { item: AdminClass; request: AdminRequestDetail }) =>
      api.post<AdminClass>(`/admin/classes/${encodeURIComponent(item.id)}/refresh`, {
        version: item.version,
        requestVersion: request.version,
        publicArea: request.mode === 'offline' ? refreshPublicArea.trim() : null,
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-classes'] }),
  });
  const [selected, setSelected] = useState<AdminClass | null>(null);
  const [lifecycleFrom, setLifecycleFrom] = useState<AdminClass | null>(null);
  const [notice, setNotice] = useState('');

  function confirmPublish() {
    if (!selected) return;
    publish.mutate(selected, {
      onSuccess: (item) => {
        setSelected(null);
        setNotice(`Đã xuất bản lớp ${item.code}.`);
      },
    });
  }

  function confirmRefresh() {
    if (!refreshFrom || !source.data || source.data.status !== 'submitted') return;
    if (source.data.mode === 'offline' && !refreshPublicArea.trim()) return;
    refresh.mutate(
      { item: refreshFrom, request: source.data },
      {
        onSuccess: (item) => {
          setRefreshFrom(null);
          setNotice(`Đã cập nhật bản nháp lớp ${item.code} từ yêu cầu mới nhất.`);
        },
      },
    );
  }

  return (
    <section className="flex min-w-0 flex-col gap-5">
      <PageHeader
        title="Quản lý lớp học"
        description="Tạo lớp từ yêu cầu đã gửi, kiểm tra khu vực công khai rồi xuất bản cho gia sư."
        actions={<ButtonLink to="/admin/requests">Xem yêu cầu tìm gia sư</ButtonLink>}
      />
      {isReadOnlyPreview() && (
        <Alert tone="info">
          Bản xem trước chỉ hiển thị dữ liệu; thao tác xuất bản cần môi trường có quyền ghi.
        </Alert>
      )}
      {notice && <Alert tone="success">{notice}</Alert>}
      <div className="max-w-xs">
        <SelectField
          label="Lọc theo trạng thái"
          value={status}
          onChange={(event) => setParams(search(event.target.value as ClassStatus | '', 1))}
        >
          <option value="">Tất cả trạng thái</option>
          {CLASS_STATUSES.map((value) => (
            <option key={value} value={value}>
              {LABELS[value]}
            </option>
          ))}
        </SelectField>
      </div>
      {classes.isPending ? (
        <PageLoading label="Đang tải lớp học…" />
      ) : classes.isError ? (
        <Alert
          tone="danger"
          title="Không tải được lớp học"
          action={
            <Button variant="secondary" onClick={() => void classes.refetch()}>
              Thử lại
            </Button>
          }
        >
          {classes.error.message}
        </Alert>
      ) : classes.data.items.length === 0 ? (
        <EmptyState
          title="Chưa có lớp phù hợp"
          description="Kiểm duyệt viên có thể tạo lớp từ một yêu cầu đã được phụ huynh gửi."
          action={<ButtonLink to="/admin/requests">Xem yêu cầu</ButtonLink>}
        />
      ) : (
        <>
          <p className="text-sm text-muted" role="status">
            {classes.data.total} lớp · Trang {classes.data.page}
          </p>
          <ul className="grid gap-4">
            {classes.data.items.map((item) => (
              <li key={item.id} className="rounded-lg border border-border bg-bg p-4 shadow-card">
                <article className="flex flex-col gap-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2 className="font-semibold text-primary">
                      {item.code} · {item.subjectName} · {item.grade}
                    </h2>
                    <Badge
                      tone={
                        item.status === 'active' || item.status === 'completed'
                          ? 'success'
                          : item.status === 'open'
                            ? 'info'
                            : 'neutral'
                      }
                    >
                      {LABELS[item.status]}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted">
                    {item.mode === 'online'
                      ? 'Trực tuyến'
                      : `Trực tiếp · ${item.publicArea ?? 'Chưa có khu vực công khai'}`}
                    {item.expectedBudgetMinor !== null &&
                      ` · Ngân sách dự kiến ${formatVnd(item.expectedBudgetMinor)}`}
                  </p>
                  <p className="text-sm text-muted">
                    Nguồn:{' '}
                    <Link
                      className="text-primary underline"
                      to={`/admin/requests?selected=${encodeURIComponent(item.sourceRequestId)}`}
                    >
                      yêu cầu {item.sourceRequestId.slice(0, 8)}
                    </Link>
                  </p>
                  {(item.status === 'open' || item.status === 'active') && (
                    <Link
                      className="text-sm text-primary underline"
                      to={`/admin/applications?classId=${encodeURIComponent(item.id)}`}
                    >
                      Xem đơn ứng tuyển của lớp
                    </Link>
                  )}
                  <Button variant="secondary" onClick={() => setLifecycleFrom(item)}>
                    Vòng đời và lịch sử
                  </Button>
                  {item.status === 'draft' && (
                    <div className="flex flex-wrap gap-2">
                      <Button
                        disabled={isReadOnlyPreview()}
                        onClick={() => {
                          publish.reset();
                          setNotice('');
                          setSelected(item);
                        }}
                      >
                        Xuất bản lớp
                      </Button>
                      <Button
                        variant="secondary"
                        disabled={isReadOnlyPreview()}
                        onClick={() => {
                          refresh.reset();
                          setNotice('');
                          setRefreshPublicArea('');
                          setRefreshFrom(item);
                        }}
                      >
                        Cập nhật từ yêu cầu
                      </Button>
                    </div>
                  )}
                </article>
              </li>
            ))}
          </ul>
          <nav aria-label="Trang lớp học" className="flex flex-wrap items-center gap-3">
            <Button
              variant="secondary"
              disabled={page <= 1}
              onClick={() => setParams(search(status, page - 1))}
            >
              Trang trước
            </Button>
            <span className="text-sm text-muted">
              Trang {page} / {Math.max(1, Math.ceil(classes.data.total / classes.data.pageSize))}
            </span>
            <Button
              variant="secondary"
              disabled={page * classes.data.pageSize >= classes.data.total}
              onClick={() => setParams(search(status, page + 1))}
            >
              Trang sau
            </Button>
          </nav>
        </>
      )}
      {lifecycleFrom && (
        <AdminClassLifecyclePanel item={lifecycleFrom} onClose={() => setLifecycleFrom(null)} />
      )}
      <ConfirmDialog
        open={selected !== null}
        title="Xuất bản lớp học"
        description={
          <>
            Lớp {selected?.code} sẽ hiển thị công khai với khu vực và ngân sách dự kiến. Kiểm tra
            các thông tin này trước khi tiếp tục.
          </>
        }
        confirmLabel="Xuất bản"
        loading={publish.isPending}
        onConfirm={confirmPublish}
        onCancel={() => setSelected(null)}
      >
        {publish.isError && <Alert tone="danger">{publish.error.message}</Alert>}
      </ConfirmDialog>
      <ConfirmDialog
        open={refreshFrom !== null}
        title="Cập nhật bản nháp từ yêu cầu"
        description="Kiểm tra nội dung phụ huynh vừa sửa và chọn lại khu vực công khai trước khi cập nhật lớp."
        confirmLabel="Cập nhật bản nháp"
        loading={refresh.isPending}
        onConfirm={confirmRefresh}
        onCancel={() => setRefreshFrom(null)}
      >
        {source.isPending ? (
          <PageLoading label="Đang tải yêu cầu mới nhất…" />
        ) : source.isError ? (
          <Alert tone="danger">{source.error.message}</Alert>
        ) : (
          <>
            <p className="text-sm">
              Yêu cầu {source.data.code} · {source.data.subjectName} · {source.data.grade} ·{' '}
              {source.data.mode === 'online' ? 'Trực tuyến' : 'Trực tiếp'}
            </p>
            {source.data.status !== 'submitted' && (
              <Alert tone="warning">
                Yêu cầu không còn ở trạng thái đã gửi; chưa thể cập nhật bản nháp.
              </Alert>
            )}
            {source.data.mode === 'offline' && (
              <TextField
                label="Khu vực công khai mới"
                value={refreshPublicArea}
                onChange={(event) => setRefreshPublicArea(event.target.value)}
                maxLength={120}
                required
                hint="Chỉ nhập quận/huyện hoặc khu vực rộng, không nhập địa chỉ chi tiết."
              />
            )}
          </>
        )}
        {refresh.isError && <Alert tone="danger">{refresh.error.message}</Alert>}
      </ConfirmDialog>
    </section>
  );
}
