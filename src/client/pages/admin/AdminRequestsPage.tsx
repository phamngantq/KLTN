import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarDays, Clock3, MapPin, Wallet } from 'lucide-react';
import { useState } from 'react';
import { useSearchParams } from 'react-router';
import {
  ADMIN_REQUEST_STATUSES,
  type AdminRequestDetail,
  type AdminRequestSummary,
} from '../../../shared/schemas/admin-requests';
import type { AdminClass, CreateClassInput } from '../../../shared/schemas/classes';
import type { Page } from '../../../shared/schemas/discovery';
import { EDUCATION_LEVEL_LABELS, type RequestStatus } from '../../../shared/schemas/requests';
import { isReadOnlyPreview } from '../../app/preview';
import { Button, ButtonLink } from '../../components/ui/Button';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { Alert, Badge, EmptyState, PageHeader } from '../../components/ui/Feedback';
import { SelectField, TextField } from '../../components/ui/Field';
import { PageLoading } from '../../components/ui/Spinner';
import {
  REQUEST_STATUS_LABELS,
  requestDate,
  weekdayLabel,
} from '../../features/parent-requests/format';
import { api, fieldErrors, toQuery } from '../../lib/api-client';
import { formatVnd } from '../../lib/format';

const LIST_KEY = ['admin-requests'] as const;
const statusTone: Record<RequestStatus, 'neutral' | 'info' | 'success' | 'warning'> = {
  draft: 'neutral',
  submitted: 'info',
  sourcing: 'warning',
  assigned: 'success',
  fulfilled: 'success',
  cancelled: 'neutral',
};

function pageNumber(raw: string | null): number {
  const value = Number(raw ?? 1);
  return Number.isSafeInteger(value) && value >= 1 && value <= 1000 ? value : 1;
}

