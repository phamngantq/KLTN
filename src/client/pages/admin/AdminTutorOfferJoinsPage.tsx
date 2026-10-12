import { useState } from 'react';
import { useSearchParams } from 'react-router';
import type { AdminTutorOfferJoin } from '../../../shared/schemas/tutor-offer-joins';
import { isReadOnlyPreview } from '../../app/preview';
import { Button } from '../../components/ui/Button';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { Alert, Badge, EmptyState, PageHeader } from '../../components/ui/Feedback';
import { SelectField, TextareaField, TextField } from '../../components/ui/Field';
import { PageLoading } from '../../components/ui/Spinner';
import {
  useAdminTutorOfferJoinActions,
  useAdminTutorOfferJoinDetail,
  useAdminTutorOfferJoins,
} from '../../features/tutor-offer-joins/api';
import { fieldErrors } from '../../lib/api-client';
import { formatVnd } from '../../lib/format';

const STATUS_LABELS: Record<AdminTutorOfferJoin['status'], string> = {
  submitted: 'Chờ xử lý',
  withdrawn: 'Đã rút',
  approved: 'Đã duyệt',
  rejected: 'Đã từ chối',
  completed: 'Đã hoàn tất',
  revoked: 'Đã thu hồi',
};

type Review = { item: AdminTutorOfferJoin; action: 'approve' | 'reject' | 'complete' | 'revoke' };

function pageFromUrl(params: URLSearchParams): number {
  const value = Number(params.get('page') ?? '1');
  return Number.isSafeInteger(value) && value >= 1 && value <= 1000 ? value : 1;
}

