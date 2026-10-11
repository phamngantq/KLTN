import { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import {
  TUTOR_OFFER_CONTACT_CONSENT_TEXT,
  type TutorOffer,
} from '../../../shared/schemas/tutor-offers';
import type { TutorOfferJoinForTutor } from '../../../shared/schemas/tutor-offer-joins';
import { isReadOnlyPreview } from '../../app/preview';
import { Button, ButtonLink } from '../../components/ui/Button';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { Alert, Badge, EmptyState, PageHeader } from '../../components/ui/Feedback';
import { PageLoading } from '../../components/ui/Spinner';
import {
  useTutorOfferJoinContact,
  useTutorOfferJoinRequests,
} from '../../features/tutor-offer-joins/api';
import {
  useTutorOffer,
  useTutorOfferActions,
  useTutorOfferContract,
  useTutorOffers,
} from '../../features/tutor-offers/api';
import { formatVnd } from '../../lib/format';

const STATUS_LABELS: Record<TutorOffer['status'], string> = {
  draft: 'Bản nháp',
  pending: 'Chờ kiểm duyệt hợp đồng',
  published: 'Đang tìm học viên',
  rejected: 'Cần chỉnh sửa',
  closed: 'Đã đóng',
};

const STATUS_TONES: Record<TutorOffer['status'], 'neutral' | 'info' | 'success' | 'warning'> = {
  draft: 'neutral',
  pending: 'info',
  published: 'success',
  rejected: 'warning',
  closed: 'neutral',
};

function pageFromUrl(params: URLSearchParams): number {
  const value = Number(params.get('page') ?? '1');
  return Number.isSafeInteger(value) && value >= 1 && value <= 1000 ? value : 1;
}

export function TutorOffersPage() {
  const [params, setParams] = useSearchParams();
  const page = pageFromUrl(params);
  const offers = useTutorOffers(page);

  function changePage(next: number) {
    const search = new URLSearchParams();
    if (next > 1) search.set('page', String(next));
    setParams(search);
    document.getElementById('main')?.focus();
  }

  return (
    <section className="flex min-w-0 flex-col gap-6">
      <PageHeader
        title="Lớp tìm học viên của tôi"
        description="Theo dõi bản nháp, hợp đồng đã xác nhận và kết quả kiểm duyệt."
        actions={<ButtonLink to="/tutor/offers/new">Đăng lớp tìm học viên</ButtonLink>}
      />
      {offers.isPending ? (
        <PageLoading label="Đang tải lớp đã đăng…" />
      ) : offers.isError ? (
        <Alert
          tone="danger"
          title="Không tải được lớp đã đăng"
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
          title="Chưa đăng lớp nào"
          description="Tạo lớp để xem hợp đồng và gửi kiểm duyệt."
          action={<ButtonLink to="/tutor/offers/new">Tạo lớp đầu tiên</ButtonLink>}
        />
      ) : (
        <>
          <p role="status" className="text-sm text-muted">
            Có {offers.data.total.toLocaleString('vi-VN')} lớp của bạn.
          </p>
          <ul className="grid gap-4 md:grid-cols-2">
            {offers.data.items.map((offer) => (
              <li
                key={offer.id}
                className="min-w-0 rounded-xl border border-border bg-bg p-5 shadow-card"
              >
                <article className="flex h-full flex-col gap-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <h2 className="break-words text-lg font-semibold text-primary">
                      {offer.subjectName} · {offer.grade}
                    </h2>
                    <Badge tone={STATUS_TONES[offer.status]}>{STATUS_LABELS[offer.status]}</Badge>
                  </div>
                  <p className="text-sm text-muted">
                    {offer.mode === 'online' ? 'Trực tuyến' : `Trực tiếp · ${offer.area ?? ''}`} ·{' '}
                    {formatVnd(offer.proposedTuitionPerSessionMinor)}/buổi
                  </p>
                  {offer.status === 'rejected' && offer.rejectionReason && (
                    <p className="rounded-md bg-warning-surface p-3 text-sm">
                      Lý do: {offer.rejectionReason}
                    </p>
                  )}
                  <div className="mt-auto flex flex-wrap gap-3 border-t border-border pt-4">
                    <ButtonLink
                      to={`/tutor/offers/${encodeURIComponent(offer.id)}`}
                      variant="secondary"
                    >
                      Xem lớp và hợp đồng
                    </ButtonLink>
                    {(offer.status === 'draft' || offer.status === 'rejected') && (
                      <ButtonLink
                        to={`/tutor/offers/${encodeURIComponent(offer.id)}/edit`}
                        variant="secondary"
                      >
                        Chỉnh sửa
                      </ButtonLink>
                    )}
                    {offer.status === 'published' && (
                      <Link
                        className="inline-flex min-h-11 items-center text-sm font-medium text-primary underline"
                        to={`/lop-tim-hoc-vien/${encodeURIComponent(offer.id)}`}
                      >
                        Xem trang công khai
                      </Link>
                    )}
                  </div>
                </article>
              </li>
            ))}
          </ul>
          {offers.data.total > offers.data.pageSize && (
            <nav aria-label="Trang lớp đã đăng" className="flex items-center justify-center gap-3">
              <Button variant="secondary" disabled={page <= 1} onClick={() => changePage(page - 1)}>
                Trang trước
              </Button>
              <span className="text-sm text-muted">
                Trang {page} / {Math.ceil(offers.data.total / offers.data.pageSize)}
              </span>
              <Button
                variant="secondary"
                disabled={page * offers.data.pageSize >= offers.data.total}
                onClick={() => changePage(page + 1)}
              >
                Trang sau
              </Button>
            </nav>
          )}
        </>
      )}
    </section>
  );
}

const JOIN_STATUS_LABELS: Record<TutorOfferJoinForTutor['status'], string> = {
  submitted: 'Đã gửi',
  withdrawn: 'Đã rút',
  approved: 'Đã duyệt',
  rejected: 'Đã từ chối',
  completed: 'Đã hoàn tất',
  revoked: 'Đã thu hồi',
};

function TutorJoinRequestCard({
  offerId,
  join,
}: {
  offerId: string;
  join: TutorOfferJoinForTutor;
}) {
  const [showContact, setShowContact] = useState(false);
  const contact = useTutorOfferJoinContact(
    offerId,
    join.id,
    showContact && join.status === 'approved',
  );
  return (
    <li className="rounded-lg border border-border bg-surface p-4 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-medium text-primary">Học sinh {join.studentGrade}</p>
        <Badge
          tone={
            join.status === 'approved'
              ? 'success'
              : join.status === 'submitted'
                ? 'info'
                : 'neutral'
          }
        >
          {JOIN_STATUS_LABELS[join.status]}
        </Badge>
      </div>
      <p className="mt-2 whitespace-pre-line break-words">{join.learningNeeds}</p>
      {join.teachingArea && <p className="mt-2 text-muted">Khu vực chung: {join.teachingArea}</p>}
      {join.agreedTuitionPerSessionMinor !== null && (
        <p className="mt-2 font-semibold text-primary">
          Học phí đã chốt: {formatVnd(join.agreedTuitionPerSessionMinor)}/buổi
        </p>
      )}
      <p className="mt-2 text-xs text-muted">
        Gửi ngày{' '}
        {new Date(join.createdAt).toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}
      </p>
      {join.status === 'approved' && (
        <div className="mt-3 border-t border-border pt-3">
          {!showContact ? (
            <Button variant="secondary" onClick={() => setShowContact(true)}>
              Xem số điện thoại phụ huynh
            </Button>
          ) : contact.isPending ? (
            <PageLoading label="Đang tải liên hệ phụ huynh…" />
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
            <a href={`tel:${contact.data.phone}`} className="font-semibold text-primary underline">
              {contact.data.phone}
            </a>
          )}
        </div>
      )}
    </li>
  );
}

function OfferDetail({ offer }: { offer: TutorOffer }) {
  const canSubmit = offer.status === 'draft' || offer.status === 'rejected';
  const canClose = offer.status === 'pending' || offer.status === 'published';
  const contract = useTutorOfferContract(canSubmit);
  const joinRequests = useTutorOfferJoinRequests(
    offer.id,
    offer.status === 'published' || offer.status === 'closed',
  );
  const { submit, close } = useTutorOfferActions();
  const [acknowledged, setAcknowledged] = useState(false);
  const [shareContact, setShareContact] = useState(false);
  const [closeOpen, setCloseOpen] = useState(false);
  const [notice, setNotice] = useState('');
  const preview = isReadOnlyPreview();

  function confirmContract() {
    if (
      !acknowledged ||
      !shareContact ||
      !contract.data ||
      !canSubmit ||
      preview ||
      submit.isPending
    )
      return;
    submit.mutate(
      { id: offer.id, version: offer.version, contractRevisionId: contract.data.id },
      {
        onSuccess: () => {
          setAcknowledged(false);
          setShareContact(false);
          setNotice('Đã gửi lớp và hợp đồng để kiểm duyệt.');
        },
        onError: () => void contract.refetch(),
      },
    );
  }

  return (
    <section className="flex min-w-0 flex-col gap-6">
      <Link
        to="/tutor/offers"
        className="min-h-11 self-start py-2 text-sm font-medium text-primary underline"
      >
        Về lớp đã đăng
      </Link>
      <PageHeader
        title={`${offer.subjectName} · ${offer.grade}`}
        description="Lớp tìm học viên do bạn đăng."
        actions={
          offer.status === 'draft' || offer.status === 'rejected' ? (
            <ButtonLink
              to={`/tutor/offers/${encodeURIComponent(offer.id)}/edit`}
              variant="secondary"
            >
              Chỉnh sửa
            </ButtonLink>
          ) : undefined
        }
      />
      {notice && <Alert tone="success">{notice}</Alert>}
      {preview && <Alert tone="info">Bản xem trước chỉ đọc.</Alert>}
      {offer.status === 'rejected' && offer.rejectionReason && (
        <Alert tone="warning" title="Cần chỉnh sửa">
          {offer.rejectionReason}
        </Alert>
      )}
      <article className="rounded-xl border border-border bg-bg p-5 shadow-card sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-primary">Thông tin lớp</h2>
          <Badge tone={STATUS_TONES[offer.status]}>{STATUS_LABELS[offer.status]}</Badge>
        </div>
        <dl className="mt-5 grid gap-5 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted">Môn học</dt>
            <dd className="mt-1 font-medium">{offer.subjectName}</dd>
          </div>
          <div>
            <dt className="text-muted">Lớp học</dt>
            <dd className="mt-1 font-medium">{offer.grade}</dd>
          </div>
          <div>
            <dt className="text-muted">Hình thức</dt>
            <dd className="mt-1">{offer.mode === 'online' ? 'Trực tuyến' : 'Trực tiếp'}</dd>
          </div>
          {offer.mode === 'offline' && (
            <div>
              <dt className="text-muted">Khu vực chung</dt>
              <dd className="mt-1 break-words">{offer.area}</dd>
            </div>
          )}
          <div>
            <dt className="text-muted">Học phí đề xuất</dt>
            <dd className="mt-1 font-semibold text-primary">
              {formatVnd(offer.proposedTuitionPerSessionMinor)}/buổi
            </dd>
          </div>
          <div>
            <dt className="text-muted">Số điện thoại riêng của bạn</dt>
            <dd className="mt-1">{offer.contactPhone ?? 'Chưa cung cấp'}</dd>
          </div>
        </dl>
        {offer.status === 'published' && (
          <div className="mt-6">
            <ButtonLink
              to={`/lop-tim-hoc-vien/${encodeURIComponent(offer.id)}`}
              variant="secondary"
            >
              Xem lớp công khai
            </ButtonLink>
          </div>
        )}
      </article>
      {canSubmit ? (
        <section
          className="rounded-xl border border-border bg-bg p-5 shadow-card sm:p-6"
          aria-labelledby="offer-contract-title"
        >
          <h2 id="offer-contract-title" className="text-lg font-semibold text-primary">
            Xác nhận hợp đồng trước khi gửi duyệt
          </h2>
          {contract.isPending ? (
            <PageLoading label="Đang tải hợp đồng…" />
          ) : contract.isError ? (
            <Alert tone="warning" title="Chưa thể gửi duyệt">
              Không có hợp đồng hiện hành để xác nhận. {contract.error.message}
            </Alert>
          ) : (
            <div className="mt-4 space-y-4">
              <p className="font-medium text-primary">
                {contract.data.title} · phiên bản {contract.data.revision}
              </p>
              <div
                className="max-h-80 overflow-auto whitespace-pre-line break-words rounded-lg border border-border bg-surface p-4 text-sm"
                tabIndex={0}
              >
                {contract.data.bodyText}
              </div>
              <label className="flex min-h-11 items-start gap-3 rounded-lg border border-border p-3 text-sm">
                <input
                  type="checkbox"
                  checked={acknowledged}
                  onChange={(event) => setAcknowledged(event.target.checked)}
                  className="mt-0.5 size-4 shrink-0 accent-primary"
                />
                Tôi đã đọc và đồng ý hợp đồng phiên bản {contract.data.revision} cho lớp này.
              </label>
              <label className="flex min-h-11 items-start gap-3 rounded-lg border border-border p-3 text-sm">
                <input
                  type="checkbox"
                  checked={shareContact}
                  onChange={(event) => setShareContact(event.target.checked)}
                  className="mt-0.5 size-4 shrink-0 accent-primary"
                />
                {TUTOR_OFFER_CONTACT_CONSENT_TEXT}
              </label>
              {submit.isError && (
                <Alert tone="danger" title="Chưa gửi được lớp">
                  {submit.error.message}
                </Alert>
              )}
              <Button
                onClick={confirmContract}
                loading={submit.isPending}
                disabled={!acknowledged || !shareContact || preview}
              >
                Xác nhận hợp đồng và gửi duyệt
              </Button>
            </div>
          )}
        </section>
      ) : (
        offer.contractBodyText && (
          <section
            className="rounded-xl border border-border bg-bg p-5 shadow-card sm:p-6"
            aria-labelledby="offer-contract-snapshot"
          >
            <h2 id="offer-contract-snapshot" className="text-lg font-semibold text-primary">
              Hợp đồng đã xác nhận
            </h2>
            <p className="mt-2 text-sm text-muted">
              {offer.contractTitle} · phiên bản {offer.contractRevision}
            </p>
            <div
              className="mt-4 max-h-80 overflow-auto whitespace-pre-line break-words rounded-lg border border-border bg-surface p-4 text-sm"
              tabIndex={0}
            >
              {offer.contractBodyText}
            </div>
          </section>
        )
      )}
      {(offer.status === 'published' || offer.status === 'closed') && (
        <section
          className="rounded-xl border border-border bg-bg p-5 shadow-card sm:p-6"
          aria-labelledby="offer-join-requests-title"
        >
          <h2 id="offer-join-requests-title" className="text-lg font-semibold text-primary">
            Yêu cầu tham gia lớp
          </h2>
          <p className="mt-1 text-sm text-muted">
            Thông tin học tập do phụ huynh chia sẻ. Số điện thoại chỉ xem được sau khi kiểm duyệt
            viên duyệt yêu cầu và xác nhận học phí.
          </p>
          {joinRequests.isPending ? (
            <PageLoading label="Đang tải yêu cầu tham gia lớp…" />
          ) : joinRequests.isError ? (
            <Alert
              tone="danger"
              action={
                <Button variant="secondary" onClick={() => void joinRequests.refetch()}>
                  Thử lại
                </Button>
              }
            >
              {joinRequests.error.message}
            </Alert>
          ) : joinRequests.data.total === 0 ? (
            <EmptyState title="Chưa có yêu cầu tham gia" />
          ) : (
            <>
              <p className="mt-4 text-sm font-medium text-primary" role="status">
                {joinRequests.data.total.toLocaleString('vi-VN')} yêu cầu
              </p>
              <ul className="mt-4 space-y-3">
                {joinRequests.data.items.map((join) => (
                  <TutorJoinRequestCard key={join.id} offerId={offer.id} join={join} />
                ))}
              </ul>
              {joinRequests.data.total > joinRequests.data.items.length && (
                <p className="mt-3 text-sm text-muted">
                  Hiển thị {joinRequests.data.items.length} yêu cầu gần nhất.
                </p>
              )}
            </>
          )}
        </section>
      )}
      {canClose && (
        <div className="border-t border-border pt-5">
          <Button variant="secondary" disabled={preview} onClick={() => setCloseOpen(true)}>
            Đóng lớp tìm học viên
          </Button>
          {close.isError && (
            <Alert tone="danger" title="Chưa đóng được lớp">
              {close.error.message}
            </Alert>
          )}
        </div>
      )}
      <ConfirmDialog
        open={closeOpen}
        title="Đóng lớp tìm học viên?"
        description="Lớp sẽ không còn xuất hiện trong danh sách công khai. Hợp đồng và lịch sử kiểm duyệt vẫn được giữ."
        confirmLabel="Đóng lớp"
        tone="danger"
        loading={close.isPending}
        onCancel={() => setCloseOpen(false)}
        onConfirm={() =>
          close.mutate(
            { id: offer.id, version: offer.version },
            { onSuccess: () => setCloseOpen(false) },
          )
        }
      />
    </section>
  );
}

export function TutorOfferDetailPage() {
  const { id } = useParams();
  const offer = useTutorOffer(id);
  if (offer.isPending) return <PageLoading label="Đang tải lớp đã đăng…" />;
  if (offer.isError)
    return (
      <Alert
        tone="danger"
        title="Không tải được lớp"
        action={
          <ButtonLink to="/tutor/offers" variant="secondary">
            Về danh sách
          </ButtonLink>
        }
      >
        {offer.error.message}
      </Alert>
    );
  return <OfferDetail key={offer.data.id} offer={offer.data} />;
}
