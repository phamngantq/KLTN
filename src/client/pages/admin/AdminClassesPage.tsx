import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BookOpen, CheckCircle2, MapPin, Search, Wallet } from 'lucide-react';
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
  const [searchText, setSearchText] = useState('');
  const normalizedSearch = searchText.trim().toLocaleLowerCase('vi');
  const pageItems = classes.data?.items ?? [];
  const visibleClasses = normalizedSearch
    ? pageItems.filter((item) =>
        [item.code, item.subjectName, item.grade, item.publicArea ?? '']
          .join(' ')
          .toLocaleLowerCase('vi')
          .includes(normalizedSearch),
      )
    : pageItems;
  const processingCount = pageItems.filter((item) =>
    ['draft', 'open', 'active'].includes(item.status),
  ).length;
  const completedCount = pageItems.filter((item) => item.status === 'completed').length;

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
    <section className="flex min-w-0 flex-col gap-8">
      <PageHeader
        title="Quản lý lớp học"
        description="Tạo lớp từ yêu cầu đã gửi, kiểm tra thông tin công khai và theo dõi vòng đời lớp học."
        actions={<ButtonLink to="/admin/requests">Xem yêu cầu tìm gia sư</ButtonLink>}
      />
      {isReadOnlyPreview() && (
        <Alert tone="info">
          Bản xem trước chỉ hiển thị dữ liệu; thao tác xuất bản cần môi trường có quyền ghi.
        </Alert>
      )}
      {notice && <Alert tone="success">{notice}</Alert>}
      {classes.isSuccess && !classes.isPlaceholderData && (
        <div className="grid gap-4 md:grid-cols-3" aria-label="Số liệu lớp học theo bộ lọc">
          {[
            { label: 'Tổng lớp theo bộ lọc', value: classes.data.total, icon: BookOpen },
            { label: 'Đang xử lý trong trang', value: processingCount, icon: BookOpen },
            { label: 'Hoàn thành trong trang', value: completedCount, icon: CheckCircle2 },
          ].map(({ label, value, icon: Icon }) => (
            <div
              key={label}
              className="flex items-center justify-between rounded-xl border border-primary/20 bg-surface p-5 shadow-card"
            >
              <div>
                <p className="text-sm text-muted">{label}</p>
                <p className="mt-2 text-3xl font-bold text-primary">
                  {value.toLocaleString('vi-VN')}
                </p>
              </div>
              <Icon aria-hidden="true" className="size-10 text-primary/30" />
            </div>
          ))}
        </div>
      )}
      <div className="grid gap-4 rounded-xl border border-border bg-bg p-5 shadow-card md:grid-cols-[minmax(0,1fr)_16rem] md:items-end">
        <div>
          <TextField
            label="Tìm trong trang hiện tại"
            placeholder="Mã lớp, môn học, khối lớp, khu vực"
            value={searchText}
            maxLength={120}
            onChange={(event) => setSearchText(event.target.value)}
            hint="Tìm trong danh sách của trang đang xem."
          />
        </div>
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
      ) : pageItems.length === 0 ? (
        <EmptyState
          title="Chưa có lớp phù hợp"
          description="Kiểm duyệt viên có thể tạo lớp từ một yêu cầu đã được người học gửi."
          action={<ButtonLink to="/admin/requests">Xem yêu cầu</ButtonLink>}
        />
      ) : (
        <>
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <h2 className="text-xl font-semibold text-primary">Danh sách lớp học</h2>
              <p className="mt-1 text-sm text-muted" role="status">
                {classes.data.total} lớp theo bộ lọc · Trang {classes.data.page}
                {normalizedSearch && ` · ${visibleClasses.length} lớp khớp trong trang`}
              </p>
            </div>
            <Search aria-hidden="true" className="size-6 text-primary/40" />
          </div>
          {visibleClasses.length === 0 ? (
            <EmptyState
              title="Không có lớp khớp trong trang hiện tại"
              description="Thử từ khóa khác hoặc chuyển trang để tìm tiếp."
              action={
                <Button variant="secondary" onClick={() => setSearchText('')}>
                  Xóa tìm kiếm
                </Button>
              }
            />
          ) : (
            <ul className="grid gap-4 md:grid-cols-2">
              {visibleClasses.map((item) => (
                <li
                  key={item.id}
                  className="rounded-xl border border-primary/20 bg-bg p-5 shadow-card"
                >
                  <article className="flex h-full flex-col gap-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-xs font-semibold tracking-wide text-muted">
                          {item.code}
                        </p>
                        <h3 className="mt-1 text-xl font-semibold text-primary">
                          {item.subjectName} · {item.grade}
                        </h3>
                      </div>
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
                    <div className="grid gap-2 text-sm text-muted sm:grid-cols-2">
                      <p className="flex items-start gap-2">
                        <MapPin aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
                        <span>
                          {item.mode === 'online'
                            ? 'Trực tuyến'
                            : `Trực tiếp · ${item.publicArea ?? 'Chưa có khu vực công khai'}`}
                        </span>
                      </p>
                      <p className="flex items-start gap-2">
                        <Wallet aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
                        <span>
                          {item.expectedBudgetMinor === null
                            ? 'Ngân sách: trao đổi sau'
                            : `Ngân sách dự kiến ${formatVnd(item.expectedBudgetMinor)}`}
                        </span>
                      </p>
                    </div>
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
                    <div className="mt-auto">
                      <Button variant="secondary" onClick={() => setLifecycleFrom(item)}>
                        Vòng đời và lịch sử
                      </Button>
                    </div>
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
          )}
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
        description="Kiểm tra nội dung người học vừa sửa và chọn lại khu vực công khai trước khi cập nhật lớp."
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
