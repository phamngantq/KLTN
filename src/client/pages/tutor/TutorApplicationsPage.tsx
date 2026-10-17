import {
  Building2,
  CalendarDays,
  ChevronDown,
  Circle,
  CircleCheck,
  ClipboardCheck,
  Clock3,
  CreditCard,
  FileText,
  MapPin,
  Phone,
  Search,
  Sparkles,
  UserRound,
  Wallet,
  X,
} from 'lucide-react';
import { useId, useState, type FormEvent, type KeyboardEvent, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router';
import type { TutorProposalItem } from '../../../shared/schemas/class-requests';
import type { ApplicationAcceptance, ApplicationStatus } from '../../../shared/schemas/classes';
import { isReadOnlyPreview } from '../../app/preview';
import { Button, ButtonLink } from '../../components/ui/Button';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { Alert, Badge, EmptyState } from '../../components/ui/Feedback';
import { SelectField, TextareaField, TextField } from '../../components/ui/Field';
import { PageLoading } from '../../components/ui/Spinner';
import {
  useCompletedClasses,
  useLearnerContact,
  useRegisteredClasses,
  useRespondToProposal,
  useStartPlacementFeePayment,
  useTutorProposals,
} from '../../features/class-requests/api';
import { useWithdrawApplication, type TutorClassApplication } from '../../features/classes/api';
import { useAcknowledgeContract } from '../../features/terms-contracts/api';
import { formatDate, formatVnd, WEEKDAY_LABELS } from '../../lib/format';
import { classSchedule } from './TutorClassPages';

type Tab = 'registered' | 'proposed' | 'completed';
const TABS: { key: Tab; label: string; slug: string | null; icon: typeof FileText }[] = [
  { key: 'registered', label: 'Lớp đã đăng ký', slug: null, icon: FileText },
  { key: 'proposed', label: 'Lớp được đề xuất', slug: 'de-xuat', icon: Sparkles },
  { key: 'completed', label: 'Lớp đã hoàn tất', slug: 'hoan-tat', icon: ClipboardCheck },
];

/** The three statuses a tutor filters by; withdrawn requests show only under "Tất cả". */
const FILTERS: { value: ApplicationStatus; label: string }[] = [
  { value: 'submitted', label: 'Chờ duyệt' },
  { value: 'selected', label: 'Đã duyệt' },
  { value: 'rejected', label: 'Bị từ chối' },
];

const STATUS: Record<
  ApplicationStatus,
  { label: string; tone: 'info' | 'success' | 'danger' | 'neutral' }
> = {
  submitted: { label: 'Chờ duyệt', tone: 'info' },
  selected: { label: 'Đã duyệt', tone: 'success' },
  rejected: { label: 'Bị từ chối', tone: 'danger' },
  withdrawn: { label: 'Đã hủy yêu cầu', tone: 'neutral' },
};

const CENTRE_ADDRESS = 'Số 41 Khuất Duy Tiến, Thanh Xuân, Hà Nội';
const CENTRE_PHONE = '0394 618 480';

function pageOf(value: string | null): number {
  const page = Number(value ?? '1');
  return Number.isSafeInteger(page) && page > 0 && page <= 1000 ? page : 1;
}

function statusOf(value: string | null): ApplicationStatus | undefined {
  return FILTERS.find((item) => item.value === value)?.value;
}

function Pager({
  label,
  page,
  pageSize,
  total,
  onPage,
}: {
  label: string;
  page: number;
  pageSize: number;
  total: number;
  onPage: (page: number) => void;
}) {
  if (total <= pageSize) return null;
  return (
    <nav aria-label={label} className="flex flex-wrap items-center gap-3">
      <Button variant="secondary" disabled={page <= 1} onClick={() => onPage(page - 1)}>
        Trang trước
      </Button>
      <span className="text-sm text-muted">
        Trang {page} / {Math.ceil(total / pageSize)}
      </span>
      <Button
        variant="secondary"
        disabled={page * pageSize >= total}
        onClick={() => onPage(page + 1)}
      >
        Trang sau
      </Button>
    </nav>
  );
}

function LoadError({ message, retry }: { message: string; retry: () => void }) {
  return (
    <Alert
      tone="danger"
      title="Không tải được dữ liệu"
      action={
        <Button variant="secondary" onClick={retry}>
          Thử lại
        </Button>
      }
    >
      {message}
    </Alert>
  );
}

function Fact({
  icon: Icon,
  label,
  children,
}: {
  icon: typeof MapPin;
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex items-start gap-2">
      <Icon aria-hidden="true" size={18} className="mt-0.5 shrink-0 text-warning" />
      <div>
        <dt className="sr-only">{label}</dt>
        <dd>{children}</dd>
      </div>
    </div>
  );
}

const cardClass =
  'flex h-full flex-col gap-4 rounded-xl border border-primary/20 border-l-4 border-l-accent bg-bg p-5 shadow-card';

/* ------------------------------------------------------------------ Lớp đã đăng ký */

function Step({ done, children }: { done: boolean; children: ReactNode }) {
  return (
    <li className="flex items-start gap-2">
      {done ? (
        <CircleCheck aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-success" />
      ) : (
        <Circle aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted" />
      )}
      <span className={done ? 'text-fg' : 'text-muted'}>
        {children}
        <span className="sr-only">{done ? ' (đã xong)' : ' (chưa xong)'}</span>
      </span>
    </li>
  );
}

/**
 * "Hoàn tất nhận lớp". A first-time tutor signs and pays at the centre; a returning tutor
 * confirms the contract and pays here. Contact and the letter appear only once completed.
 */
function AcceptancePanel({ acceptance }: { acceptance: ApplicationAcceptance }) {
  const acknowledge = useAcknowledgeContract();
  const payment = useStartPlacementFeePayment();
  const [agreed, setAgreed] = useState(false);
  const preview = isReadOnlyPreview();
  const fee =
    acceptance.placementFeeMinor === null
      ? 'theo thông báo của trung tâm'
      : formatVnd(acceptance.placementFeeMinor);
  const contractDone = acceptance.contract?.status === 'acknowledged';
  const paid = acceptance.placementFeePaidAt !== null;

  if (acceptance.completed)
    return (
      <Alert tone="success" title="Đã hoàn tất nhận lớp">
        Thông tin liên hệ người học và thư giới thiệu có trong tab{' '}
        <Link to="/tutor/class-requests?tab=hoan-tat" className="font-semibold underline">
          Lớp đã hoàn tất
        </Link>
        .
      </Alert>
    );
  if (!acceptance.assignmentActive)
    return (
      <Alert tone="warning" title="Lớp không còn hiệu lực">
        Lớp đã kết thúc hoặc trung tâm đã rút gán. Vui lòng liên hệ trung tâm nếu cần hỗ trợ.
      </Alert>
    );

  return (
    <section
      aria-label="Hoàn tất nhận lớp"
      className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-4 text-sm"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold text-primary">Hoàn tất nhận lớp</h3>
        <Badge tone="info">
          {acceptance.firstAcceptance ? 'Nhận lớp lần đầu' : 'Đã từng nhận lớp'}
        </Badge>
      </div>
      <ul className="flex flex-col gap-1.5">
        <Step done={acceptance.learnerConfirmed}>Người học xác nhận thuê gia sư</Step>
        <Step done={contractDone}>
          {acceptance.firstAcceptance
            ? 'Ký hợp đồng nhận lớp tại trung tâm'
            : 'Xác nhận hợp đồng nhận lớp trên hệ thống'}
        </Step>
        <Step done={paid}>
          {acceptance.firstAcceptance
            ? `Chuyển khoản phí môi giới (${fee}) — trung tâm ghi nhận`
            : `Thanh toán phí nhận lớp (${fee})`}
        </Step>
      </ul>

      {acceptance.firstAcceptance ? (
        <div className="flex gap-3 rounded-lg border border-accent bg-warning-surface p-4 leading-relaxed">
          <Building2 aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-warning" />
          <div>
            <p className="font-semibold text-primary">Hướng dẫn cho lần nhận lớp đầu tiên</p>
            <ol className="mt-2 flex list-decimal flex-col gap-1 pl-5">
              <li>
                Đến văn phòng trung tâm tại <strong>{CENTRE_ADDRESS}</strong>, mang theo CCCD và
                giấy tờ đã khai trong hồ sơ.
              </li>
              <li>Ký hợp đồng nhận lớp trực tiếp với trung tâm.</li>
              <li>
                Chuyển khoản phí môi giới <strong>{fee}</strong> theo hướng dẫn của nhân viên trung
                tâm.
              </li>
            </ol>
            <p className="mt-2">
              Trung tâm chỉ hoàn tất nhận lớp khi bạn đáp ứng đủ các điều kiện trên. Cần hỗ trợ, gọi{' '}
              <strong>{CENTRE_PHONE}</strong>.
            </p>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <p className="font-semibold text-primary">Bước 1. Xác nhận hợp đồng</p>
            {!acceptance.contract ? (
              <p className="text-muted">Trung tâm đang chuẩn bị hợp đồng cho lớp này.</p>
            ) : contractDone ? (
              <p className="text-success">Bạn đã xác nhận hợp đồng.</p>
            ) : (
              <>
                <Link to="/tutor/contracts" className="w-fit text-primary underline">
                  Xem nội dung hợp đồng
                </Link>
                <label className="flex min-h-11 items-start gap-3 rounded-lg border border-border bg-bg p-3">
                  <input
                    type="checkbox"
                    className="mt-0.5 size-4 accent-[var(--color-primary)]"
                    checked={agreed}
                    onChange={(event) => setAgreed(event.target.checked)}
                  />
                  Tôi đã đọc và đồng ý với hợp đồng nhận lớp của trung tâm
                </label>
                {acknowledge.isError && <Alert tone="danger">{acknowledge.error.message}</Alert>}
                <Button
                  className="self-start"
                  disabled={!agreed || preview || !acceptance.learnerConfirmed}
                  loading={acknowledge.isPending}
                  onClick={() =>
                    acceptance.contract &&
                    acknowledge.mutate({
                      id: acceptance.contract.id,
                      version: acceptance.contract.version,
                    })
                  }
                >
                  Xác nhận hợp đồng
                </Button>
                {!acceptance.learnerConfirmed && (
                  <p className="text-muted">Chờ người học xác nhận thuê trước khi ký hợp đồng.</p>
                )}
              </>
            )}
          </div>
          <div className="flex flex-col gap-2">
            <p className="font-semibold text-primary">Bước 2. Thanh toán phí nhận lớp</p>
            <p>
              Số tiền: <strong className="text-primary">{fee}</strong>
            </p>
            {!acceptance.onlinePaymentReady && (
              <p className="text-muted">
                Cổng thanh toán trực tuyến chưa được cấu hình. Vui lòng liên hệ trung tâm (
                {CENTRE_PHONE}) để thanh toán.
              </p>
            )}
            {payment.isError && <Alert tone="danger">{payment.error.message}</Alert>}
            <Button
              className="gap-2 self-start"
              disabled={
                !acceptance.onlinePaymentReady ||
                !contractDone ||
                !acceptance.learnerConfirmed ||
                paid ||
                preview
              }
              loading={payment.isPending}
              onClick={() =>
                payment.mutate(acceptance.assignmentId, {
                  onSuccess: ({ redirectUrl }) => window.location.assign(redirectUrl),
                })
              }
            >
              <CreditCard aria-hidden="true" className="size-4" />
              Thanh toán phí nhận lớp
            </Button>
          </div>
        </div>
      )}
      <p className="text-muted">
        Thông tin liên hệ chi tiết của người học và thư giới thiệu chỉ được cung cấp sau khi hoàn
        tất các điều kiện nhận lớp.
      </p>
    </section>
  );
}

function ClassDetails({ application }: { application: TutorClassApplication }) {
  const item = application.class;
  return (
    <dl className="grid gap-2 rounded-xl bg-surface p-4 text-sm sm:grid-cols-[10rem_1fr]">
      <dt className="font-medium text-muted">Mã lớp</dt>
      <dd>{item.code}</dd>
      <dt className="font-medium text-muted">Môn · Lớp</dt>
      <dd>
        {item.subjectName} · {item.grade}
      </dd>
      <dt className="font-medium text-muted">Hình thức</dt>
      <dd>{item.mode === 'online' ? 'Trực tuyến' : `Trực tiếp · ${item.publicArea ?? ''}`}</dd>
      <dt className="font-medium text-muted">Lịch học</dt>
      <dd>{classSchedule(item)}</dd>
      <dt className="font-medium text-muted">Học phí dự kiến</dt>
      <dd>
        {item.expectedBudgetMinor === null
          ? 'Thỏa thuận'
          : `${formatVnd(item.expectedBudgetMinor)}/buổi`}
      </dd>
      {application.availability && application.availability.windows.length > 0 && (
        <>
          <dt className="font-medium text-muted">Thời gian bạn rảnh</dt>
          <dd>
            {application.availability.windows
              .map(
                (window) =>
                  `${WEEKDAY_LABELS[window.weekday] ?? window.weekday} ${window.startLocal}–${window.endLocal}`,
              )
              .join('; ')}
          </dd>
        </>
      )}
      <dt className="font-medium text-muted">Ngày gửi yêu cầu</dt>
      <dd>{formatDate(application.createdAt, 'Asia/Ho_Chi_Minh')}</dd>
    </dl>
  );
}

function RegisteredCard({
  application,
  onCancel,
}: {
  application: TutorClassApplication;
  onCancel: () => void;
}) {
  const [open, setOpen] = useState<'detail' | 'complete' | null>(null);
  const status = STATUS[application.status];
  const preview = isReadOnlyPreview();
  const toggle = (panel: 'detail' | 'complete') => setOpen(open === panel ? null : panel);
  return (
    <article className={cardClass}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold text-muted">Lớp {application.class.code}</p>
          <h2 className="text-lg font-semibold text-primary">
            {application.class.subjectName} · {application.class.grade}
          </h2>
        </div>
        <Badge tone={status.tone}>{status.label}</Badge>
      </div>
      <dl className="grid gap-3 text-sm sm:grid-cols-2">
        <Fact icon={MapPin} label="Khu vực">
          {application.class.mode === 'online'
            ? 'Trực tuyến'
            : application.class.publicArea || 'Trực tiếp'}
        </Fact>
        <Fact icon={CalendarDays} label="Ngày gửi">
          Gửi ngày {formatDate(application.createdAt, 'Asia/Ho_Chi_Minh')}
        </Fact>
        <div className="sm:col-span-2">
          <Fact icon={Clock3} label="Lịch học">
            {classSchedule(application.class)}
          </Fact>
        </div>
        {application.class.expectedBudgetMinor !== null && (
          <div className="sm:col-span-2">
            <Fact icon={Wallet} label="Học phí dự kiến">
              Học phí dự kiến{' '}
              <strong className="text-primary">
                {formatVnd(application.class.expectedBudgetMinor)}/buổi
              </strong>
            </Fact>
          </div>
        )}
      </dl>
      {application.status === 'rejected' && (
        <div
          role="note"
          className="rounded-lg border border-danger/30 bg-danger-surface p-3 text-sm"
        >
          <p className="font-semibold text-danger">Lý do từ chối</p>
          <p className="mt-1">{application.rejectionReason ?? 'Trung tâm chưa ghi lý do.'}</p>
        </div>
      )}
      {open === 'detail' && <ClassDetails application={application} />}
      {open === 'complete' && application.acceptance && (
        <AcceptancePanel acceptance={application.acceptance} />
      )}
      {open === 'complete' && !application.acceptance && (
        <Alert tone="info">Trung tâm đang hoàn thiện thông tin lớp. Vui lòng quay lại sau.</Alert>
      )}
      <div className="mt-auto flex flex-wrap items-center gap-3 border-t border-border pt-4">
        <Button
          variant="secondary"
          aria-expanded={open === 'detail'}
          onClick={() => toggle('detail')}
          className="gap-2"
        >
          <ChevronDown
            aria-hidden="true"
            className={`size-4 transition-transform ${open === 'detail' ? 'rotate-180' : ''}`}
          />
          {open === 'detail' ? 'Ẩn chi tiết lớp' : 'Xem chi tiết lớp'}
        </Button>
        {application.status === 'submitted' && !preview && (
          <Button variant="secondary" onClick={onCancel} className="gap-2 text-danger">
            <X aria-hidden="true" className="size-4" />
            Hủy yêu cầu
          </Button>
        )}
        {application.status === 'selected' && (
          <Button
            aria-expanded={open === 'complete'}
            onClick={() => toggle('complete')}
            className="gap-2"
          >
            <ClipboardCheck aria-hidden="true" className="size-4" />
            {application.acceptance?.completed ? 'Đã hoàn tất' : 'Hoàn tất nhận lớp'}
          </Button>
        )}
      </div>
    </article>
  );
}

function RegisteredTab() {
  const [params, setParams] = useSearchParams();
  const page = pageOf(params.get('page'));
  const q = params.get('q')?.trim() || undefined;
  const status = statusOf(params.get('status'));
  const [draft, setDraft] = useState(q ?? '');
  const list = useRegisteredClasses({ page, q, status });
  const withdraw = useWithdrawApplication();
  const [cancelling, setCancelling] = useState<TutorClassApplication | null>(null);

  function update(next: { q?: string | undefined; status?: string | undefined; page?: number }) {
    const search = new URLSearchParams(params);
    for (const [key, value] of Object.entries(next)) {
      if (value === undefined || value === '' || (key === 'page' && value === 1))
        search.delete(key);
      else search.set(key, String(value));
    }
    if (!('page' in next)) search.delete('page');
    setParams(search, { preventScrollReset: true });
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    update({ q: draft.trim() || undefined });
  }

  function confirmCancel() {
    if (!cancelling || withdraw.isPending || isReadOnlyPreview()) return;
    withdraw.mutate(
      { id: cancelling.id, version: cancelling.version },
      { onSuccess: () => setCancelling(null), onError: () => void list.refetch() },
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <form
        role="search"
        aria-label="Tìm lớp đã đăng ký"
        onSubmit={submit}
        className="grid gap-3 rounded-xl border border-border bg-bg p-4 shadow-card sm:grid-cols-[1fr_14rem_auto] sm:items-end"
      >
        <TextField
          label="Từ khóa"
          placeholder="Mã lớp, môn học, lớp, khu vực…"
          value={draft}
          maxLength={100}
          onChange={(event) => setDraft(event.target.value)}
        />
        <SelectField
          label="Trạng thái"
          value={status ?? ''}
          onChange={(event) => update({ status: event.target.value || undefined, q })}
        >
          <option value="">Tất cả</option>
          {FILTERS.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </SelectField>
        <Button type="submit" className="gap-2">
          <Search aria-hidden="true" className="size-4" />
          Tìm kiếm
        </Button>
      </form>
      {list.isPending ? (
        <PageLoading label="Đang tải lớp đã đăng ký…" />
      ) : list.isError ? (
        <LoadError message={list.error.message} retry={() => void list.refetch()} />
      ) : list.data.items.length === 0 ? (
        q || status ? (
          <EmptyState
            title="Không có lớp phù hợp"
            description="Thử từ khóa khác hoặc chọn trạng thái “Tất cả”."
          />
        ) : (
          <EmptyState
            title="Bạn chưa gửi yêu cầu nhận lớp nào"
            description="Xem danh sách lớp mới và gửi yêu cầu nhận lớp phù hợp với bạn."
            action={<ButtonLink to="/tutor/new-classes">Xem lớp mới</ButtonLink>}
          />
        )
      ) : (
        <>
          <p className="text-sm text-muted" role="status">
            Tìm thấy{' '}
            <strong className="text-primary">{list.data.total.toLocaleString('vi-VN')}</strong> yêu
            cầu nhận lớp
          </p>
          <ul className="grid gap-4 lg:grid-cols-2">
            {list.data.items.map((application) => (
              <li key={application.id} className="min-w-0">
                <RegisteredCard
                  application={application}
                  onCancel={() => {
                    withdraw.reset();
                    setCancelling(application);
                  }}
                />
              </li>
            ))}
          </ul>
          <Pager
            label="Trang lớp đã đăng ký"
            page={list.data.page}
            pageSize={list.data.pageSize}
            total={list.data.total}
            onPage={(next) => update({ page: next, q, status })}
          />
        </>
      )}
      <ConfirmDialog
        open={cancelling !== null}
        title="Hủy yêu cầu nhận lớp?"
        description={
          cancelling
            ? `Yêu cầu nhận lớp ${cancelling.class.code} sẽ bị hủy. Bạn có thể gửi lại nếu lớp vẫn đang tuyển.`
            : ''
        }
        confirmLabel="Hủy yêu cầu"
        tone="danger"
        loading={withdraw.isPending}
        onConfirm={confirmCancel}
        onCancel={() => setCancelling(null)}
      >
        {withdraw.isError && <Alert tone="danger">{withdraw.error.message}</Alert>}
      </ConfirmDialog>
    </div>
  );
}

/* ------------------------------------------------------------------ Lớp được đề xuất */

function proposalSchedule(item: TutorProposalItem): string {
  const head = item.sessionsPerWeek ? `${item.sessionsPerWeek} buổi/tuần` : null;
  const times = item.schedule
    .map(
      (window) =>
        `${WEEKDAY_LABELS[window.weekday] ?? window.weekday} ${window.startLocal}–${window.endLocal}`,
    )
    .join('; ');
  return [head, times || 'trao đổi lịch sau'].filter(Boolean).join(' · ');
}

function proposalState(item: TutorProposalItem): {
  label: string;
  tone: 'info' | 'success' | 'danger' | 'neutral' | 'warning';
} {
  if (item.tutorResponse === 'declined') return { label: 'Bạn đã từ chối', tone: 'danger' };
  if (item.status === 'selected') return { label: 'Người học đã chọn bạn', tone: 'success' };
  if (item.status === 'declined')
    return { label: 'Người học đã chọn gia sư khác', tone: 'neutral' };
  if (item.tutorResponse === 'accepted') return { label: 'Đã xác nhận nhận lớp', tone: 'success' };
  return { label: 'Chờ bạn phản hồi', tone: 'warning' };
}

function ProposedTab() {
  const [page, setPage] = useState(1);
  const list = useTutorProposals(page);
  const respond = useRespondToProposal();
  const [dialog, setDialog] = useState<{ item: TutorProposalItem; accept: boolean } | null>(null);
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState('');
  const preview = isReadOnlyPreview();

  function confirm() {
    if (!dialog || preview || respond.isPending) return;
    if (!dialog.accept && !reason.trim()) {
      setReasonError('Vui lòng nhập lý do từ chối.');
      return;
    }
    respond.mutate(
      dialog.accept
        ? { id: dialog.item.id, accept: true }
        : { id: dialog.item.id, accept: false, reason: reason.trim() },
      { onSuccess: () => setDialog(null) },
    );
  }

  if (list.isPending) return <PageLoading label="Đang tải lớp được đề xuất…" />;
  if (list.isError)
    return <LoadError message={list.error.message} retry={() => void list.refetch()} />;
  return (
    <div className="flex flex-col gap-5">
      <p className="text-sm text-muted">
        Các lớp trung tâm đề xuất cho bạn dựa trên hồ sơ. Lớp được đề xuất không cần chờ duyệt — hãy
        xác nhận nhận lớp hoặc từ chối kèm lý do.
      </p>
      {list.data.items.length === 0 ? (
        <EmptyState
          title="Chưa có lớp được đề xuất"
          description="Cập nhật hồ sơ gia sư đầy đủ để trung tâm đề xuất lớp phù hợp cho bạn."
          action={<ButtonLink to="/tutor/profile">Cập nhật hồ sơ</ButtonLink>}
        />
      ) : (
        <ul className="grid gap-4 lg:grid-cols-2">
          {list.data.items.map((item) => {
            const state = proposalState(item);
            const open = item.status === 'proposed' && item.tutorResponse === null;
            return (
              <li key={item.id} className="min-w-0">
                <article className={cardClass}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold text-muted">Yêu cầu {item.requestCode}</p>
                      <h2 className="text-lg font-semibold text-primary">
                        {item.subjectName} · {item.grade}
                      </h2>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Badge tone="info">Phù hợp {item.fitScore}%</Badge>
                      <Badge tone={state.tone}>{state.label}</Badge>
                    </div>
                  </div>
                  <dl className="grid gap-3 text-sm">
                    <Fact icon={MapPin} label="Khu vực">
                      {item.mode === 'online' ? 'Trực tuyến' : `Trực tiếp · ${item.area ?? ''}`}
                    </Fact>
                    <Fact icon={Clock3} label="Lịch học">
                      {proposalSchedule(item)}
                    </Fact>
                    <Fact icon={Wallet} label="Học phí dự kiến">
                      Học phí dự kiến{' '}
                      <strong className="text-primary">
                        {item.expectedBudgetMinor === null
                          ? 'thỏa thuận'
                          : `${formatVnd(item.expectedBudgetMinor)}/buổi`}
                      </strong>
                    </Fact>
                    <Fact icon={CalendarDays} label="Ngày đề xuất">
                      Đề xuất ngày {formatDate(item.createdAt, 'Asia/Ho_Chi_Minh')}
                    </Fact>
                  </dl>
                  {item.tutorResponse === 'declined' && item.tutorDeclineReason && (
                    <p className="rounded-lg bg-surface p-3 text-sm">
                      <span className="font-semibold">Lý do từ chối: </span>
                      {item.tutorDeclineReason}
                    </p>
                  )}
                  {item.tutorResponse === 'accepted' && item.status === 'proposed' && (
                    <p className="rounded-lg bg-info-surface p-3 text-sm text-primary">
                      Trung tâm đã nhận xác nhận của bạn và sẽ thông báo khi người học chọn gia sư.
                    </p>
                  )}
                  {open && !preview && (
                    <div className="mt-auto flex flex-wrap gap-3 border-t border-border pt-4">
                      <Button
                        className="gap-2"
                        onClick={() => {
                          respond.reset();
                          setDialog({ item, accept: true });
                        }}
                      >
                        <ClipboardCheck aria-hidden="true" className="size-4" />
                        Xác nhận nhận lớp
                      </Button>
                      <Button
                        variant="secondary"
                        className="gap-2 text-danger"
                        onClick={() => {
                          respond.reset();
                          setReason('');
                          setReasonError('');
                          setDialog({ item, accept: false });
                        }}
                      >
                        <X aria-hidden="true" className="size-4" />
                        Từ chối
                      </Button>
                    </div>
                  )}
                </article>
              </li>
            );
          })}
        </ul>
      )}
      <Pager
        label="Trang lớp được đề xuất"
        page={list.data.page}
        pageSize={list.data.pageSize}
        total={list.data.total}
        onPage={setPage}
      />
      <ConfirmDialog
        open={dialog !== null}
        title={dialog?.accept ? 'Xác nhận nhận lớp?' : 'Từ chối lớp được đề xuất?'}
        description={
          dialog?.accept
            ? `Bạn xác nhận nhận lớp ${dialog.item.subjectName} · ${dialog.item.grade}. Trung tâm sẽ liên hệ để hoàn tất thủ tục.`
            : 'Lớp sẽ không còn được đề xuất cho người học. Hãy cho trung tâm biết lý do.'
        }
        confirmLabel={dialog?.accept ? 'Xác nhận nhận lớp' : 'Từ chối'}
        tone={dialog?.accept ? 'primary' : 'danger'}
        loading={respond.isPending}
        onConfirm={confirm}
        onCancel={() => setDialog(null)}
      >
        {dialog && !dialog.accept && (
          <TextareaField
            label="Lý do từ chối"
            required
            maxLength={500}
            value={reason}
            error={reasonError || undefined}
            onChange={(event) => {
              setReason(event.target.value);
              setReasonError('');
            }}
          />
        )}
        {respond.isError && <Alert tone="danger">{respond.error.message}</Alert>}
      </ConfirmDialog>
    </div>
  );
}

/* ------------------------------------------------------------------ Lớp đã hoàn tất */

function ContactPanel({ assignmentId, onClose }: { assignmentId: string; onClose: () => void }) {
  const contact = useLearnerContact(assignmentId);
  return (
    <section
      aria-label="Liên hệ người học"
      className="rounded-xl border border-border bg-surface p-4"
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 font-semibold text-primary">
          <UserRound aria-hidden="true" className="size-4" />
          Liên hệ người học
        </h3>
        <Button variant="secondary" onClick={onClose}>
          Đóng
        </Button>
      </div>
      {contact.isPending ? (
        <PageLoading label="Đang kiểm tra quyền xem liên hệ…" />
      ) : contact.isError ? (
        <Alert tone="danger">{contact.error.message}</Alert>
      ) : (
        <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-[8rem_1fr]">
          <dt className="font-medium text-muted">Người học</dt>
          <dd>{contact.data.parentDisplayName}</dd>
          <dt className="flex items-center gap-2 font-medium text-muted">
            <Phone aria-hidden="true" className="size-4" />
            Điện thoại
          </dt>
          <dd>
            <a className="text-primary underline" href={`tel:${contact.data.phone}`}>
              {contact.data.phone}
            </a>
          </dd>
          <dt className="flex items-center gap-2 font-medium text-muted">
            <MapPin aria-hidden="true" className="size-4" />
            Địa chỉ
          </dt>
          <dd>{contact.data.address ?? 'Người học chưa cung cấp'}</dd>
        </dl>
      )}
    </section>
  );
}

function CompletedTab() {
  const [page, setPage] = useState(1);
  const list = useCompletedClasses(page);
  const [contactFor, setContactFor] = useState<string | null>(null);

  if (list.isPending) return <PageLoading label="Đang tải lớp đã hoàn tất…" />;
  if (list.isError)
    return <LoadError message={list.error.message} retry={() => void list.refetch()} />;
  if (list.data.items.length === 0)
    return (
      <EmptyState
        title="Chưa có lớp hoàn tất nhận lớp"
        description="Khi bạn hoàn tất các điều kiện nhận lớp, thông tin liên hệ người học và thư giới thiệu sẽ hiển thị tại đây."
      />
    );
  return (
    <div className="flex flex-col gap-5">
      <ul className="grid gap-4">
        {list.data.items.map((item) => (
          <li key={item.assignmentId} className="min-w-0">
            <article className={cardClass}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold text-muted">Lớp {item.classCode}</p>
                  <h2 className="text-lg font-semibold text-primary">
                    {item.subjectName} · {item.grade}
                  </h2>
                </div>
                <Badge tone="success">Đã hoàn tất nhận lớp</Badge>
              </div>
              <dl className="grid gap-3 text-sm sm:grid-cols-3">
                <Fact icon={MapPin} label="Khu vực">
                  {item.mode === 'online' ? 'Trực tuyến' : `Trực tiếp · ${item.publicArea ?? ''}`}
                </Fact>
                <Fact icon={Wallet} label="Học phí đã chốt">
                  {item.agreedTuitionPerSessionMinor === null
                    ? 'Học phí: chưa ghi nhận'
                    : `${formatVnd(item.agreedTuitionPerSessionMinor)}/buổi`}
                </Fact>
                <Fact icon={CalendarDays} label="Ngày hoàn tất">
                  Hoàn tất ngày {formatDate(item.completedAt, 'Asia/Ho_Chi_Minh')}
                </Fact>
              </dl>
              {contactFor === item.assignmentId && (
                <ContactPanel
                  assignmentId={item.assignmentId}
                  onClose={() => setContactFor(null)}
                />
              )}
              <div className="mt-auto flex flex-wrap gap-3 border-t border-border pt-4">
                <Button
                  variant="secondary"
                  className="gap-2"
                  aria-expanded={contactFor === item.assignmentId}
                  onClick={() =>
                    setContactFor(contactFor === item.assignmentId ? null : item.assignmentId)
                  }
                >
                  <Phone aria-hidden="true" className="size-4" />
                  Xem liên hệ người học
                </Button>
                <ButtonLink
                  to={`/tutor/class-requests/${encodeURIComponent(item.assignmentId)}/thu-gioi-thieu`}
                  className="gap-2"
                >
                  <FileText aria-hidden="true" className="size-4" />
                  Thư giới thiệu
                </ButtonLink>
              </div>
            </article>
          </li>
        ))}
      </ul>
      <Pager
        label="Trang lớp đã hoàn tất"
        page={list.data.page}
        pageSize={list.data.pageSize}
        total={list.data.total}
        onPage={setPage}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ Page */

/** "Yêu cầu nhận lớp": registered classes, centre proposals and completed acceptances. */
export function TutorApplicationsPage() {
  const [params, setParams] = useSearchParams();
  const tab =
    TABS.find((item) => item.slug && item.slug === params.get('tab'))?.key ?? 'registered';
  const baseId = useId();

  function select(next: Tab) {
    const slug = TABS.find((item) => item.key === next)?.slug;
    setParams(slug ? { tab: slug } : {}, { replace: true, preventScrollReset: true });
  }

  function onKey(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
    event.preventDefault();
    const index = TABS.findIndex((item) => item.key === tab);
    const next = TABS[(index + (event.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length]!;
    select(next.key);
    document.getElementById(`${baseId}-${next.key}-tab`)?.focus();
  }

  return (
    <section className="flex min-w-0 flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-primary">Yêu cầu nhận lớp</h1>
          <p className="mt-2 text-muted">
            Theo dõi các lớp bạn đã đăng ký, lớp trung tâm đề xuất và lớp đã hoàn tất nhận lớp.
          </p>
        </div>
        <ButtonLink to="/tutor/new-classes" variant="accent">
          <Search aria-hidden="true" size={18} />
          Tìm lớp mới
        </ButtonLink>
      </header>
      <div
        role="tablist"
        aria-label="Yêu cầu nhận lớp"
        className="flex flex-wrap gap-2 border-b border-border"
      >
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            id={`${baseId}-${key}-tab`}
            type="button"
            role="tab"
            aria-selected={tab === key}
            aria-controls={`${baseId}-${key}-panel`}
            tabIndex={tab === key ? 0 : -1}
            onClick={() => select(key)}
            onKeyDown={onKey}
            className={`-mb-px inline-flex min-h-11 items-center gap-2 border-b-2 px-4 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus ${
              tab === key
                ? 'border-primary text-primary'
                : 'border-transparent text-muted hover:text-primary'
            }`}
          >
            <Icon aria-hidden="true" className="size-4" />
            {label}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`${baseId}-${tab}-panel`} aria-labelledby={`${baseId}-${tab}-tab`}>
        {tab === 'registered' ? (
          <RegisteredTab />
        ) : tab === 'proposed' ? (
          <ProposedTab />
        ) : (
          <CompletedTab />
        )}
      </div>
    </section>
  );
}