export function AdminTutorOfferJoinsPage() {
  const [params, setParams] = useSearchParams();
  const rawStatus = params.get('status') ?? 'submitted';
  const status = Object.keys(STATUS_LABELS).includes(rawStatus) ? rawStatus : '';
  const page = pageFromUrl(params);
  const joins = useAdminTutorOfferJoins(page, status);
  const { approve, reject, complete, revoke } = useAdminTutorOfferJoinActions();
  const [review, setReview] = useState<Review | null>(null);
  const [reason, setReason] = useState('');
  const [tuition, setTuition] = useState('');
  const [partiesAgreed, setPartiesAgreed] = useState(false);
  const [localError, setLocalError] = useState('');
  const [notice, setNotice] = useState('');
  const detail = useAdminTutorOfferJoinDetail(
    review?.action === 'approve' ? review.item.id : undefined,
  );
  const busy = approve.isPending || reject.isPending || complete.isPending || revoke.isPending;
  const error =
    review?.action === 'approve'
      ? approve.error
      : review?.action === 'complete'
        ? complete.error
        : review?.action === 'revoke'
          ? revoke.error
          : reject.error;
  const errors = fieldErrors(error);

  function changePage(nextStatus: string, nextPage: number) {
    const search = new URLSearchParams();
    if (nextStatus) search.set('status', nextStatus);
    if (nextPage > 1) search.set('page', String(nextPage));
    setParams(search);
    document.getElementById('main')?.focus();
  }

  function open(item: AdminTutorOfferJoin, action: Review['action']) {
    approve.reset();
    reject.reset();
    complete.reset();
    revoke.reset();
    setReason('');
    setTuition('');
    setPartiesAgreed(false);
    setLocalError('');
    setReview({ item, action });
  }

  function confirm() {
    if (!review || busy || isReadOnlyPreview()) return;
    if (review.action === 'approve') {
      if (!detail.data || detail.isError) {
        setLocalError('Cần tải chi tiết yêu cầu để xác nhận liên hệ với hai bên.');
        return;
      }
      const amount = Number(tuition.trim());
      if (
        !/^\d+$/.test(tuition.trim()) ||
        !Number.isSafeInteger(amount) ||
        amount < 1 ||
        amount > 100_000_000
      ) {
        setLocalError('Nhập học phí đã chốt từ 1 đến 100.000.000 VNĐ mỗi buổi.');
        return;
      }
      if (!partiesAgreed) {
        setLocalError('Cần xác nhận hai bên đã thống nhất mức học phí này.');
        return;
      }
      approve.mutate(
        { id: review.item.id, version: review.item.version, agreedTuitionPerSessionMinor: amount },
        {
          onSuccess: () => {
            setReview(null);
            setNotice(`Đã duyệt yêu cầu với học phí đã chốt ${formatVnd(amount)}/buổi.`);
          },
        },
      );
      return;
    }
    if (reason.trim().length < 5 || reason.trim().length > 500) {
      setLocalError('Lý do cần từ 5 đến 500 ký tự.');
      return;
    }
    const input = { id: review.item.id, version: review.item.version, reason: reason.trim() };
    if (review.action === 'complete') {
      complete.mutate(input, {
        onSuccess: () => {
          setReview(null);
          setNotice('Đã ghi nhận hoàn tất lớp.');
        },
      });
    } else if (review.action === 'revoke') {
      revoke.mutate(input, {
        onSuccess: () => {
          setReview(null);
          setNotice('Đã thu hồi phê duyệt yêu cầu.');
        },
      });
    } else {
      reject.mutate(input, {
        onSuccess: () => {
          setReview(null);
          setNotice('Đã từ chối yêu cầu tham gia lớp.');
        },
      });
    }
  }

  return (
    <section className="flex min-w-0 flex-col gap-6">
      <PageHeader
        title="Yêu cầu tham gia lớp tìm học viên"
        description="Xem nhu cầu học tập người học đã gửi và xử lý yêu cầu."
      />
      {notice && <Alert tone="success">{notice}</Alert>}
      {isReadOnlyPreview() && <Alert tone="info">Bản xem trước chỉ đọc.</Alert>}
      <div className="max-w-xs">
        <SelectField
          label="Lọc theo trạng thái"
          value={status}
          onChange={(event) => changePage(event.target.value, 1)}
        >
          <option value="">Tất cả trạng thái</option>
          {Object.entries(STATUS_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </SelectField>
      </div>
      {joins.isPending ? (
        <PageLoading label="Đang tải yêu cầu tham gia lớp…" />
      ) : joins.isError ? (
        <Alert
          tone="danger"
          title="Không tải được yêu cầu"
          action={
            <Button variant="secondary" onClick={() => void joins.refetch()}>
              Thử lại
            </Button>
          }
        >
          {joins.error.message}
        </Alert>
      ) : joins.data.items.length === 0 ? (
        <EmptyState title="Không có yêu cầu phù hợp" />
      ) : (
        <>
          <p role="status" className="text-sm text-muted">
            Có {joins.data.total.toLocaleString('vi-VN')} yêu cầu theo bộ lọc.
          </p>
          <ul className="grid gap-4 md:grid-cols-2">
            {joins.data.items.map((join) => (
              <li
                key={join.id}
                className="min-w-0 rounded-xl border border-border bg-bg p-5 shadow-card"
              >
                <article className="flex h-full flex-col gap-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <h2 className="break-words text-lg font-semibold text-primary">
                      {join.subjectName} · {join.offerGrade}
                    </h2>
                    <Badge
                      tone={
                        join.status === 'approved'
                          ? 'success'
                          : join.status === 'submitted'
                            ? 'info'
                            : 'neutral'
                      }
                    >
                      {STATUS_LABELS[join.status]}
                    </Badge>
                  </div>
                  <dl className="grid gap-3 text-sm sm:grid-cols-2">
                    <div>
                      <dt className="text-muted">Người học</dt>
                      <dd>{join.parentDisplayName}</dd>
                    </div>
                    <div>
                      <dt className="text-muted">Lớp học của học sinh</dt>
                      <dd>{join.studentGrade}</dd>
                    </div>
                    {join.teachingArea && (
                      <div>
                        <dt className="text-muted">Khu vực chung</dt>
                        <dd className="break-words">{join.teachingArea}</dd>
                      </div>
                    )}
                    <div className="sm:col-span-2">
                      <dt className="text-muted">Nhu cầu học tập</dt>
                      <dd className="mt-1 whitespace-pre-line break-words">{join.learningNeeds}</dd>
                    </div>
                  </dl>
                  {join.status === 'rejected' && join.rejectionReason && (
                    <p className="rounded-md bg-warning-surface p-3 text-sm">
                      Lý do từ chối: {join.rejectionReason}
                    </p>
                  )}
                  {join.agreedTuitionPerSessionMinor !== null && (
                    <p className="text-sm font-semibold text-primary">
                      Học phí đã chốt: {formatVnd(join.agreedTuitionPerSessionMinor)}/buổi
                    </p>
                  )}
                  {join.terminalReason && (
                    <p className="rounded-md bg-surface p-3 text-sm">
                      Lý do kết thúc: {join.terminalReason}
                    </p>
                  )}
                  {join.status === 'submitted' && (
                    <div className="mt-auto flex flex-wrap gap-3 border-t border-border pt-4">
                      <Button disabled={isReadOnlyPreview()} onClick={() => open(join, 'approve')}>
                        Duyệt yêu cầu
                      </Button>
                      <Button
                        variant="secondary"
                        disabled={isReadOnlyPreview()}
                        onClick={() => open(join, 'reject')}
                      >
                        Từ chối
                      </Button>
                    </div>
                  )}
                  {join.status === 'approved' && (
                    <div className="mt-auto flex flex-wrap gap-3 border-t border-border pt-4">
                      <Button
                        variant="secondary"
                        disabled={isReadOnlyPreview()}
                        onClick={() => open(join, 'complete')}
                      >
                        Hoàn tất lớp
                      </Button>
                      <Button
                        variant="danger"
                        disabled={isReadOnlyPreview()}
                        onClick={() => open(join, 'revoke')}
                      >
                        Thu hồi phê duyệt
                      </Button>
                    </div>
                  )}
                </article>
              </li>
            ))}
          </ul>
          {joins.data.total > joins.data.pageSize && (
            <nav
              aria-label="Trang yêu cầu tham gia lớp"
              className="flex items-center justify-center gap-3"
            >
              <Button
                variant="secondary"
                disabled={page <= 1}
                onClick={() => changePage(status, page - 1)}
              >
                Trang trước
              </Button>
              <span className="text-sm text-muted">
                Trang {page} / {Math.ceil(joins.data.total / joins.data.pageSize)}
              </span>
              <Button
                variant="secondary"
                disabled={page * joins.data.pageSize >= joins.data.total}
                onClick={() => changePage(status, page + 1)}
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
            ? 'Duyệt yêu cầu tham gia lớp'
            : review?.action === 'complete'
              ? 'Hoàn tất lớp'
              : review?.action === 'revoke'
                ? 'Thu hồi phê duyệt'
                : 'Từ chối yêu cầu tham gia lớp'
        }
        description={
          review?.action === 'approve'
            ? 'Sau khi duyệt, hai bên có thể xem số điện thoại của nhau. Xác nhận mức học phí đã thống nhất.'
            : review?.action === 'complete' || review?.action === 'revoke'
              ? 'Quyền xem số điện thoại của hai bên sẽ chấm dứt ngay khi thao tác được ghi nhận.'
              : 'Lưu lý do để người học biết kết quả.'
        }
        confirmLabel={
          review?.action === 'approve'
            ? 'Duyệt yêu cầu'
            : review?.action === 'complete'
              ? 'Xác nhận hoàn tất'
              : review?.action === 'revoke'
                ? 'Thu hồi phê duyệt'
                : 'Từ chối'
        }
        tone={review?.action === 'approve' || review?.action === 'complete' ? 'primary' : 'danger'}
        loading={busy}
        onCancel={() => setReview(null)}
        onConfirm={confirm}
      >
        {review && (
          <div className="space-y-4 text-sm">
            <p>
              <strong>{review.item.parentDisplayName}</strong> · học sinh {review.item.studentGrade}
            </p>
            <p className="whitespace-pre-line break-words">{review.item.learningNeeds}</p>
            {review.item.teachingArea && <p>Khu vực chung: {review.item.teachingArea}</p>}
            {review.action === 'approve' &&
              (detail.isPending ? (
                <PageLoading label="Đang tải liên hệ để kiểm duyệt…" />
              ) : detail.isError ? (
                <Alert
                  tone="danger"
                  title="Không tải được liên hệ"
                  action={
                    <Button variant="secondary" onClick={() => void detail.refetch()}>
                      Thử lại
                    </Button>
                  }
                >
                  {detail.error.message}
                </Alert>
              ) : (
                <p>
                  Số điện thoại người học: {detail.data.parentContactPhone ?? 'Chưa cung cấp'}
                  <br />
                  Số điện thoại gia sư: {detail.data.tutorContactPhone ?? 'Chưa cung cấp'}
                </p>
              ))}
            {review.action === 'approve' && (
              <>
                <TextField
                  label="Học phí đã chốt (VNĐ/buổi)"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={100_000_000}
                  step={1}
                  required
                  value={tuition}
                  onChange={(event) => {
                    setTuition(event.target.value);
                    setLocalError('');
                  }}
                  error={errors.agreedTuitionPerSessionMinor}
                />
                <label className="flex min-h-11 items-start gap-3">
                  <input
                    type="checkbox"
                    checked={partiesAgreed}
                    onChange={(event) => {
                      setPartiesAgreed(event.target.checked);
                      setLocalError('');
                    }}
                    className="mt-0.5 size-4 shrink-0 accent-primary"
                  />
                  Tôi xác nhận người học và gia sư đã thống nhất mức học phí này.
                </label>
                {localError && <Alert tone="danger">{localError}</Alert>}
              </>
            )}
            {review.action !== 'approve' && (
              <TextareaField
                label={
                  review.action === 'complete'
                    ? 'Lý do hoàn tất'
                    : review.action === 'revoke'
                      ? 'Lý do thu hồi'
                      : 'Lý do từ chối'
                }
                required
                minLength={5}
                maxLength={500}
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