export function AdminRequestsPage() {
  const [params, setParams] = useSearchParams();
  const status = ADMIN_REQUEST_STATUSES.find((item) => item === params.get('status')) ?? '';
  const page = pageNumber(params.get('page'));
  const selectedId = params.get('selected');
  const [createFrom, setCreateFrom] = useState<AdminRequestDetail | null>(null);
  const [publicArea, setPublicArea] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [searchText, setSearchText] = useState('');
  const queryClient = useQueryClient();
  const list = useQuery({
    queryKey: [...LIST_KEY, status, page],
    queryFn: ({ signal }) =>
      api.get<Page<AdminRequestSummary>>(
        `/admin/requests${toQuery({ status: status || undefined, page })}`,
        { signal },
      ),
    placeholderData: keepPreviousData,
  });
  const detail = useQuery({
    queryKey: ['admin-request', selectedId],
    queryFn: ({ signal }) =>
      api.get<AdminRequestDetail>(`/admin/requests/${encodeURIComponent(selectedId!)}`, {
        signal,
      }),
    enabled: Boolean(selectedId),
    retry: false,
  });
  const create = useMutation({
    mutationFn: (input: CreateClassInput) => api.post<AdminClass>('/admin/classes', input),
    onSuccess: (created) => {
      setCreateFrom(null);
      setNotice(`Đã tạo bản nháp lớp ${created.code} từ yêu cầu.`);
      void queryClient.invalidateQueries({ queryKey: LIST_KEY });
      void queryClient.invalidateQueries({ queryKey: ['admin-request', selectedId] });
      void queryClient.invalidateQueries({ queryKey: ['admin-classes'] });
    },
  });

  function setFilter(value: string) {
    const next = new URLSearchParams();
    if (value) next.set('status', value);
    setParams(next);
  }

  function setPage(value: number) {
    const next = new URLSearchParams();
    if (status) next.set('status', status);
    if (value > 1) next.set('page', String(value));
    setParams(next);
  }

  function selectRequest(id: string | null) {
    const next = new URLSearchParams(params);
    if (id) next.set('selected', id);
    else next.delete('selected');
    setParams(next);
  }

  function openCreate(request: AdminRequestDetail) {
    create.reset();
    setPublicArea('');
    setCreateFrom(request);
  }

  function submitCreate() {
    if (!createFrom || create.isPending || isReadOnlyPreview()) return;
    const area = publicArea.trim();
    if (createFrom.mode === 'offline' && !area) return;
    create.mutate({
      sourceRequestId: createFrom.id,
      requestVersion: createFrom.version,
      publicArea: createFrom.mode === 'offline' ? area : null,
    });
  }

  const data = list.data;
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const errors = fieldErrors(create.error);
  const normalizedSearch = searchText.trim().toLocaleLowerCase('vi');
  const visibleRequests = normalizedSearch
    ? (data?.items ?? []).filter((request) =>
        [request.code, request.subjectName, request.grade, request.area ?? '']
          .join(' ')
          .toLocaleLowerCase('vi')
          .includes(normalizedSearch),
      )
    : (data?.items ?? []);

  return (
    <section className="flex min-w-0 flex-col gap-8">
      <PageHeader
        title="Yêu cầu tìm gia sư"
        description="Quản lý các yêu cầu phụ huynh đã gửi và tạo lớp từ dữ liệu được đồng ý chia sẻ."
      />
      {notice && (
        <Alert tone="success" action={<ButtonLink to="/admin/classes">Quản lý lớp</ButtonLink>}>
          {notice}
        </Alert>
      )}
      <div className="grid gap-4 rounded-xl border border-border bg-bg p-5 shadow-card md:grid-cols-[minmax(0,1fr)_16rem] md:items-end">
        <TextField
          label="Tìm trong trang hiện tại"
          placeholder="Mã yêu cầu, môn học, khối lớp, khu vực"
          value={searchText}
          maxLength={120}
          onChange={(event) => setSearchText(event.target.value)}
          hint="Danh sách chưa hỗ trợ tìm trên toàn bộ các trang."
        />
        <SelectField
          label="Lọc theo trạng thái"
          value={status}
          onChange={(event) => setFilter(event.target.value)}
        >
          <option value="">Tất cả yêu cầu đã gửi</option>
          {ADMIN_REQUEST_STATUSES.map((item) => (
            <option key={item} value={item}>
              {REQUEST_STATUS_LABELS[item]}
            </option>
          ))}
        </SelectField>
      </div>
      <nav aria-label="Nhóm trạng thái yêu cầu" className="flex flex-wrap gap-2">
        {[
          { value: '', label: 'Tất cả' },
          { value: 'submitted', label: 'Chờ xử lý' },
          { value: 'assigned', label: 'Đã gán' },
          { value: 'fulfilled', label: 'Hoàn thành' },
        ].map((tab) => (
          <Button
            key={tab.value}
            size="sm"
            variant={status === tab.value ? 'accent' : 'secondary'}
            onClick={() => setFilter(tab.value)}
            aria-current={status === tab.value ? 'page' : undefined}
          >
            {tab.label}
          </Button>
        ))}
      </nav>

      <div aria-live="polite" aria-busy={list.isFetching}>
        {list.isPending ? (
          <PageLoading label="Đang tải yêu cầu…" />
        ) : list.isError ? (
          <Alert
            tone="danger"
            title="Không tải được yêu cầu"
            action={
              <Button variant="secondary" onClick={() => void list.refetch()}>
                Thử lại
              </Button>
            }
          >
            {list.error.message}
          </Alert>
        ) : list.data.items.length === 0 ? (
          <EmptyState
            title="Chưa có yêu cầu phù hợp"
            description="Yêu cầu phụ huynh chưa gửi sẽ không xuất hiện trong hàng chờ kiểm duyệt."
          />
        ) : (
          <>
            <p className="mb-4 text-sm text-muted" role="status">
              {list.data.total} yêu cầu theo bộ lọc · Trang {list.data.page}
              {normalizedSearch && ` · ${visibleRequests.length} yêu cầu khớp trong trang`}
            </p>
            {visibleRequests.length === 0 ? (
              <EmptyState
                title="Không có yêu cầu khớp trong trang hiện tại"
                description="Thử từ khóa khác hoặc chuyển trang để tìm tiếp."
                action={
                  <Button variant="secondary" onClick={() => setSearchText('')}>
                    Xóa tìm kiếm
                  </Button>
                }
              />
            ) : (
              <ul className="grid min-w-0 gap-4 md:grid-cols-2">
                {visibleRequests.map((request) => (
                  <li
                    key={request.id}
                    className="min-w-0 rounded-xl border border-primary/20 bg-bg p-5 shadow-card"
                  >
                    <article className="flex min-w-0 h-full flex-col gap-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="text-xs font-semibold tracking-wide text-muted">
                            {request.code}
                          </p>
                          <h2 className="mt-1 text-xl font-semibold text-primary">
                            {request.subjectName} · {request.grade}
                          </h2>
                        </div>
                        <Badge tone={statusTone[request.status]}>
                          {REQUEST_STATUS_LABELS[request.status]}
                        </Badge>
                      </div>
                      <div className="grid gap-2 text-sm text-muted sm:grid-cols-2">
                        <p className="flex items-start gap-2">
                          <MapPin aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
                          <span>
                            {request.mode === 'online'
                              ? 'Trực tuyến'
                              : `Trực tiếp · ${request.area ?? 'Chưa có khu vực'}`}
                          </span>
                        </p>
                        <p className="flex items-start gap-2">
                          <Wallet aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
                          <span>
                            {request.expectedBudgetMinor === null
                              ? 'Ngân sách: trao đổi sau'
                              : `Dự kiến ${formatVnd(request.expectedBudgetMinor)}`}
                          </span>
                        </p>
                        <p className="flex items-start gap-2 sm:col-span-2">
                          <Clock3 aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
                          <span>
                            {request.schedule.discussLater
                              ? 'Lịch học: trao đổi sau'
                              : request.schedule.windows
                                  .map(
                                    (window) =>
                                      `${weekdayLabel(window.weekday)} ${window.startLocal}–${window.endLocal}`,
                                  )
                                  .join('; ')}
                          </span>
                        </p>
                      </div>
                      {request.description && (
                        <p className="line-clamp-2 whitespace-pre-line text-sm">
                          {request.description}
                        </p>
                      )}
                      <div className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
                        <p className="flex items-center gap-1 text-xs text-muted">
                          <CalendarDays aria-hidden="true" className="size-4" />
                          Gửi ngày {requestDate(request.updatedAt)}
                        </p>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => selectRequest(request.id)}
                        >
                          Xem chi tiết
                        </Button>
                      </div>
                    </article>
                  </li>
                ))}
              </ul>
            )}
            {totalPages > 1 && (
              <nav aria-label="Trang yêu cầu" className="mt-4 flex flex-wrap items-center gap-3">
                <Button variant="secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                  Trang trước
                </Button>
                <span className="text-sm text-muted">
                  Trang {page}/{totalPages}
                </span>
                <Button
                  variant="secondary"
                  disabled={page >= totalPages}
                  onClick={() => setPage(page + 1)}
                >
                  Trang sau
                </Button>
              </nav>
            )}
          </>
        )}
      </div>

      {selectedId && (
        <section
          className="flex min-w-0 flex-col gap-4 rounded-xl border-2 border-primary/20 bg-bg p-5 shadow-card md:p-6"
          aria-label="Chi tiết yêu cầu"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-2xl font-semibold text-primary">Chi tiết yêu cầu</h2>
            <Button variant="secondary" onClick={() => selectRequest(null)}>
              Đóng
            </Button>
          </div>
          {detail.isPending ? (
            <PageLoading label="Đang tải chi tiết…" />
          ) : detail.isError ? (
            <Alert
              tone="danger"
              title="Không tải được chi tiết"
              action={
                <Button variant="secondary" onClick={() => void detail.refetch()}>
                  Thử lại
                </Button>
              }
            >
              {detail.error.message}
            </Alert>
          ) : (
            <>
              <p className="rounded-lg bg-info-surface p-4 font-semibold text-primary">
                {detail.data.code} · {detail.data.subjectName} · {detail.data.grade}
              </p>
              <dl className="grid min-w-0 gap-x-6 gap-y-2 text-sm sm:grid-cols-[minmax(9rem,auto)_minmax(0,1fr)]">
                <dt className="font-medium text-muted">Phụ huynh</dt>
                <dd>{detail.data.parentDisplayName}</dd>
                <dt className="font-medium text-muted">Học sinh</dt>
                <dd className="break-words">{detail.data.studentName ?? 'Chưa nhập'}</dd>
                <dt className="font-medium text-muted">Cấp học · Số buổi/tuần</dt>
                <dd>
                  {detail.data.educationLevel
                    ? EDUCATION_LEVEL_LABELS[detail.data.educationLevel]
                    : '—'}
                  {' · '}
                  {detail.data.sessionsPerWeek === null
                    ? 'Chưa nêu'
                    : `${detail.data.sessionsPerWeek} buổi`}
                </dd>
                <dt className="font-medium text-muted">Trạng thái</dt>
                <dd>{REQUEST_STATUS_LABELS[detail.data.status]}</dd>
                <dt className="font-medium text-muted">Khu vực chung</dt>
                <dd>{detail.data.area ?? 'Không áp dụng'}</dd>
                <dt className="font-medium text-muted">Liên hệ riêng tư</dt>
                <dd className="break-words">
                  {detail.data.contactPhone ?? 'Chưa cung cấp'}
                  {detail.data.contactAddress && ` · ${detail.data.contactAddress}`}
                </dd>
                <dt className="font-medium text-muted">Đồng ý chia sẻ</dt>
                <dd>
                  {detail.data.contactConsentAt
                    ? `${requestDate(detail.data.contactConsentAt)} · ${detail.data.contactConsentVersion}`
                    : 'Chưa ghi nhận'}
                </dd>
                <dt className="font-medium text-muted">Lịch mong muốn</dt>
                <dd>
                  {detail.data.schedule.discussLater
                    ? 'Trao đổi sau'
                    : detail.data.schedule.windows
                        .map(
                          (window) =>
                            `${weekdayLabel(window.weekday)} ${window.startLocal}–${window.endLocal}`,
                        )
                        .join('; ')}
                  {' · '}
                  {detail.data.schedule.timezone}
                </dd>
                <dt className="font-medium text-muted">Yêu cầu đối với gia sư</dt>
                <dd className="whitespace-pre-line break-words">
                  {detail.data.tutorRequirements || 'Chưa nêu'}
                </dd>
                <dt className="font-medium text-muted">Đặc điểm học sinh</dt>
                <dd className="whitespace-pre-line break-words">
                  {detail.data.studentTraits || 'Chưa nêu'}
                </dd>
                {detail.data.description && (
                  <>
                    <dt className="font-medium text-muted">Mô tả</dt>
                    <dd className="whitespace-pre-line break-words">{detail.data.description}</dd>
                  </>
                )}
              </dl>
              {detail.data.status === 'submitted' && detail.data.contactConsentAt && (
                <div className="flex flex-wrap gap-2">
                  <Button disabled={isReadOnlyPreview()} onClick={() => openCreate(detail.data)}>
                    Tạo lớp từ yêu cầu
                  </Button>
                </div>
              )}
            </>
          )}
        </section>
      )}

      <ConfirmDialog
        open={createFrom !== null}
        title="Tạo bản nháp lớp"
        description="Lớp được tạo từ yêu cầu đã gửi. Sau khi rà soát nội dung công khai, kiểm duyệt viên có thể xuất bản lớp."
        confirmLabel="Tạo lớp"
        loading={create.isPending}
        onCancel={() => setCreateFrom(null)}
        onConfirm={submitCreate}
      >
        {createFrom?.mode === 'offline' && (
          <TextField
            label="Khu vực công khai"
            required
            maxLength={120}
            value={publicArea}
            onChange={(event) => setPublicArea(event.target.value)}
            hint="Chỉ nhập quận/huyện hoặc khu vực rộng; không nhập số nhà, đường, số điện thoại."
            error={errors.publicArea}
          />
        )}
        {create.isError && <Alert tone="danger">{create.error.message}</Alert>}
      </ConfirmDialog>
    </section>
  );
}
