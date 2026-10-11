import { Eye, Filter, Phone, Plus } from 'lucide-react';
import { Link, useSearchParams } from 'react-router';
import { REQUEST_STATUSES, type RequestStatus } from '../../../shared/schemas/requests';
import { Button, ButtonLink } from '../../components/ui/Button';
import { Alert, Badge, EmptyState } from '../../components/ui/Feedback';
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
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-primary">Thuê Gia Sư</h1>
          <p className="mt-1 text-sm text-muted">
            Gửi yêu cầu để chúng tôi tìm gia sư phù hợp cho bạn
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <a
            href="tel:0394618480"
            className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm text-on-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          >
            <Phone aria-hidden="true" className="size-4 text-accent" />
            Hotline: <strong className="text-accent">0394 618 480</strong>
          </a>
          <ButtonLink to="/parent/request" variant="accent" className="gap-2 rounded-xl">
            <Plus aria-hidden="true" className="size-4" />
            Tạo yêu cầu tìm gia sư
          </ButtonLink>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-bg p-4 shadow-card">
        <div className="flex flex-wrap items-end gap-3">
          <Filter aria-hidden="true" className="mb-3 hidden size-5 text-primary sm:block" />
          <div className="min-w-48 flex-1 sm:max-w-xs">
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
          {status && (
            <Button variant="secondary" onClick={() => changeStatus('')}>
              Xóa lọc
            </Button>
          )}
        </div>
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
          <div className="overflow-x-auto rounded-xl border border-border bg-bg shadow-card">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="border-b border-border bg-surface text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th scope="col" className="px-4 py-3 font-medium">
                    Mã
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    Môn – Lớp
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    Hình thức · Khu vực
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    Học phí dự kiến
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    Trạng thái
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    Ngày tạo
                  </th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">
                    Thao tác
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {requests.data.items.map((request) => (
                  <tr key={request.id} className="hover:bg-surface">
                    <td className="px-4 py-3 font-mono text-xs">
                      <Link
                        to={`/parent/requests/${encodeURIComponent(request.id)}`}
                        className="font-semibold text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                      >
                        {request.code}
                      </Link>
                    </td>
                    <td className="px-4 py-3 font-medium text-primary">
                      {request.subjectName} · {request.grade}
                    </td>
                    <td className="px-4 py-3 text-muted">
                      {request.mode === 'online'
                        ? 'Trực tuyến'
                        : `Trực tiếp · ${request.area ?? 'Chưa có khu vực'}`}
                    </td>
                    <td className="px-4 py-3 text-muted">
                      {request.expectedBudgetMinor === null
                        ? 'Chưa nêu'
                        : formatVnd(request.expectedBudgetMinor)}
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={statusTone[request.status]}>
                        {REQUEST_STATUS_LABELS[request.status]}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-xs text-muted">
                      {requestDate(request.createdAt)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        to={`/parent/requests/${encodeURIComponent(request.id)}`}
                        className="inline-flex min-h-11 items-center gap-1 rounded-md px-2 font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                      >
                        <Eye aria-hidden="true" className="size-4" />
                        Chi tiết
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
