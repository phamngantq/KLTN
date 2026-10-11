import { useState } from 'react';
import { Link, useParams } from 'react-router';
import type { ParentTutorOfferJoin } from '../../../shared/schemas/tutor-offer-joins';
import { isReadOnlyPreview } from '../../app/preview';
import { Button, ButtonLink } from '../../components/ui/Button';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { Alert, Badge, EmptyState, PageHeader } from '../../components/ui/Feedback';
import { PageLoading } from '../../components/ui/Spinner';
import {
  useParentTutorOfferJoin,
  useParentTutorOfferJoinActions,
  useParentTutorOfferJoinContact,
} from '../../features/tutor-offer-joins/api';
import { formatVnd } from '../../lib/format';

const STATUS_LABELS: Record<ParentTutorOfferJoin['status'], string> = {
  submitted: 'Chờ kiểm duyệt',
  withdrawn: 'Đã rút',
  approved: 'Đã duyệt',
  rejected: 'Đã từ chối',
  completed: 'Đã hoàn tất',
  revoked: 'Đã thu hồi',
};

function JoinDetail({ join }: { join: ParentTutorOfferJoin }) {
  const [showContact, setShowContact] = useState(false);
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const { withdraw } = useParentTutorOfferJoinActions();
  const contact = useParentTutorOfferJoinContact(
    join.id,
    showContact && join.status === 'approved',
  );
  return (
    <section className="flex min-w-0 flex-col gap-6">
      <Link
        to="/parent/tutor-offer-joins"
        className="min-h-11 self-start py-2 text-sm font-medium text-primary underline"
      >
        Về yêu cầu đã gửi
      </Link>
      <PageHeader
        title={`${join.subjectName} · ${join.offerGrade}`}
        description="Yêu cầu tham gia lớp tìm học viên của bạn."
      />
      <article className="rounded-xl border border-border bg-bg p-5 shadow-card sm:p-6">
        <div className="flex flex-wrap justify-between gap-3">
          <h2 className="text-lg font-semibold text-primary">Thông tin yêu cầu</h2>
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
        <dl className="mt-5 grid gap-5 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted">Lớp học sinh</dt>
            <dd>{join.studentGrade}</dd>
          </div>
          <div>
            <dt className="text-muted">Hình thức</dt>
            <dd>{join.offerMode === 'online' ? 'Trực tuyến' : 'Trực tiếp'}</dd>
          </div>
          {join.teachingArea && (
            <div>
              <dt className="text-muted">Khu vực chung</dt>
              <dd className="break-words">{join.teachingArea}</dd>
            </div>
          )}
          <div>
            <dt className="text-muted">Học phí gia sư đề xuất</dt>
            <dd>{formatVnd(join.proposedTuitionPerSessionMinor)}/buổi</dd>
          </div>
          {join.agreedTuitionPerSessionMinor !== null && (
            <div>
              <dt className="text-muted">Học phí đã chốt</dt>
              <dd className="font-semibold text-primary">
                {formatVnd(join.agreedTuitionPerSessionMinor)}/buổi
              </dd>
            </div>
          )}
          <div className="sm:col-span-2">
            <dt className="text-muted">Nhu cầu học tập</dt>
            <dd className="mt-1 whitespace-pre-line break-words">{join.learningNeeds}</dd>
          </div>
        </dl>
        {join.offerStatus === 'published' && (
          <ButtonLink
            to={`/parent/lop-tim-hoc-vien/${encodeURIComponent(join.offerId)}`}
            variant="secondary"
            className="mt-5"
          >
            Xem lớp tìm học viên
          </ButtonLink>
        )}
      </article>
      {join.status === 'approved' && (
        <section className="rounded-xl border border-border bg-bg p-5 shadow-card sm:p-6">
          <h2 className="text-lg font-semibold text-primary">Liên hệ gia sư</h2>
          <p className="mt-2 text-sm text-muted">
            Số điện thoại chỉ dành cho yêu cầu đã được kiểm duyệt viên duyệt.
          </p>
          {!showContact ? (
            <Button variant="secondary" className="mt-4" onClick={() => setShowContact(true)}>
              Xem số điện thoại gia sư
            </Button>
          ) : contact.isPending ? (
            <PageLoading label="Đang tải liên hệ gia sư…" />
          ) : contact.isError ? (
            <Alert
              tone="danger"
              title="Không xem được liên hệ"
              action={
                <Button variant="secondary" onClick={() => void contact.refetch()}>
                  Thử lại
                </Button>
              }
            >
              {contact.error.message}
            </Alert>
          ) : (
            <p className="mt-4 text-base font-semibold">
              <a href={`tel:${contact.data.phone}`} className="text-primary underline">
                {contact.data.phone}
              </a>
            </p>
          )}
        </section>
      )}
      {join.status === 'submitted' && (
        <div>
          <Button
            variant="secondary"
            disabled={isReadOnlyPreview()}
            onClick={() => setWithdrawOpen(true)}
          >
            Rút yêu cầu
          </Button>
          {withdraw.isError && (
            <Alert tone="danger" title="Chưa rút được yêu cầu">
              {withdraw.error.message}
            </Alert>
          )}
        </div>
      )}
      {join.rejectionReason && (
        <Alert tone="warning" title="Lý do từ chối">
          {join.rejectionReason}
        </Alert>
      )}
      {join.terminalReason && (
        <Alert tone="info" title={STATUS_LABELS[join.status]}>
          {join.terminalReason}
        </Alert>
      )}
      <ConfirmDialog
        open={withdrawOpen}
        title="Rút yêu cầu tham gia lớp?"
        description="Yêu cầu sẽ chuyển sang trạng thái đã rút."
        confirmLabel="Rút yêu cầu"
        tone="danger"
        loading={withdraw.isPending}
        onCancel={() => setWithdrawOpen(false)}
        onConfirm={() =>
          withdraw.mutate(
            { id: join.id, version: join.version },
            { onSuccess: () => setWithdrawOpen(false) },
          )
        }
      />
    </section>
  );
}

export function ParentTutorOfferJoinDetailPage() {
  const { id } = useParams();
  const join = useParentTutorOfferJoin(id);
  if (join.isPending) return <PageLoading label="Đang tải yêu cầu tham gia lớp…" />;
  if (join.isError)
    return (
      <Alert
        tone="danger"
        title="Không tải được yêu cầu"
        action={
          <Button variant="secondary" onClick={() => void join.refetch()}>
            Thử lại
          </Button>
        }
      >
        {join.error.message}
      </Alert>
    );
  if (!join.data) return <EmptyState title="Không tìm thấy yêu cầu" />;
  return <JoinDetail join={join.data} />;
}
