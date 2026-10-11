import { Link, useSearchParams } from 'react-router';
import { REQUEST_STATUSES, type RequestStatus } from '../../../shared/schemas/requests';
import { Button, ButtonLink } from '../../components/ui/Button';
import { Alert, Badge, EmptyState, PageHeader } from '../../components/ui/Feedback';
import { SelectField } from '../../components/ui/Field';
import { PageLoading } from '../../components/ui/Spinner';
import { useParentRequests } from '../../features/parent-requests/api';
import { REQUEST_STATUS_LABELS, requestDate } from '../../features/parent-requests/format';
import { formatVnd } from '../../lib/format';

const statusTone: Record<RequestStatus, 'neutral' | 'info' | 'success' | 'warning'> = {
  draft: 'neutral',
  submitted: 'info',
  sourcing: 'warning',
  assigned: 'success',
  fulfilled: 'success',
  cancelled: 'neutral',
};

function listParams(status: RequestStatus | '', page: number): URLSearchParams {
  const params = new URLSearchParams();
  if (status) params.set('status', status);
  if (page > 1) params.set('page', String(page));
  return params;
}

export function ParentRequestsPage() {
  const [params, setParams] = useSearchParams();
  const statusParam = params.get('status');
  const status = REQUEST_STATUSES.includes(statusParam as RequestStatus)
    ? (statusParam as RequestStatus)
    : '';
  const rawPage = Number(params.get('page') ?? 1);
  const page = Number.isSafeInteger(rawPage) && rawPage >= 1 && rawPage <= 1000 ? rawPage : 1;
  const requests = useParentRequests(status, page);

  function changeStatus(value: string) {
    setParams(listParams(value as RequestStatus | '', 1));
  }

  return (
    <section className="flex min-w-0 flex-col gap-6">
      <PageHeader
        title="Yêu cầu tìm gia sư"
        description="Theo dõi các yêu cầu của bạn từ dữ liệu đã lưu trên hệ thống."
        actions={<ButtonLink to="/parent/request">Tạo yêu cầu</ButtonLink>}
      />
      <div className="max-w-xs">
        <SelectField
          label="Lọc theo trạng thái"
          value={status}
          onChange={(event) => changeStatus(event.target.value)}
        >
          <option value="">Tất cả trạng thái</option>
          {REQUEST_STATUSES.map((value) => (
            <option key={value} value={value}>
              {REQUEST_STATUS_LABELS[value]}
            </option>
          ))}
        </SelectField>
      </div>

      {requests.isPending ? (
        <PageLoading label="Đang tải yêu cầu…" />
      ) : requests.isError ? (
        <Alert
          tone="danger"
          title="Không tải được yêu cầu"
          action={
            <Button variant="secondary" onClick={() => void requests.refetch()}>
              Thử lại
            </Button>
          }
        >
          {requests.error.message}
        </Alert>
      ) : requests.data.items.length === 0 ? (
        <EmptyState
          title="Chưa có yêu cầu phù hợp"
          description={
            status
              ? 'Không có yêu cầu nào ở trạng thái này.'
              : 'Tạo yêu cầu đầu tiên để kiểm duyệt viên tìm gia sư phù hợp.'
          }
          action={<ButtonLink to="/parent/request">Tạo yêu cầu tìm gia sư</ButtonLink>}
        />
      ) : (
        <>
          <p className="text-sm text-muted" role="status">
            {requests.data.total} yêu cầu · Trang {requests.data.page}
          </p>
          <ul className="grid min-w-0 gap-4">
            {requests.data.items.map((request) => (
              <li
                key={request.id}
                className="min-w-0 rounded-lg border border-border bg-bg p-4 shadow-card"
              >
                <article className="flex min-w-0 flex-col gap-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Link
                      to={`/parent/requests/${encodeURIComponent(request.id)}`}
                      className="break-all font-semibold text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                    >
                      {request.code} · {request.subjectName} · {request.grade}
                    </Link>
                    <Badge tone={statusTone[request.status]}>
                      {REQUEST_STATUS_LABELS[request.status]}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted">
                    {request.mode === 'online' ? 'Trực tuyến' : `Trực tiếp · ${request.area ?? ''}`}
                    {request.expectedBudgetMinor !== null &&
                      ` · Dự kiến ${formatVnd(request.expectedBudgetMinor)}`}
                  </p>
                  {request.description && (
                    <p className="line-clamp-2 whitespace-pre-line text-sm">
                      {request.description}
                    </p>
                  )}
                  <p className="text-xs text-muted">Tạo ngày {requestDate(request.createdAt)}</p>
                </article>
              </li>
            ))}
          </ul>
          <nav aria-label="Trang yêu cầu" className="flex flex-wrap items-center gap-3">
            <Button
              variant="secondary"
              disabled={page <= 1}
              onClick={() => setParams(listParams(status, page - 1))}
            >
              Trang trước
            </Button>
            <span className="text-sm text-muted">
              Trang {page} / {Math.max(1, Math.ceil(requests.data.total / requests.data.pageSize))}
            </span>
            <Button
              variant="secondary"
              disabled={page * requests.data.pageSize >= requests.data.total}
              onClick={() => setParams(listParams(status, page + 1))}
            >
              Trang sau
            </Button>
          </nav>
        </>
      )}
    </section>
  );
}
