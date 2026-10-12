import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Eye,
  MessageSquare,
  Search,
  UserRound,
} from 'lucide-react';
import { useState } from 'react';
import {
  SENT_COMPLAINT_STATUSES,
  type AdminComplaintDetail,
  type AdminComplaintSummary,
  type ComplaintStatus,
} from '../../../shared/schemas/complaints';
import type { Page } from '../../../shared/schemas/discovery';
import { isReadOnlyPreview } from '../../app/preview';
import { Button } from '../../components/ui/Button';
import { Alert, Badge, EmptyState, PageHeader } from '../../components/ui/Feedback';
import { TextareaField, TextField } from '../../components/ui/Field';
import { PageLoading } from '../../components/ui/Spinner';
import { api, fieldErrors, toQuery } from '../../lib/api-client';

const LABELS: Record<ComplaintStatus, string> = {
  draft: 'Chưa gửi',
  submitted: 'Chờ xem xét',
  in_review: 'Đang xử lý',
  resolved: 'Đã xử lý',
};

type Action = 'triage' | 'resolve';

export function AdminComplaintsPage() {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<ComplaintStatus | ''>('');
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [action, setAction] = useState<Action | null>(null);
  const [reason, setReason] = useState('');
  const [notice, setNotice] = useState('');
  const [validation, setValidation] = useState('');
  const [search, setSearch] = useState('');
  const complaints = useQuery({
    queryKey: ['admin-complaints', status, page],
    queryFn: ({ signal }) =>
      api.get<Page<AdminComplaintSummary>>(
        `/admin/complaints${toQuery({ status: status || undefined, page })}`,
        { signal },
      ),
    placeholderData: keepPreviousData,
  });
  const detail = useQuery({
    queryKey: ['admin-complaint', selectedId],
    queryFn: ({ signal }) =>
      api.get<AdminComplaintDetail>(`/admin/complaints/${encodeURIComponent(selectedId!)}`, {
        signal,
      }),
    enabled: selectedId !== null,
  });
  const transition = useMutation({
    mutationFn: ({
      item,
      action,
      reason,
    }: {
      item: AdminComplaintDetail;
      action: Action;
      reason: string;
    }) =>
      api.post<AdminComplaintDetail>(
        `/admin/complaints/${encodeURIComponent(item.id)}/${action}`,
        action === 'triage'
          ? { version: item.version, reason }
          : { version: item.version, resolution: reason },
      ),
    onSuccess: (updated) => {
      setAction(null);
      setReason('');
      setValidation('');
      setNotice(
        updated.status === 'resolved'
          ? `Đã ghi nhận kết quả xử lý ${updated.code}.`
          : `Đã tiếp nhận xử lý ${updated.code}.`,
      );
      queryClient.setQueryData(['admin-complaint', updated.id], updated);
      void queryClient.invalidateQueries({ queryKey: ['admin-complaints'] });
    },
  });

  function act(item: AdminComplaintDetail) {
    if (!action) return;
    if (reason.trim().length < 4) {
      setValidation('Cần nêu lý do hoặc kết quả xử lý ít nhất 4 ký tự.');
      return;
    }
    setValidation('');
    setNotice('');
    transition.mutate({ item, action, reason: reason.trim() });
  }

  const totalPages = Math.max(
    1,
    Math.ceil((complaints.data?.total ?? 0) / (complaints.data?.pageSize ?? 12)),
  );
  const errors = fieldErrors(transition.error);
  const searchTerm = search.trim().toLocaleLowerCase('vi-VN');
  const visibleItems =
    complaints.data?.items.filter((item) =>
      [item.code, item.title, item.creatorDisplayName].some((value) =>
        value.toLocaleLowerCase('vi-VN').includes(searchTerm),
      ),
    ) ?? [];

  function changeStatus(value: ComplaintStatus | '') {
    setStatus(value);
    setPage(1);
    setSearch('');
  }

  return (
    <section className="flex min-w-0 flex-col gap-6">
      <PageHeader
        title="Quản lý khiếu nại"
        description="Xử lý và giải quyết khiếu nại từ người học và gia sư"
      />
      {isReadOnlyPreview() && (
        <Alert tone="info">Bản xem trước chỉ cho phép xem, chưa xử lý khiếu nại.</Alert>
      )}
      {notice && <Alert tone="success">{notice}</Alert>}
      {complaints.isSuccess && !complaints.isPlaceholderData && (
        <div
          className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
          aria-label="Số liệu trang hiện tại"
        >
          {(
            [
              {
                key: 'submitted',
                label: 'Chờ xem xét',
                icon: Clock3,
                tone: 'bg-warning-surface text-warning',
              },
              {
                key: 'in_review',
                label: 'Đang xử lý',
                icon: MessageSquare,
                tone: 'bg-info-surface text-primary',
              },
              {
                key: 'resolved',
                label: 'Đã xử lý',
                icon: CheckCircle2,
                tone: 'bg-success-surface text-success',
              },
            ] as const
          ).map(({ key, label, icon: Icon, tone }) => (
            <div key={key} className={`rounded-xl border border-border p-4 shadow-card ${tone}`}>
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-medium">{label}</p>
                  <p className="mt-1 text-3xl font-bold">
                    {complaints.data.items.filter((item) => item.status === key).length}
                  </p>
                </div>
                <Icon aria-hidden="true" className="size-10 opacity-40" />
              </div>
              <p className="mt-1 text-xs">Trong trang đang xem</p>
            </div>
          ))}
          <div className="rounded-xl border border-border bg-surface p-4 text-primary shadow-card">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-sm font-medium">Tổng theo bộ lọc</p>
                <p className="mt-1 text-3xl font-bold">{complaints.data.total}</p>
              </div>
              <AlertTriangle aria-hidden="true" className="size-10 opacity-40" />
            </div>
            <p className="mt-1 text-xs">Từ danh sách hệ thống</p>
          </div>
        </div>
      )}
      <div className="space-y-4 rounded-xl border border-border bg-bg p-4 shadow-card sm:p-5">
        <div className="flex items-end gap-3">
          <Search aria-hidden="true" className="mb-3 hidden size-5 text-primary sm:block" />
          <div className="w-full sm:max-w-md">
            <TextField
              label="Tìm trong trang hiện tại"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Mã, tiêu đề hoặc người gửi"
            />
          </div>
        </div>
        <div aria-label="Lọc trạng thái" className="flex flex-wrap gap-2">
          <Button
            variant={status === '' ? 'primary' : 'secondary'}
            aria-pressed={status === ''}
            onClick={() => changeStatus('')}
            className="rounded-lg"
          >
            Tất cả
          </Button>
          {SENT_COMPLAINT_STATUSES.map((value) => (
            <Button
              key={value}
              variant={status === value ? 'primary' : 'secondary'}
              aria-pressed={status === value}
              onClick={() => changeStatus(value)}
              className="rounded-lg"
            >
              {LABELS[value]}
            </Button>
          ))}
        </div>
      </div>
      {complaints.isPending ? (
        <PageLoading label="Đang tải khiếu nại…" />
      ) : complaints.isError ? (
        <Alert
          tone="danger"
          action={
            <Button variant="secondary" onClick={() => void complaints.refetch()}>
              Thử lại
            </Button>
          }
        >
          {complaints.error.message}
        </Alert>
      ) : complaints.data.items.length === 0 ? (
        <EmptyState
          title="Chưa có khiếu nại"
          description="Các khiếu nại đã gửi sẽ hiển thị tại đây."
        />
      ) : visibleItems.length === 0 ? (
        <EmptyState
          title="Không tìm thấy khiếu nại"
          description="Không có kết quả trong trang hiện tại với từ khóa này."
          action={
            <Button variant="secondary" onClick={() => setSearch('')}>
              Xóa tìm kiếm
            </Button>
          }
        />
      ) : (
        <>
          <ul className="grid gap-4 lg:grid-cols-2">
            {visibleItems.map((item) => (
              <li
                key={item.id}
                className="flex min-w-0 flex-col justify-between rounded-xl border border-border bg-bg p-5 shadow-card"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-mono text-xs text-muted">{item.code}</p>
                    <p className="mt-1 break-words font-semibold text-primary">{item.title}</p>
                  </div>
                  <Badge
                    tone={
                      item.status === 'resolved'
                        ? 'success'
                        : item.status === 'in_review'
                          ? 'info'
                          : 'warning'
                    }
                  >
                    {LABELS[item.status]}
                  </Badge>
                </div>
                <div className="mt-4 space-y-1.5 text-sm text-muted">
                  <p className="flex items-center gap-2">
                    <UserRound aria-hidden="true" className="size-4 shrink-0" />
                    <span className="break-words">
                      {item.creatorDisplayName} ·{' '}
                      {item.creatorRole === 'parent' ? 'Người học' : 'Gia sư'}
                    </span>
                  </p>
                  <p className="flex items-center gap-2">
                    <CalendarDays aria-hidden="true" className="size-4 shrink-0" />
                    {new Date(item.createdAt).toLocaleDateString('vi-VN')}
                  </p>
                </div>
                <Button
                  variant="secondary"
                  className="mt-4 self-start rounded-xl"
                  onClick={() => {
                    setSelectedId(item.id);
                    setAction(null);
                    setReason('');
                  }}
                >
                  <Eye aria-hidden="true" className="size-4" />
                  Xem và xử lý
                </Button>
              </li>
            ))}
          </ul>
          <nav
            aria-label="Phân trang khiếu nại"
            className="flex flex-wrap items-center gap-3 text-sm"
          >
            <Button variant="secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>
              Trước
            </Button>
            <span>
              Trang {page}/{totalPages}
            </span>
            <Button
              variant="secondary"
              disabled={page >= totalPages}
              onClick={() => setPage(page + 1)}
            >
              Sau
            </Button>
          </nav>
        </>
      )}
      {selectedId && (
        <section
          className="max-w-3xl overflow-hidden rounded-xl border border-border bg-bg shadow-card"
          aria-label="Chi tiết khiếu nại"
        >
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-5 py-4 sm:px-6">
            <h2 className="text-xl font-semibold text-primary">Chi tiết khiếu nại</h2>
            <Button
              variant="secondary"
              onClick={() => {
                setSelectedId(null);
                setAction(null);
              }}
            >
              Đóng
            </Button>
          </div>
          <div className="p-5 sm:p-6">
            {detail.isPending ? (
              <PageLoading label="Đang tải chi tiết…" />
            ) : detail.isError ? (
              <Alert
                tone="danger"
                action={
                  <Button variant="secondary" onClick={() => void detail.refetch()}>
                    Thử lại
                  </Button>
                }
              >
                {detail.error.message}
              </Alert>
            ) : (
              <div className="space-y-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-mono text-xs text-muted">{detail.data.code}</p>
                    <p className="mt-1 text-lg font-semibold text-primary">{detail.data.title}</p>
                  </div>
                  <Badge
                    tone={
                      detail.data.status === 'resolved'
                        ? 'success'
                        : detail.data.status === 'in_review'
                          ? 'info'
                          : 'warning'
                    }
                  >
                    {LABELS[detail.data.status]}
                  </Badge>
                </div>
                <dl className="grid gap-4 rounded-lg bg-surface p-4 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="text-xs text-muted">Người khiếu nại</dt>
                    <dd className="mt-1 font-medium">
                      {detail.data.creatorDisplayName}
                      <span className="block text-xs font-normal text-muted">
                        {detail.data.creatorRole === 'parent' ? 'Người học' : 'Gia sư'}
                      </span>
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted">Ngày tạo</dt>
                    <dd className="mt-1 font-medium">
                      {new Date(detail.data.createdAt).toLocaleDateString('vi-VN')}
                    </dd>
                  </div>
                </dl>
                <div>
                  <h3 className="mb-2 text-sm font-medium text-muted">Nội dung khiếu nại</h3>
                  <p className="whitespace-pre-wrap break-words rounded-lg bg-surface p-4 text-sm">
                    {detail.data.body}
                  </p>
                </div>
                {detail.data.triageReason && (
                  <div className="rounded-lg border border-border p-4 text-sm">
                    <p className="font-medium text-primary">Lý do tiếp nhận</p>
                    <p className="mt-1 whitespace-pre-wrap break-words text-muted">
                      {detail.data.triageReason}
                    </p>
                  </div>
                )}
                {detail.data.resolution && (
                  <Alert tone="success" title="Kết quả xử lý">
                    {detail.data.resolution}
                  </Alert>
                )}
                {detail.data.status !== 'resolved' && (
                  <div className="space-y-3 border-t border-border pt-5">
                    <div className="flex flex-wrap gap-2">
                      {detail.data.status === 'submitted' && (
                        <Button
                          variant="secondary"
                          disabled={isReadOnlyPreview()}
                          onClick={() => {
                            setAction('triage');
                            setReason('');
                            setValidation('');
                          }}
                        >
                          Tiếp nhận
                        </Button>
                      )}
                      <Button
                        variant="secondary"
                        disabled={isReadOnlyPreview()}
                        onClick={() => {
                          setAction('resolve');
                          setReason('');
                          setValidation('');
                        }}
                      >
                        Ghi kết quả
                      </Button>
                    </div>
                    {action && (
                      <div className="space-y-3 rounded-lg bg-surface p-4">
                        <TextareaField
                          label={
                            action === 'triage' ? 'Lý do tiếp nhận' : 'Kết quả gửi người khiếu nại'
                          }
                          value={reason}
                          required
                          minLength={4}
                          maxLength={action === 'triage' ? 1000 : 2000}
                          onChange={(event) => setReason(event.target.value)}
                          error={errors.reason ?? errors.resolution}
                        />
                        {validation && <Alert tone="danger">{validation}</Alert>}
                        {transition.isError && (
                          <Alert tone="danger">{transition.error.message}</Alert>
                        )}
                        <Button
                          loading={transition.isPending}
                          disabled={isReadOnlyPreview()}
                          onClick={() => act(detail.data)}
                        >
                          {action === 'triage' ? 'Xác nhận tiếp nhận' : 'Lưu kết quả'}
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </section>
      )}
    </section>
  );
}
