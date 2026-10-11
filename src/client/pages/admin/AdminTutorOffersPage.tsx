import { useState } from 'react';
import { useSearchParams } from 'react-router';
import type { TutorOffer } from '../../../shared/schemas/tutor-offers';
import { isReadOnlyPreview } from '../../app/preview';
import { Button } from '../../components/ui/Button';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { Alert, Badge, EmptyState, PageHeader } from '../../components/ui/Feedback';
import { SelectField, TextareaField } from '../../components/ui/Field';
import { PageLoading } from '../../components/ui/Spinner';
import { useAdminTutorOfferActions, useAdminTutorOffers } from '../../features/tutor-offers/api';
import { fieldErrors } from '../../lib/api-client';
import { formatVnd } from '../../lib/format';

const STATUS_LABELS: Record<TutorOffer['status'], string> = {
  draft: 'Bản nháp',
  pending: 'Chờ duyệt hợp đồng',
  published: 'Đang tìm học viên',
  rejected: 'Đã từ chối',
  closed: 'Đã đóng',
};

type Review = { item: TutorOffer; action: 'approve' | 'reject' };

function pageFromUrl(params: URLSearchParams): number {
  const value = Number(params.get('page') ?? '1');
  return Number.isSafeInteger(value) && value >= 1 && value <= 1000 ? value : 1;
}

