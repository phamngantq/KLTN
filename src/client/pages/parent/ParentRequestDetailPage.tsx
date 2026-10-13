import { useState, type ReactNode } from 'react';
import {
  ArrowLeft,
  CalendarDays,
  CircleCheck,
  Clock3,
  MapPin,
  Pencil,
  Phone,
  ShieldCheck,
  UserRound,
  Wallet,
} from 'lucide-react';
import { Link, useParams } from 'react-router';
import { EDUCATION_LEVEL_LABELS, type OwnParentRequest } from '../../../shared/schemas/requests';
import { Button, ButtonLink } from '../../components/ui/Button';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { Alert, EmptyState } from '../../components/ui/Feedback';
import { PageLoading } from '../../components/ui/Spinner';
import {
  useConfirmTutor,
  useOwnParentRequest,
  useSubmitParentRequest,
} from '../../features/parent-requests/api';
import { requestDate, weekdayLabel } from '../../features/parent-requests/format';
import { isApiError } from '../../lib/api-client';
import { formatVnd } from '../../lib/format';
import { StageBadge, TutorFitMeter, TutorSummary } from './RequestStage';

/** Loads the owner's request with the shared not-found and error states. */
export function useRequestPage() {
  const { id } = useParams();
  const detail = useOwnParentRequest(id);
  let fallback: ReactNode = null;
  if (detail.isPending) fallback = <PageLoading label="Đang tải chi tiết yêu cầu…" />;
  else if (detail.isError) {
    fallback = isApiError(detail.error, 'REQUEST_NOT_FOUND') ? (
      <EmptyState
        title="Không tìm thấy yêu cầu"
        description="Yêu cầu này không tồn tại hoặc bạn không có quyền xem."
        action={<ButtonLink to="/parent">Về danh sách yêu cầu</ButtonLink>}
      />
    ) : (
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
  return { id, detail, fallback };
}

export function ParentRequestDetailPage() {
  const { id, detail, fallback } = useRequestPage();
  const submit = useSubmitParentRequest();
  if (fallback || !detail.data) return fallback;

  const request = detail.data;
  const canEdit = request.status === 'draft' || request.status === 'submitted';
  const tutor = request.tutor;

  function send() {
    if (!id || submit.isPending) return;
    submit.mutate({ id, version: request.version }, { onError: () => void detail.refetch() });
  }

  return (
    <section className="flex min-w-0 flex-col gap-6">
      <Link
        to={`/parent${request.stage === 'searching' || request.stage === 'other' ? '' : `?group=${request.stage}`}`}
        className="inline-flex min-h-11 items-center gap-2 self-start text-sm font-medium text-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
      >
        <ArrowLeft aria-hidden="true" className="size-4" />
        Về danh sách yêu cầu
      </Link>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-3xl font-bold text-primary">Yêu cầu {request.code}</h1>
            <StageBadge stage={request.stage} status={request.status} />
          </div>
          <p className="mt-1 text-sm text-muted">
            Chi tiết yêu cầu tìm gia sư của bạn · Gửi ngày {requestDate(request.createdAt)}
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

      {request.stage === 'searching' && (
        <Alert tone="success" title="Đã tiếp nhận yêu cầu">
          Yêu cầu tìm gia sư của bạn đã được tiếp nhận thành công. Trung tâm sẽ sớm liên hệ để hỗ
          trợ bạn.
        </Alert>
      )}
      {request.stage === 'found' && tutor && (
        <Alert tone="info" title="Trung tâm đã tìm được gia sư cho bạn">
          Xem hồ sơ gia sư được đề xuất bên dưới và xác nhận nếu bạn đồng ý thuê.
        </Alert>
      )}
      {request.stage === 'confirmed' && (
        <Alert tone="success" title="Đã xác nhận thuê gia sư">
          {request.status === 'fulfilled'
            ? 'Lớp học của yêu cầu này đã hoàn tất.'
            : tutor?.learnerConfirmedAt
              ? `Bạn đã xác nhận thuê gia sư ${tutor.displayName} ngày ${requestDate(tutor.learnerConfirmedAt)}.`
              : 'Bạn đã xác nhận thuê gia sư cho yêu cầu này.'}
        </Alert>
      )}
      {request.status === 'cancelled' && request.cancellationReason && (
        <Alert tone="warning" title="Yêu cầu đã hủy">
          Lý do: {request.cancellationReason}
        </Alert>
      )}

      <div
        className={`grid min-w-0 gap-6 ${tutor ? 'lg:grid-cols-[minmax(0,1fr)_minmax(0,0.85fr)]' : ''}`}
      >
        <RequestDetails request={request} />
        {tutor && (
          <ProposedTutorPanel request={request} onConfirmed={() => void detail.refetch()} />
        )}
      </div>

      {request.status === 'draft' && (
        <div className="flex max-w-2xl flex-col gap-4 rounded-xl border border-border bg-bg p-5 shadow-card sm:p-6">
          <h2 className="text-lg font-semibold text-primary">Gửi yêu cầu cho trung tâm</h2>
          <p className="text-sm text-muted">
            Cần họ và tên, số điện thoại và lịch mong muốn hợp lệ trước khi gửi.
          </p>
          {submit.isError && (
            <Alert tone="danger" title="Chưa gửi được yêu cầu">
              {submit.error.message}
            </Alert>
          )}
          <Button onClick={send} loading={submit.isPending} className="self-start rounded-xl">
            Gửi yêu cầu
          </Button>
        </div>
      )}
    </section>
  );
}

function Item({
  label,
  icon,
  wide = false,
  children,
}: {
  label: string;
  icon?: ReactNode;
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={wide ? 'sm:col-span-2' : undefined}>
      <dt className="flex items-center gap-1 text-xs text-muted">
        {icon}
        {label}
      </dt>
      <dd className="mt-1 min-w-0 break-words">{children}</dd>
    </div>
  );
}

/** Part A: every request fact, with private contact merged into the same block. */
function RequestDetails({ request }: { request: OwnParentRequest }) {
  return (
    <article
      aria-labelledby="request-details"
      className="min-w-0 self-start overflow-hidden rounded-xl border border-border bg-bg shadow-card"
    >
      <div className="border-b border-border px-5 py-4 sm:px-6">
        <h2 id="request-details" className="text-lg font-semibold text-primary">
          Chi tiết yêu cầu tìm gia sư
        </h2>
        <p className="mt-1 font-mono text-xs text-muted">{request.code}</p>
      </div>
      <dl className="grid gap-x-6 gap-y-5 p-5 text-sm sm:grid-cols-2 sm:p-6">
        <Item label="Học sinh" icon={<UserRound aria-hidden="true" className="size-3.5" />}>
          <span className="font-semibold text-primary">{request.studentName ?? 'Chưa nhập'}</span>
        </Item>
        <Item label="Môn – Lớp">
          <span className="font-semibold text-primary">
            {request.subjectName} · {request.grade}
          </span>
        </Item>
        <Item label="Cấp học · Số buổi/tuần">
          {request.educationLevel ? EDUCATION_LEVEL_LABELS[request.educationLevel] : '—'}
          {' · '}
          {request.sessionsPerWeek === null ? 'Chưa nêu' : `${request.sessionsPerWeek} buổi`}
        </Item>
        <Item label="Hình thức">{request.mode === 'online' ? 'Online' : 'Offline (Tại nhà)'}</Item>
        <Item label="Khu vực" icon={<MapPin aria-hidden="true" className="size-3.5" />}>
          {request.area ?? (request.mode === 'online' ? 'Học online' : 'Chưa nêu')}
        </Item>
        <Item
          label="Học phí dự kiến (VNĐ/buổi)"
          icon={<Wallet aria-hidden="true" className="size-3.5" />}
        >
          {request.expectedBudgetMinor === null
            ? 'Chưa xác định'
            : formatVnd(request.expectedBudgetMinor)}
        </Item>
        <Item
          label="Lịch học mong muốn"
          icon={<Clock3 aria-hidden="true" className="size-3.5" />}
          wide
        >
          {request.schedule.discussLater ? (
            'Trao đổi lịch sau'
          ) : (
            <ul className="mt-1 flex flex-wrap gap-2">
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
        </Item>
        <Item label="Yêu cầu đối với gia sư">
          <span className="whitespace-pre-line">{request.tutorRequirements || 'Chưa nêu'}</span>
        </Item>
        <Item label="Đặc điểm học sinh">
          <span className="whitespace-pre-line">{request.studentTraits || 'Chưa nêu'}</span>
        </Item>
        {request.description && (
          <Item label="Mô tả nhu cầu" wide>
            <span className="whitespace-pre-line">{request.description}</span>
          </Item>
        )}
        <Item
          label="Số điện thoại liên hệ"
          icon={<Phone aria-hidden="true" className="size-3.5" />}
        >
          <span className="font-medium">{request.contactPhone ?? 'Chưa cung cấp'}</span>
        </Item>
        <Item label="Địa chỉ cụ thể" icon={<MapPin aria-hidden="true" className="size-3.5" />}>
          {request.contactAddress ?? 'Chưa cung cấp'}
        </Item>
        <Item
          label="Chia sẻ liên hệ"
          icon={<ShieldCheck aria-hidden="true" className="size-3.5" />}
          wide
        >
          {request.contactConsentAt
            ? `Đã đồng ý chia sẻ với gia sư được trung tâm gán · ${requestDate(request.contactConsentAt)}`
            : 'Chưa đồng ý chia sẻ'}
        </Item>
        <Item label="Ngày gửi" icon={<CalendarDays aria-hidden="true" className="size-3.5" />}>
          {requestDate(request.createdAt)}
        </Item>
      </dl>
    </article>
  );
}

/** Part B: the proposed tutor, fit, and the learner's hire confirmation. */
function ProposedTutorPanel({
  request,
  onConfirmed,
}: {
  request: OwnParentRequest;
  onConfirmed: () => void;
}) {
  const tutor = request.tutor!;
  const canConfirm = request.stage === 'found' && tutor.learnerConfirmedAt === null;
  return (
    <aside
      aria-labelledby="proposed-tutor"
      className="flex min-w-0 flex-col gap-5 self-start rounded-xl border border-border bg-bg p-5 shadow-card sm:p-6"
    >
      <h2 id="proposed-tutor" className="text-lg font-semibold text-primary">
        {request.stage === 'confirmed' ? 'Gia sư đã xác nhận' : 'Gia sư được đề xuất'}
      </h2>
      <TutorSummary tutor={tutor} />
      {request.agreedTuitionPerSessionMinor !== null && (
        <p className="flex items-center gap-2 rounded-lg bg-info-surface px-3 py-2 text-sm">
          <Wallet aria-hidden="true" className="size-4 text-primary" />
          Học phí đã thống nhất:{' '}
          <strong className="text-primary">
            {formatVnd(request.agreedTuitionPerSessionMinor)}/buổi
          </strong>
        </p>
      )}
      <TutorFitMeter fit={tutor.fit} />
      <TutorActions request={request} canConfirm={canConfirm} onConfirmed={onConfirmed} />
    </aside>
  );
}

export function TutorActions({
  request,
  canConfirm,
  onConfirmed,
  showProfileLink = true,
}: {
  request: OwnParentRequest;
  canConfirm: boolean;
  onConfirmed: () => void;
  showProfileLink?: boolean;
}) {
  const tutor = request.tutor!;
  const confirm = useConfirmTutor();
  const [open, setOpen] = useState(false);
  return (
    <div className="flex flex-col gap-3">
      {confirm.isError && (
        <Alert tone="danger" title="Chưa xác nhận được">
          {confirm.error.message}
        </Alert>
      )}
      <div className="flex flex-wrap gap-3">
        {showProfileLink && (
          <ButtonLink
            to={`/parent/requests/${encodeURIComponent(request.id)}/gia-su`}
            variant="secondary"
          >
            <UserRound aria-hidden="true" className="size-4" />
            Xem hồ sơ gia sư
          </ButtonLink>
        )}
        {canConfirm ? (
          <Button onClick={() => setOpen(true)} className="gap-2">
            <CircleCheck aria-hidden="true" className="size-4" />
            Xác nhận thuê gia sư
          </Button>
        ) : (
          request.stage === 'confirmed' && (
            <span className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-success">
              <CircleCheck aria-hidden="true" className="size-4" />
              Đã xác nhận
            </span>
          )
        )}
      </div>
      <ConfirmDialog
        open={open}
        title="Xác nhận thuê gia sư"
        description={
          <>
            Bạn xác nhận thuê <strong>{tutor.displayName}</strong> cho yêu cầu {request.code} (
            {request.subjectName} · {request.grade})? Sau khi xác nhận, yêu cầu chuyển sang “Đã xác
            nhận” và không thể chọn lại.
          </>
        }
        confirmLabel="Xác nhận thuê"
        cancelLabel="Để sau"
        loading={confirm.isPending}
        onCancel={() => setOpen(false)}
        onConfirm={() =>
          confirm.mutate(
            { id: request.id, version: request.version, assignmentId: tutor.assignmentId },
            {
              onSuccess: () => {
                setOpen(false);
                onConfirmed();
              },
              onError: () => setOpen(false),
            },
          )
        }
      />
    </div>
  );
}
