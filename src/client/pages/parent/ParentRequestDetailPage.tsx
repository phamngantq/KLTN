import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { CONTACT_SHARING_CONSENT_TEXT } from '../../../shared/schemas/requests';
import { Button, ButtonLink } from '../../components/ui/Button';
import { Alert, Badge, EmptyState, PageHeader } from '../../components/ui/Feedback';
import { PageLoading } from '../../components/ui/Spinner';
import { useOwnParentRequest, useSubmitParentRequest } from '../../features/parent-requests/api';
import {
  REQUEST_STATUS_LABELS,
  requestDate,
  weekdayLabel,
} from '../../features/parent-requests/format';
import { isApiError } from '../../lib/api-client';
import { formatVnd } from '../../lib/format';

export function ParentRequestDetailPage() {
  const { id } = useParams();
  const detail = useOwnParentRequest(id);
  const submit = useSubmitParentRequest();
  const [consentedRequestId, setConsentedRequestId] = useState<string | null>(null);
  const consent = consentedRequestId === id;

  if (detail.isPending) return <PageLoading label="Đang tải chi tiết yêu cầu…" />;
  if (detail.isError) {
    if (isApiError(detail.error, 'REQUEST_NOT_FOUND')) {
      return (
        <EmptyState
          title="Không tìm thấy yêu cầu"
          description="Yêu cầu này không tồn tại hoặc bạn không có quyền xem."
          action={<ButtonLink to="/parent">Về danh sách yêu cầu</ButtonLink>}
        />
      );
    }
    return (
      <Alert
        tone="danger"
        title="Không tải được yêu cầu"
        action={
          <Button variant="secondary" onClick={() => void detail.refetch()}>
            Thử lại
          </Button>
        }
      >
        {detail.error.message}
      </Alert>
    );
  }

  const request = detail.data;
  const canEdit = request.status === 'draft' || request.status === 'submitted';

  function send() {
    if (!consent || !id || submit.isPending) return;
    submit.mutate({ id, version: request.version }, { onError: () => void detail.refetch() });
  }

  return (
    <section className="flex min-w-0 flex-col gap-6">
      <Link to="/parent" className="self-start text-sm text-primary underline">
        Về danh sách yêu cầu
      </Link>
      <PageHeader
        title={`Yêu cầu ${request.code}`}
        description={`Tạo ngày ${requestDate(request.createdAt)} · Phiên bản ${request.version}`}
        actions={
          canEdit ? (
            <ButtonLink
              to={`/parent/requests/${encodeURIComponent(request.id)}/edit`}
              variant="secondary"
            >
              Chỉnh sửa yêu cầu
            </ButtonLink>
          ) : undefined
        }
      />
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-muted">Trạng thái</span>
        <Badge tone={request.status === 'draft' ? 'neutral' : 'info'}>
          {REQUEST_STATUS_LABELS[request.status]}
        </Badge>
      </div>

      <dl className="grid min-w-0 gap-x-6 gap-y-3 rounded-lg border border-border bg-bg p-4 sm:grid-cols-[minmax(9rem,auto)_minmax(0,1fr)]">
        <dt className="font-medium text-muted">Môn học và lớp</dt>
        <dd className="min-w-0 break-words">
          {request.subjectName} · {request.grade}
        </dd>
        <dt className="font-medium text-muted">Hình thức</dt>
        <dd>{request.mode === 'online' ? 'Trực tuyến' : 'Trực tiếp'}</dd>
        <dt className="font-medium text-muted">Khu vực chung</dt>
        <dd className="min-w-0 break-words">{request.area ?? 'Không áp dụng'}</dd>
        <dt className="font-medium text-muted">Mức chi dự kiến</dt>
        <dd>
          {request.expectedBudgetMinor === null
            ? 'Chưa xác định'
            : formatVnd(request.expectedBudgetMinor)}
        </dd>
        <dt className="font-medium text-muted">Mô tả nhu cầu</dt>
        <dd className="min-w-0 whitespace-pre-line break-words">
          {request.description || 'Chưa có mô tả'}
        </dd>
        <dt className="font-medium text-muted">Lịch học mong muốn</dt>
        <dd>
          {request.schedule.discussLater ? (
            'Trao đổi lịch sau'
          ) : (
            <ul className="space-y-1">
              {request.schedule.windows.map((window, index) => (
                <li key={`${window.weekday}-${window.startLocal}-${index}`}>
                  {weekdayLabel(window.weekday)} · {window.startLocal}–{window.endLocal}
                </li>
              ))}
            </ul>
          )}
          <span className="block text-xs text-muted">{request.schedule.timezone}</span>
        </dd>
      </dl>

      <div className="rounded-lg border border-border bg-surface p-4">
        <h2 className="font-semibold text-primary">Liên hệ riêng tư</h2>
        <p className="mt-2 break-all text-sm">
          Số điện thoại: {request.contactPhone ?? 'Chưa cung cấp'}
        </p>
        <p className="mt-1 break-words text-sm">
          Địa chỉ: {request.contactAddress ?? 'Chưa cung cấp'}
        </p>
        <p className="mt-2 text-xs text-muted">
          Chỉ bạn và kiểm duyệt viên được xem thông tin này trước khi gán gia sư.
        </p>
        {request.contactConsentAt && (
          <p className="mt-2 text-xs text-muted">
            Đã ghi nhận đồng ý chia sẻ liên hệ · {requestDate(request.contactConsentAt)}
          </p>
        )}
      </div>

      {request.status === 'draft' && (
        <div className="flex max-w-2xl flex-col gap-4 rounded-lg border border-border p-4">
          <h2 className="font-semibold text-primary">Gửi yêu cầu cho kiểm duyệt viên</h2>
          <p className="text-sm text-muted">
            Cần số điện thoại, mô tả nhu cầu và lịch mong muốn hợp lệ trước khi gửi.
          </p>
          <label className="flex min-h-11 items-start gap-3">
            <input
              type="checkbox"
              checked={consent}
              onChange={(event) =>
                setConsentedRequestId(event.target.checked ? (id ?? null) : null)
              }
              className="mt-1 size-4 shrink-0 accent-[var(--color-primary)]"
            />
            <span className="text-sm">{CONTACT_SHARING_CONSENT_TEXT}</span>
          </label>
          {submit.isError && (
            <Alert tone="danger" title="Chưa gửi được yêu cầu">
              {submit.error.message}
            </Alert>
          )}
          <Button onClick={send} loading={submit.isPending} disabled={!consent}>
            Gửi yêu cầu
          </Button>
        </div>
      )}
      {submit.isSuccess && request.status === 'submitted' && (
        <Alert tone="success">Đã gửi yêu cầu. Kiểm duyệt viên sẽ xem xét thông tin của bạn.</Alert>
      )}
    </section>
  );
}