export function AdminTutorOffersPage() {
  const [params, setParams] = useSearchParams();
  const rawStatus = params.get('status') ?? '';
  const status = ['draft', 'pending', 'published', 'rejected', 'closed'].includes(rawStatus)
    ? rawStatus
    : '';
  const page = pageFromUrl(params);
  const offers = useAdminTutorOffers(page, status);
  const { approve, reject } = useAdminTutorOfferActions();
  const [review, setReview] = useState<Review | null>(null);
  const [reason, setReason] = useState('');
  const [localError, setLocalError] = useState('');
  const [notice, setNotice] = useState('');
  const preview = isReadOnlyPreview();
  const busy = approve.isPending || reject.isPending;

  function navigate(nextStatus: string, nextPage: number) {
    const search = new URLSearchParams();
    if (nextStatus) search.set('status', nextStatus);
    if (nextPage > 1) search.set('page', String(nextPage));
    setParams(search);
    document.getElementById('main')?.focus();
  }

  function open(item: TutorOffer, action: Review['action']) {
    approve.reset();
    reject.reset();
    setReason('');
    setLocalError('');
    setNotice('');
    setReview({ item, action });
  }

  function confirm() {
    if (!review || busy || preview) return;
    if (review.action === 'approve') {
      approve.mutate(
        { id: review.item.id, version: review.item.version },
        {
          onSuccess: () => {
            setReview(null);
            setNotice('Đã duyệt hợp đồng và công bố lớp tìm học viên.');
          },
        },
      );
      return;
    }
    if (!reason.trim()) {
      setLocalError('Nhập lý do từ chối.');
      return;
    }
    reject.mutate(
      { id: review.item.id, version: review.item.version, reason: reason.trim() },
      {
        onSuccess: () => {
          setReview(null);
          setNotice('Đã từ chối lớp và ghi nhận lý do.');
        },
      },
    );
  }

  const error = review?.action === 'approve' ? approve.error : reject.error;
  const errors = fieldErrors(error);

  return (
    <section className="flex min-w-0 flex-col gap-6">
      <PageHeader
        title="Duyệt lớp tìm học viên"
        description="Kiểm tra hợp đồng gia sư đã xác nhận trước khi công bố lớp."
      />
      {preview && <Alert tone="info">Bản xem trước chỉ đọc.</Alert>}
      {notice && <Alert tone="success">{notice}</Alert>}
      <div className="max-w-xs">
        <SelectField
          label="Lọc theo trạng thái"
          value={status}
          onChange={(event) => navigate(event.target.value, 1)}
        >
          <option value="">Tất cả trạng thái</option>
          {Object.entries(STATUS_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </SelectField>
      </div>
      {offers.isPending ? (
        <PageLoading label="Đang tải lớp chờ duyệt…" />
      ) : offers.isError ? (
        <Alert
          tone="danger"
          title="Không tải được danh sách"
          action={
            <Button variant="secondary" onClick={() => void offers.refetch()}>
              Thử lại
            </Button>
          }
        >
          {offers.error.message}
        </Alert>
      ) : offers.data.items.length === 0 ? (
        <EmptyState
          title="Không có lớp phù hợp"
          description="Danh sách sẽ cập nhật khi gia sư gửi lớp và xác nhận hợp đồng."
        />
      ) : (
        <>
          <p role="status" className="text-sm text-muted">
            Có {offers.data.total.toLocaleString('vi-VN')} lớp theo bộ lọc.
          </p>
          <ul className="grid gap-4 md:grid-cols-2">
            {offers.data.items.map((item) => (
              <li
                key={item.id}
                className="min-w-0 rounded-xl border border-border bg-bg p-5 shadow-card"
              >
                <article className="flex h-full flex-col gap-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <h2 className="break-words text-lg font-semibold text-primary">
                      {item.subjectName} · {item.grade}
                    </h2>
                    <Badge
                      tone={
                        item.status === 'published'
                          ? 'success'
                          : item.status === 'pending'
                            ? 'warning'
                            : 'neutral'
                      }
                    >
                      {STATUS_LABELS[item.status]}
                    </Badge>
                  </div>
                  <dl className="grid gap-3 text-sm sm:grid-cols-2">
                    <div>
                      <dt className="text-muted">Hình thức</dt>
                      <dd>
                        {item.mode === 'online' ? 'Trực tuyến' : `Trực tiếp · ${item.area ?? ''}`}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted">Học phí đề xuất</dt>
                      <dd>{formatVnd(item.proposedTuitionPerSessionMinor)}/buổi</dd>
                    </div>
                    {item.contractRevision && (
                      <div>
                        <dt className="text-muted">Hợp đồng</dt>
                        <dd>
                          Phiên bản {item.contractRevision} ·{' '}
                          {item.acknowledgedAt ? 'Gia sư đã xác nhận' : 'Chưa xác nhận'}
                        </dd>
                      </div>
                    )}
                  </dl>
                  {item.status === 'rejected' && item.rejectionReason && (
                    <p className="rounded-md bg-warning-surface p-3 text-sm">
                      Lý do từ chối: {item.rejectionReason}
                    </p>
                  )}
                  {item.status === 'pending' && (
                    <div className="mt-auto flex flex-wrap gap-3 border-t border-border pt-4">
                      <Button disabled={preview} onClick={() => open(item, 'approve')}>
                        Xem hợp đồng và duyệt
                      </Button>
                      <Button
                        variant="secondary"
                        disabled={preview}
                        onClick={() => open(item, 'reject')}
                      >
                        Từ chối
                      </Button>
                    </div>
                  )}
                </article>
              </li>
            ))}
          </ul>
          {offers.data.total > offers.data.pageSize && (
            <nav
              aria-label="Trang lớp tìm học viên"
              className="flex items-center justify-center gap-3"
            >
              <Button
                variant="secondary"
                disabled={page <= 1}
                onClick={() => navigate(status, page - 1)}
              >
                Trang trước
              </Button>
              <span className="text-sm text-muted">
                Trang {page} / {Math.ceil(offers.data.total / offers.data.pageSize)}
              </span>
              <Button
                variant="secondary"
                disabled={page * offers.data.pageSize >= offers.data.total}
                onClick={() => navigate(status, page + 1)}
              >
                Trang sau
              </Button>
            </nav>
          )}
        </>
      )}
      <ConfirmDialog
        open={review !== null}
        title={
          review?.action === 'approve'
            ? 'Duyệt hợp đồng và công bố lớp'
            : 'Từ chối lớp tìm học viên'
        }
        description={
          review?.action === 'approve'
            ? 'Sau khi duyệt, lớp xuất hiện trong danh sách tìm học viên.'
            : 'Gia sư có thể chỉnh sửa và gửi duyệt lại.'
        }
        confirmLabel={review?.action === 'approve' ? 'Duyệt và công bố' : 'Từ chối lớp'}
        tone={review?.action === 'approve' ? 'primary' : 'danger'}
        loading={busy}
        onCancel={() => setReview(null)}
        onConfirm={confirm}
      >
        {review && (
          <div className="space-y-4">
            <p className="text-sm">
              {review.item.subjectName} · {review.item.grade} ·{' '}
              {formatVnd(review.item.proposedTuitionPerSessionMinor)}/buổi
            </p>
            <div>
              <p className="font-medium text-primary">
                {review.item.contractTitle} · phiên bản {review.item.contractRevision}
              </p>
              <div
                className="mt-2 max-h-64 overflow-auto whitespace-pre-line break-words rounded-md border border-border bg-surface p-3 text-sm"
                tabIndex={0}
              >
                {review.item.contractBodyText}
              </div>
            </div>
            {review.action === 'reject' && (
              <TextareaField
                label="Lý do từ chối"
                maxLength={500}
                required
                value={reason}
                onChange={(event) => {
                  setReason(event.target.value);
                  setLocalError('');
                }}
                error={errors.reason || localError}
              />
            )}
            {error && <Alert tone="danger">{error.message}</Alert>}
          </div>
        )}
      </ConfirmDialog>
    </section>
  );
}
