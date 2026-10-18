import {
  BookOpen,
  CalendarDays,
  ClipboardCheck,
  Clock3,
  Eye,
  FileText,
  GraduationCap,
  MapPin,
  Phone,
  Repeat,
  Search,
  Sparkles,
  UserRound,
  Wallet,
  X,
} from 'lucide-react';
import { useId, useState, type FormEvent, type KeyboardEvent, type ReactNode } from 'react';
import { useSearchParams } from 'react-router';
import type { ProposalFilter, TutorProposalItem } from '../../../shared/schemas/class-requests';
import type { ApplicationStatus } from '../../../shared/schemas/classes';
import { EDUCATION_LEVEL_LABELS } from '../../../shared/schemas/requests';
import { isReadOnlyPreview } from '../../app/preview';
import { Button, ButtonLink } from '../../components/ui/Button';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { Alert, Badge, EmptyState } from '../../components/ui/Feedback';
import { SelectField, TextField } from '../../components/ui/Field';
import { PageLoading } from '../../components/ui/Spinner';
import {
  useCompletedClasses,
  useLearnerContact,
  useRegisteredClasses,
  useTutorProposals,
} from '../../features/class-requests/api';
import { useWithdrawApplication, type TutorClassApplication } from '../../features/classes/api';
import { formatDate, formatTime, formatVnd } from '../../lib/format';
import {
  canComplete,
  completionPath,
  DeclineProposalDialog,
  isPending,
  proposalNote,
  proposalSchedule,
  proposalStatus,
} from './ProposalParts';
import { classSchedule, requirementList, sessionsOf } from './TutorClassPages';

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

export const PENDING_MESSAGE =
  'Yêu cầu nhận lớp của bạn đã được gửi thành công. Vui lòng chờ trung tâm xem xét và phản hồi.';

/** "Thứ Năm, 15/10/2026 lúc 08:00" in the centre's time zone. */
export function sentAt(iso: string): string {
  return `${formatDate(iso, 'Asia/Ho_Chi_Minh')} lúc ${formatTime(iso, 'Asia/Ho_Chi_Minh')}`;
}

