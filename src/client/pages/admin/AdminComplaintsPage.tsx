import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import {
  COMPLAINT_STATUSES,
  type AdminComplaintDetail,
  type AdminComplaintSummary,
  type ComplaintStatus,
} from '../../../shared/schemas/complaints';
import type { Page } from '../../../shared/schemas/discovery';
import { isReadOnlyPreview } from '../../app/preview';
import { Button } from '../../components/ui/Button';
import { Alert, Badge, EmptyState, PageHeader } from '../../components/ui/Feedback';
import { SelectField, TextareaField } from '../../components/ui/Field';
import { PageLoading } from '../../components/ui/Spinner';
import { api, fieldErrors, toQuery } from '../../lib/api-client';

const LABELS: Record<ComplaintStatus, string> = {
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

  return (
    <section className="flex min-w-0 flex-col gap-5">
      <PageHeader
        title="Hỗ trợ và khiếu nại"
        description="Xem hồ sơ thực, tiếp nhận và ghi nhận kết quả xử lý cho phụ huynh hoặc gia sư."
      />
      {isReadOnlyPreview() && (
        <Alert tone="info">Bản xem trước chỉ cho phép xem, chưa xử lý khiếu nại.</Alert>
      )}
      {notice && <Alert tone="success">{notice}</Alert>}
      <div className="max-w-xs">
        <SelectField
          label="Lọc trạng thái"
          value={status}
          onChange={(event) => {
            setStatus(event.target.value as ComplaintStatus | '');
            setPage(1);
          }}
        >
          <option value="">Tất cả</option>
          {COMPLAINT_STATUSES.map((value) => (
            <option key={value} value={value}>
              {LABELS[value]}
            </option>
          ))}
        </SelectField>
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
      ) : (
        <>
          <ul className="grid gap-3">
            {complaints.data.items.map((item) => (
              <li key={item.id} className="rounded-lg border border-border bg-surface p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold">{item.title}</p>
                    <p className="text-sm text-muted">
                      {item.code} · {item.creatorDisplayName} ·{' '}
                      {item.creatorRole === 'parent' ? 'Phụ huynh' : 'Gia sư'}
                    </p>
                  </div>
                  <Badge tone={item.status === 'resolved' ? 'success' : 'info'}>
                    {LABELS[item.status]}
                  </Badge>
                </div>
                <Button
                  variant="secondary"
                  className="mt-3"
                  onClick={() => {
                    setSelectedId(item.id);
                    setAction(null);
                    setReason('');
                  }}
                >
                  Xem và xử lý
                </Button>
              </li>
            ))}
          </ul>
          <nav aria-label="Phân trang khiếu nại" className="flex items-center gap-3">
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
          className="max-w-3xl rounded-lg border border-border p-5"
          aria-label="Chi tiết khiếu nại"
        >
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <h2 className="text-lg font-semibold">Chi tiết và xử lý</h2>
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
            <div className="space-y-4">
              <div>
                <p className="font-medium">{detail.data.title}</p>
                <p className="text-sm text-muted">
                  {detail.data.code} · {detail.data.creatorDisplayName}
                </p>
              </div>
              <p className="whitespace-pre-wrap">{detail.data.body}</p>
              {detail.data.triageReason && (
                <p className="text-sm text-muted">Lý do tiếp nhận: {detail.data.triageReason}</p>
              )}
              {detail.data.resolution && (
                <Alert tone="success" title="Kết quả xử lý">
                  {detail.data.resolution}
                </Alert>
              )}
              {detail.data.status !== 'resolved' && (
                <div className="space-y-3 border-t border-border pt-4">
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
                    <div className="space-y-3">
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
        </section>
      )}
    </section>
  );
}
