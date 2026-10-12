import { useState } from 'react';
import {
  ArrowLeft,
  CalendarDays,
  Clock3,
  LockKeyhole,
  MapPin,
  Pencil,
  Phone,
  Wallet,
} from 'lucide-react';
import { Link, useParams } from 'react-router';
import {
  CONTACT_SHARING_CONSENT_TEXT,
  EDUCATION_LEVEL_LABELS,
} from '../../../shared/schemas/requests';
import { Button, ButtonLink } from '../../components/ui/Button';
import { Alert, Badge, EmptyState } from '../../components/ui/Feedback';
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
  const statusTone =
    request.status === 'assigned' || request.status === 'fulfilled'
      ? 'success'
      : request.status === 'sourcing'
        ? 'warning'
        : request.status === 'submitted'
          ? 'info'
          : 'neutral';

  function send() {
    if (!consent || !id || submit.isPending) return;
    submit.mutate({ id, version: request.version }, { onError: () => void detail.refetch() });
  }

  return (
    <section className="flex min-w-0 flex-col gap-6">
      <Link
        to="/parent"
        className="inline-flex min-h-11 items-center gap-2 self-start text-sm font-medium text-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
      >
        <ArrowLeft aria-hidden="true" className="size-4" />
        Về danh sách yêu cầu
      </Link>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-primary">Yêu cầu {request.code}</h1>
          <p className="mt-1 text-sm text-muted">
            Chi tiết yêu cầu tìm gia sư của bạn · Tạo ngày {requestDate(request.createdAt)}
          </p>
        </div>
        {canEdit && (
          <ButtonLink
            to={`/parent/requests/${encodeURIComponent(request.id)}/edit`}
            variant="secondary"
            className="rounded-xl"
          >
            <Pencil aria-hidden="true" className="size-4" />
            Chỉnh sửa yêu cầu
          </ButtonLink>
        )}
      </div>
      {request.status === 'cancelled' && request.cancellationReason && (
        <Alert tone="warning" title="Yêu cầu đã hủy">
          Lý do: {request.cancellationReason}
        </Alert>
      )}
      {request.publishedClassId && request.status === 'sourcing' && (
        <Alert
          tone="success"
          title="Lớp đang tìm gia sư"
          action={
            <ButtonLink
              to={`/lop-hoc/${encodeURIComponent(request.publishedClassId)}`}
              variant="secondary"
            >
              Xem lớp {request.publishedClassCode ?? ''}
            </ButtonLink>
          }
        >
          Yêu cầu đã được công bố trong danh sách lớp tìm gia sư.
        </Alert>
      )}

      <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(17rem,0.38fr)]">
        <article className="min-w-0 overflow-hidden rounded-xl border border-border bg-bg shadow-card">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4 sm:px-6">
            <div>
              <h2 className="text-lg font-semibold text-primary">Chi tiết yêu cầu</h2>
              <p className="mt-1 font-mono text-xs text-muted">{request.code}</p>
            </div>
            <Badge tone={statusTone}>{REQUEST_STATUS_LABELS[request.status]}</Badge>
          </div>
          <dl className="grid gap-x-6 gap-y-5 p-5 text-sm sm:grid-cols-2 sm:p-6">
            <div>
              <dt className="text-xs text-muted">Học sinh</dt>
              <dd className="mt-1 break-words font-semibold text-primary">
                {request.studentName ?? 'Chưa nhập'}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Cấp học · Số buổi/tuần</dt>
              <dd className="mt-1">
                {request.educationLevel ? EDUCATION_LEVEL_LABELS[request.educationLevel] : '—'}
                {' · '}
                {request.sessionsPerWeek === null ? 'Chưa nêu' : `${request.sessionsPerWeek} buổi`}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Môn – Lớp</dt>
              <dd className="mt-1 break-words font-semibold text-primary">
                {request.subjectName} · {request.grade}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Hình thức</dt>
              <dd className="mt-1 font-medium">
                {request.mode === 'online' ? 'Online' : 'Offline (Tại nhà)'}
              </dd>
            </div>
            <div>
              <dt className="flex items-center gap-1 text-xs text-muted">
                <MapPin aria-hidden="true" className="size-3.5" /> Khu vực chung
              </dt>
              <dd className="mt-1 break-words">{request.area ?? 'Không áp dụng'}</dd>
            </div>
            <div>
              <dt className="flex items-center gap-1 text-xs text-muted">
                <Wallet aria-hidden="true" className="size-3.5" /> Học phí dự kiến (VNĐ/buổi)
              </dt>
              <dd className="mt-1">
                {request.expectedBudgetMinor === null
                  ? 'Chưa xác định'
                  : formatVnd(request.expectedBudgetMinor)}
              </dd>
            </div>
            {(request.status === 'assigned' || request.status === 'fulfilled') && (
              <div>
                <dt className="flex items-center gap-1 text-xs text-muted">
                  <Wallet aria-hidden="true" className="size-3.5" /> Học phí đã chốt
                </dt>
                <dd className="mt-1 font-semibold text-primary">
                  {request.agreedTuitionPerSessionMinor === null
                    ? 'Chưa ghi nhận'
                    : `${formatVnd(request.agreedTuitionPerSessionMinor)}/buổi`}
                </dd>
              </div>
            )}
            <div className="sm:col-span-2">
              <dt className="flex items-center gap-1 text-xs text-muted">
                <Clock3 aria-hidden="true" className="size-3.5" /> Lịch học mong muốn
              </dt>
              <dd className="mt-2">
                {request.schedule.discussLater ? (
                  <span>Trao đổi lịch sau</span>
                ) : (
                  <ul className="flex flex-wrap gap-2">
                    {request.schedule.windows.map((window, index) => (
                      <li
                        key={`${window.weekday}-${window.startLocal}-${index}`}
                        className="rounded-md border border-primary/20 bg-info-surface px-2.5 py-1 text-xs font-medium text-primary"
                      >
                        {weekdayLabel(window.weekday)} {window.startLocal}–{window.endLocal}
                      </li>
                    ))}
                  </ul>
                )}
                <span className="mt-1 block text-xs text-muted">{request.schedule.timezone}</span>
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Yêu cầu đối với gia sư</dt>
              <dd className="mt-1 min-w-0 whitespace-pre-line break-words">
                {request.tutorRequirements || 'Chưa nêu'}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Đặc điểm học sinh</dt>
              <dd className="mt-1 min-w-0 whitespace-pre-line break-words">
                {request.studentTraits || 'Chưa nêu'}
              </dd>
            </div>
            {request.description && (
              <div className="sm:col-span-2">
                <dt className="text-xs text-muted">Mô tả nhu cầu</dt>
                <dd className="mt-1 min-w-0 whitespace-pre-line break-words">
                  {request.description}
                </dd>
              </div>
            )}
            <div className="sm:col-span-2">
              <dt className="flex items-center gap-1 text-xs text-muted">
                <CalendarDays aria-hidden="true" className="size-3.5" /> Ngày tạo
              </dt>
              <dd className="mt-1">{requestDate(request.createdAt)}</dd>
            </div>
          </dl>
        </article>

        <aside className="min-w-0 self-start rounded-xl border border-border bg-bg p-5 shadow-card sm:p-6">
          <h2 className="flex items-center gap-2 font-semibold text-primary">
            <LockKeyhole aria-hidden="true" className="size-5 text-accent" />
            Liên hệ riêng tư
          </h2>
          <dl className="mt-5 space-y-4 text-sm">
            <div>
              <dt className="flex items-center gap-1.5 text-xs text-muted">
                <Phone aria-hidden="true" className="size-3.5" /> Số điện thoại
              </dt>
              <dd className="mt-1 break-all font-medium">
                {request.contactPhone ?? 'Chưa cung cấp'}
              </dd>
            </div>
            <div>
              <dt className="flex items-center gap-1.5 text-xs text-muted">
                <MapPin aria-hidden="true" className="size-3.5" /> Địa chỉ
              </dt>
              <dd className="mt-1 break-words">{request.contactAddress ?? 'Chưa cung cấp'}</dd>
            </div>
          </dl>
          <p className="mt-5 rounded-lg bg-info-surface p-3 text-xs text-muted">
            Chỉ bạn và kiểm duyệt viên được xem thông tin này trước khi gán gia sư.
          </p>
          {request.contactConsentAt && (
            <p className="mt-3 text-xs text-muted">
              Đã ghi nhận đồng ý chia sẻ liên hệ · {requestDate(request.contactConsentAt)}
            </p>
          )}
        </aside>
      </div>

      {request.status === 'draft' && (
        <div className="flex max-w-2xl flex-col gap-4 rounded-xl border border-border bg-bg p-5 shadow-card sm:p-6">
          <h2 className="text-lg font-semibold text-primary">Gửi yêu cầu cho kiểm duyệt viên</h2>
          <p className="text-sm text-muted">
            Cần số điện thoại, mô tả nhu cầu và lịch mong muốn hợp lệ trước khi gửi.
          </p>
          <p className="text-sm text-muted">
            Khi gửi, thông tin lớp học và khu vực chung sẽ được công bố để tìm gia sư. Số điện thoại
            và địa chỉ cụ thể không được công khai.
          </p>
          <label className="flex min-h-11 items-start gap-3 rounded-lg border border-border bg-surface p-3">
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
          <Button
            onClick={send}
            loading={submit.isPending}
            disabled={!consent}
            className="self-start rounded-xl"
          >
            Gửi yêu cầu
          </Button>
        </div>
      )}
    </section>
  );
}