function RegisteredCard({
  application,
  onCancel,
}: {
  application: TutorClassApplication;
  onCancel: () => void;
}) {
  const status = STATUS[application.status];
  const preview = isReadOnlyPreview();
  const item = application.class;
  const pending = application.status === 'submitted';
  const sessions = sessionsOf(item);
  const requirements = item.tutorRequirements ? requirementList(item.tutorRequirements) : [];
  return (
    <article className={cardClass}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold text-muted">Lớp {item.code}</p>
          <h2 className="text-lg font-semibold text-primary">
            {item.subjectName} · {item.grade}
          </h2>
        </div>
        <Badge tone={status.tone}>{status.label}</Badge>
      </div>
      {pending && (
        <p role="status" className="rounded-lg bg-info-surface p-3 text-sm text-primary">
          {PENDING_MESSAGE}
        </p>
      )}
      <dl className="grid gap-3 text-sm sm:grid-cols-2">
        {pending && (
          <>
            <Fact icon={BookOpen} label="Môn học">
              Môn học: <strong>{item.subjectName}</strong>
            </Fact>
            <Fact icon={GraduationCap} label="Cấp học">
              Cấp học:{' '}
              <strong>
                {item.educationLevel ? EDUCATION_LEVEL_LABELS[item.educationLevel] : item.grade}
              </strong>
            </Fact>
          </>
        )}
        <Fact icon={MapPin} label="Khu vực">
          {item.mode === 'online' ? 'Trực tuyến' : item.publicArea || 'Trực tiếp'}
        </Fact>
        <Fact icon={CalendarDays} label="Thời gian gửi yêu cầu">
          Gửi{' '}
          {pending
            ? sentAt(application.createdAt)
            : `ngày ${formatDate(application.createdAt, 'Asia/Ho_Chi_Minh')}`}
        </Fact>
        <div className="sm:col-span-2">
          <Fact icon={Clock3} label="Lịch học">
            {classSchedule(item)}
          </Fact>
        </div>
        {item.expectedBudgetMinor !== null && (
          <Fact icon={Wallet} label="Học phí dự kiến">
            Học phí{' '}
            <strong className="text-primary">{formatVnd(item.expectedBudgetMinor)}/buổi</strong>
          </Fact>
        )}
        {pending && sessions && (
          <Fact icon={Repeat} label="Số buổi mỗi tuần">
            <strong>{sessions} buổi/tuần</strong>
          </Fact>
        )}
      </dl>
      {pending && item.studentTraits && (
        <div className="rounded-lg bg-surface p-3 text-sm">
          <p className="font-semibold text-primary">Đặc điểm học sinh</p>
          <p className="mt-1 whitespace-pre-line">{item.studentTraits}</p>
        </div>
      )}
      {pending && requirements.length > 0 && (
        <div className="rounded-lg bg-surface p-3 text-sm">
          <p className="font-semibold text-primary">Yêu cầu gia sư</p>
          <ul className="mt-1 flex list-disc flex-col gap-0.5 pl-5">
            {requirements.map((requirement) => (
              <li key={requirement}>{requirement}</li>
            ))}
          </ul>
        </div>
      )}
      <div className="mt-auto flex flex-wrap items-center gap-3 border-t border-border pt-4">
        <ButtonLink
          to={`/tutor/class-requests/chi-tiet/${encodeURIComponent(application.id)}`}
          variant="secondary"
          className="gap-2"
        >
          <Eye aria-hidden="true" className="size-4" />
          Xem chi tiết
        </ButtonLink>
        {pending && !preview && (
          <Button variant="secondary" onClick={onCancel} className="gap-2 text-danger">
            <X aria-hidden="true" className="size-4" />
            Hủy nhận lớp
          </Button>
        )}
        {application.status === 'selected' && (
          <ButtonLink
            to={`/tutor/class-requests/hoan-tat/${encodeURIComponent(application.id)}`}
            className="gap-2"
          >
            <ClipboardCheck aria-hidden="true" className="size-4" />
            Hoàn tất nhận lớp
          </ButtonLink>
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
  const list = useRegisteredClasses({ page, q, status, stage: 'registered' });
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
        title="Hủy nhận lớp?"
        description={
          cancelling
            ? `Yêu cầu nhận lớp ${cancelling.class.code} sẽ bị hủy. Bạn có thể gửi lại nếu lớp vẫn đang tuyển.`
            : ''
        }
        confirmLabel="Hủy nhận lớp"
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

const PROPOSAL_FILTER_OPTIONS: { value: ProposalFilter; label: string }[] = [
  { value: 'pending', label: 'Chờ phản hồi' },
  { value: 'accepted', label: 'Đã xác nhận' },
  { value: 'declined', label: 'Đã từ chối' },
];

function ProposedTab() {
  const [params, setParams] = useSearchParams();
  const page = pageOf(params.get('page'));
  const q = params.get('q')?.trim() || undefined;
  const status = PROPOSAL_FILTER_OPTIONS.find((item) => item.value === params.get('status'))?.value;
  const [draft, setDraft] = useState(q ?? '');
  const list = useTutorProposals({ page, q, status });
  const [declining, setDeclining] = useState<TutorProposalItem | null>(null);
  const preview = isReadOnlyPreview();

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
    update({ q: draft.trim() || undefined, status });
  }

  return (
    <div className="flex flex-col gap-5">
      <p className="text-sm text-muted">
        Các lớp phù hợp trung tâm đề xuất cho bạn dựa trên hồ sơ. Lớp được đề xuất không cần chờ
        duyệt — hãy xác nhận nhận lớp hoặc từ chối kèm lý do.
      </p>
      <form
        role="search"
        aria-label="Tìm lớp được đề xuất"
        onSubmit={submit}
        className="grid gap-3 rounded-xl border border-border bg-bg p-4 shadow-card sm:grid-cols-[1fr_14rem_auto] sm:items-end"
      >
        <TextField
          label="Từ khóa"
          placeholder="Mã yêu cầu, môn học, lớp, khu vực…"
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
          {PROPOSAL_FILTER_OPTIONS.map((item) => (
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
        <PageLoading label="Đang tải lớp được đề xuất…" />
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
            title="Chưa có lớp được đề xuất"
            description="Cập nhật hồ sơ gia sư đầy đủ để trung tâm đề xuất lớp phù hợp cho bạn."
            action={<ButtonLink to="/tutor/profile">Cập nhật hồ sơ</ButtonLink>}
          />
        )
      ) : (
        <>
          <p className="text-sm text-muted" role="status">
            Tìm thấy{' '}
            <strong className="text-primary">{list.data.total.toLocaleString('vi-VN')}</strong> lớp
            được đề xuất
          </p>
          <ul className="grid gap-4 lg:grid-cols-2">
            {list.data.items.map((item) => {
              const state = proposalStatus(item);
              const note = proposalNote(item);
              const detail = `/tutor/class-requests/de-xuat/${encodeURIComponent(item.id)}`;
              return (
                <li key={item.id} className="min-w-0">
                  <article className={cardClass}>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-xs font-semibold text-muted">
                          Yêu cầu {item.requestCode}
                        </p>
                        <h2 className="text-lg font-semibold text-primary">
                          {item.subjectName} · {item.grade}
                        </h2>
                      </div>
                      <div className="flex flex-wrap gap-2">
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
                    {note && (
                      <p className="rounded-lg bg-info-surface p-3 text-sm text-primary">{note}</p>
                    )}
                    <div className="mt-auto flex flex-wrap gap-3 border-t border-border pt-4">
                      <ButtonLink to={detail} variant="secondary" className="gap-2">
                        <Eye aria-hidden="true" className="size-4" />
                        Xem chi tiết
                      </ButtonLink>
                      {canComplete(item) && (
                        <ButtonLink to={completionPath(item)} className="gap-2">
                          <ClipboardCheck aria-hidden="true" className="size-4" />
                          Hoàn tất nhận lớp
                        </ButtonLink>
                      )}
                      {isPending(item) && !preview && (
                        <>
                          <ButtonLink to={`${detail}?xac-nhan=1`} className="gap-2">
                            <ClipboardCheck aria-hidden="true" className="size-4" />
                            Xác nhận nhận lớp
                          </ButtonLink>
                          <Button
                            variant="secondary"
                            className="gap-2 text-danger"
                            onClick={() => setDeclining(item)}
                          >
                            <X aria-hidden="true" className="size-4" />
                            Từ chối nhận lớp
                          </Button>
                        </>
                      )}
                    </div>
                  </article>
                </li>
              );
            })}
          </ul>
          <Pager
            label="Trang lớp được đề xuất"
            page={list.data.page}
            pageSize={list.data.pageSize}
            total={list.data.total}
            onPage={(next) => update({ page: next, q, status })}
          />
        </>
      )}
      <DeclineProposalDialog
        key={declining?.id ?? 'none'}
        item={declining}
        onClose={() => setDeclining(null)}
      />
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
                <ButtonLink
                  to={`/tutor/class-requests/da-hoan-tat/${encodeURIComponent(item.assignmentId)}`}
                  className="gap-2"
                >
                  <Eye aria-hidden="true" className="size-4" />
                  Xem chi tiết
                </ButtonLink>
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
