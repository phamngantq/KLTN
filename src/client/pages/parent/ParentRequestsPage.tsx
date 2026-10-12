import { useState, type FormEvent, type ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  CircleCheck,
  Eye,
  Filter,
  Phone,
  Plus,
  RefreshCw,
  Search,
  UserCheck,
} from 'lucide-react';
import { Link, useSearchParams } from 'react-router';
import {
  EDUCATION_LEVEL_LABELS,
  REQUEST_STATUS_GROUP_KEYS,
  REQUEST_STATUS_GROUPS,
  REQUEST_STATUSES,
  type ParentRequestListItem,
  type RequestStatus,
  type RequestStatusGroup,
} from '../../../shared/schemas/requests';
import type { ParentDashboard } from '../../../shared/schemas/reports';
import { Button, ButtonLink } from '../../components/ui/Button';
import { Alert, Badge, EmptyState } from '../../components/ui/Feedback';
import { SelectField, TextField } from '../../components/ui/Field';
import { PageLoading } from '../../components/ui/Spinner';
import {
  useParentRequestCounts,
  useParentRequests,
  type ParentRequestFilters,
} from '../../features/parent-requests/api';
import { REQUEST_STATUS_LABELS, requestDate } from '../../features/parent-requests/format';
import { useSubjects } from '../../features/tutor-profile/api';
import { formatVnd } from '../../lib/format';

const statusTone: Record<RequestStatus, 'neutral' | 'info' | 'success' | 'warning'> = {
  draft: 'neutral',
  submitted: 'info',
  sourcing: 'warning',
  assigned: 'success',
  fulfilled: 'success',
  cancelled: 'neutral',
};

const GROUP_LABELS: Record<RequestStatusGroup, string> = {
  searching: 'Đang tìm gia sư',
  found: 'Đã tìm được gia sư',
  confirmed: 'Đã xác nhận',
  other: 'Nháp & đã hủy',
};

const PAGE_SIZES = [10, 20, 40] as const;
const SHORT_DAYS = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'] as const;

const COUNT_FIELDS: Record<RequestStatus, keyof ParentDashboard> = {
  draft: 'draftRequests',
  submitted: 'submittedRequests',
  sourcing: 'sourcingRequests',
  assigned: 'assignedRequests',
  fulfilled: 'fulfilledRequests',
  cancelled: 'cancelledRequests',
};

function groupCount(counts: ParentDashboard | undefined, group: RequestStatusGroup) {
  if (!counts) return null;
  return REQUEST_STATUS_GROUPS[group].reduce(
    (sum, status) => sum + counts[COUNT_FIELDS[status]],
    0,
  );
}

function groupOf(status: RequestStatus): RequestStatusGroup {
  return REQUEST_STATUS_GROUP_KEYS.find((group) =>
    (REQUEST_STATUS_GROUPS[group] as readonly RequestStatus[]).includes(status),
  )!;
}

function scheduleSummary(request: ParentRequestListItem): string {
  if (request.schedule.discussLater) return 'Trao đổi sau';
  const days = [...new Set(request.schedule.windows.map((window) => window.weekday))]
    .sort((a, b) => a - b)
    .map((weekday) => SHORT_DAYS[weekday - 1]);
  return `${days.join(', ')} (${request.schedule.windows.length} khung/tuần)`;
}

const isLocalDate = (value: string | null): value is string =>
  !!value && /^\d{4}-\d{2}-\d{2}$/.test(value);

type Draft = {
  q: string;
  subjectId: string;
  mode: '' | 'online' | 'offline';
  from: string;
  to: string;
};

export function ParentRequestsPage() {
  const [params, setParams] = useSearchParams();
  const subjects = useSubjects();
  const counts = useParentRequestCounts();

  const statusParam = params.get('status');
  const status = REQUEST_STATUSES.includes(statusParam as RequestStatus)
    ? (statusParam as RequestStatus)
    : undefined;
  const groupParam = params.get('group');
  const group: RequestStatusGroup = REQUEST_STATUS_GROUP_KEYS.includes(
    groupParam as RequestStatusGroup,
  )
    ? (groupParam as RequestStatusGroup)
    : status
      ? groupOf(status)
      : 'searching';
  const modeParam = params.get('mode');
  const rawPage = Number(params.get('page') ?? 1);
  const page = Number.isSafeInteger(rawPage) && rawPage >= 1 && rawPage <= 1000 ? rawPage : 1;
  const rawSize = Number(params.get('pageSize') ?? PAGE_SIZES[0]);
  const pageSize = PAGE_SIZES.includes(rawSize as (typeof PAGE_SIZES)[number])
    ? rawSize
    : PAGE_SIZES[0];
  const applied: Draft = {
    q: params.get('q')?.slice(0, 100) ?? '',
    subjectId: params.get('subjectId') ?? '',
    mode: modeParam === 'online' || modeParam === 'offline' ? modeParam : '',
    from: isLocalDate(params.get('from')) ? params.get('from')! : '',
    to: isLocalDate(params.get('to')) ? params.get('to')! : '',
  };
  const filters: ParentRequestFilters = {
    ...(status ? { status } : { group }),
    q: applied.q || undefined,
    subjectId: applied.subjectId || undefined,
    mode: applied.mode || undefined,
    from: applied.from || undefined,
    to: applied.to || undefined,
    page,
    pageSize,
  };
  const requests = useParentRequests(filters);
  const [draft, setDraft] = useState<Draft>(applied);

  function navigate(
    next: Partial<Draft & { group: RequestStatusGroup; page: number; pageSize: number }>,
  ) {
    const merged = { ...applied, group, page: 1, pageSize, ...next };
    const search = new URLSearchParams();
    if (merged.group !== 'searching') search.set('group', merged.group);
    for (const key of ['q', 'subjectId', 'mode', 'from', 'to'] as const) {
      if (merged[key]) search.set(key, merged[key]);
    }
    if (merged.page > 1) search.set('page', String(merged.page));
    if (merged.pageSize !== PAGE_SIZES[0]) search.set('pageSize', String(merged.pageSize));
    setParams(search);
  }

  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    navigate({ ...draft, q: draft.q.trim() });
  }

  function resetFilters() {
    const empty: Draft = { q: '', subjectId: '', mode: '', from: '', to: '' };
    setDraft(empty);
    navigate(empty);
    void counts.refetch();
    void requests.refetch();
  }

  const total = counts.data
    ? Object.values(COUNT_FIELDS).reduce((sum, field) => sum + counts.data[field], 0)
    : null;
  const tabs = REQUEST_STATUS_GROUP_KEYS.filter(
    (key) => key !== 'other' || group === 'other' || (groupCount(counts.data, 'other') ?? 0) > 0,
  );
  const lastPage = requests.data
    ? Math.max(1, Math.ceil(requests.data.total / requests.data.pageSize))
    : 1;
  const firstRow = requests.data?.items.length ? (page - 1) * pageSize + 1 : 0;
  const lastRow = requests.data ? (page - 1) * pageSize + requests.data.items.length : 0;

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

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard label="Tổng yêu cầu" value={total} />
        <SummaryCard
          label={GROUP_LABELS.searching}
          value={groupCount(counts.data, 'searching')}
          icon={Search}
          tone="warning"
          active={group === 'searching'}
          onSelect={() => navigate({ group: 'searching' })}
        />
        <SummaryCard
          label={GROUP_LABELS.found}
          value={groupCount(counts.data, 'found')}
          icon={UserCheck}
          tone="info"
          active={group === 'found'}
          onSelect={() => navigate({ group: 'found' })}
        />
        <SummaryCard
          label={GROUP_LABELS.confirmed}
          value={groupCount(counts.data, 'confirmed')}
          icon={CircleCheck}
          tone="success"
          active={group === 'confirmed'}
          onSelect={() => navigate({ group: 'confirmed' })}
        />
      </div>

      <form
        onSubmit={applyFilters}
        className="grid gap-3 rounded-xl border border-border bg-bg p-4 shadow-card md:grid-cols-2 xl:grid-cols-[minmax(0,2fr)_repeat(4,minmax(0,1fr))_auto] xl:items-end"
      >
        <TextField
          label="Từ khóa"
          type="search"
          placeholder="Mã, tên, môn, khu vực…"
          maxLength={100}
          value={draft.q}
          onChange={(event) => setDraft({ ...draft, q: event.target.value })}
        />
        <SelectField
          label="Môn học"
          value={draft.subjectId}
          onChange={(event) => setDraft({ ...draft, subjectId: event.target.value })}
        >
          <option value="">Tất cả môn</option>
          {subjects.data?.map((subject) => (
            <option key={subject.id} value={subject.id}>
              {subject.name}
            </option>
          ))}
        </SelectField>
        <SelectField
          label="Hình thức"
          value={draft.mode}
          onChange={(event) => setDraft({ ...draft, mode: event.target.value as Draft['mode'] })}
        >
          <option value="">Tất cả</option>
          <option value="offline">Offline</option>
          <option value="online">Online</option>
        </SelectField>
        <TextField
          label="Từ ngày"
          type="date"
          value={draft.from}
          max={draft.to || undefined}
          onChange={(event) => setDraft({ ...draft, from: event.target.value })}
        />
        <TextField
          label="Đến ngày"
          type="date"
          value={draft.to}
          min={draft.from || undefined}
          onChange={(event) => setDraft({ ...draft, to: event.target.value })}
        />
        <div className="flex gap-2">
          <Button type="submit" className="gap-2">
            <Filter aria-hidden="true" className="size-4" />
            Lọc
          </Button>
          <Button type="button" variant="secondary" className="gap-2" onClick={resetFilters}>
            <RefreshCw aria-hidden="true" className="size-4" />
            Làm mới
          </Button>
        </div>
      </form>

      <div className="min-w-0 overflow-hidden rounded-xl border border-border bg-bg shadow-card">
        <div
          role="tablist"
          aria-label="Trạng thái yêu cầu"
          className="flex overflow-x-auto border-b border-border"
        >
          {tabs.map((key) => {
            const selected = group === key && !status;
            const value = groupCount(counts.data, key);
            return (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => navigate({ group: key })}
                className={`inline-flex min-h-12 shrink-0 items-center gap-2 border-b-2 px-5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus ${
                  selected
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted hover:text-primary'
                }`}
              >
                {GROUP_LABELS[key]}
                {value !== null && (
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs ${
                      selected ? 'bg-primary text-on-primary' : 'bg-surface text-muted'
                    }`}
                  >
                    {value}
                  </span>
                )}
              </button>
            );
          })}
        </div>
        {status && (
          <div className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3 text-sm">
            <span>
              Đang lọc trạng thái: <strong>{REQUEST_STATUS_LABELS[status]}</strong>
            </span>
            <Button variant="secondary" size="sm" onClick={() => navigate({ group })}>
              Xóa lọc
            </Button>
          </div>
        )}

        {requests.isPending ? (
          <div className="p-6">
            <PageLoading label="Đang tải yêu cầu…" />
          </div>
        ) : requests.isError ? (
          <div className="p-4">
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
          </div>
        ) : requests.data.items.length === 0 ? (
          <div className="p-4">
            <EmptyState
              title="Chưa có yêu cầu phù hợp"
              description={
                total === 0
                  ? 'Tạo yêu cầu đầu tiên để kiểm duyệt viên tìm gia sư phù hợp.'
                  : 'Không có yêu cầu nào khớp với tab và bộ lọc hiện tại.'
              }
              action={<ButtonLink to="/parent/request">Tạo yêu cầu tìm gia sư</ButtonLink>}
            />
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1080px] text-left text-sm">
                <thead className="border-b border-border bg-surface text-xs uppercase tracking-wide text-muted">
                  <tr>
                    {[
                      'Mã',
                      'Học sinh',
                      'Môn – Lớp',
                      'Cấp · Hình thức',
                      'Khu vực',
                      'Học phí',
                      'Lịch học',
                      'Trạng thái',
                      'Ngày gửi',
                    ].map((label) => (
                      <th key={label} scope="col" className="px-4 py-3 font-medium">
                        {label}
                      </th>
                    ))}
                    <th scope="col" className="px-4 py-3 text-right font-medium">
                      Thao tác
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {requests.data.items.map((request) => (
                    <RequestRow key={request.id} request={request} />
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border bg-surface px-4 py-3">
              <div className="flex items-center gap-3 text-sm text-muted">
                <label className="flex items-center gap-2">
                  Hiển thị
                  <select
                    value={pageSize}
                    onChange={(event) => navigate({ pageSize: Number(event.target.value) })}
                    className="min-h-11 rounded-md border border-border bg-bg px-2 text-sm text-fg focus-visible:outline-2 focus-visible:outline-focus"
                  >
                    {PAGE_SIZES.map((size) => (
                      <option key={size} value={size}>
                        {size}
                      </option>
                    ))}
                  </select>
                </label>
                <span role="status">
                  {firstRow}–{lastRow} / <strong>{requests.data.total}</strong> bản ghi
                </span>
              </div>
              <nav aria-label="Trang yêu cầu" className="flex items-center gap-1">
                <PageButton
                  label="Trang đầu"
                  disabled={page <= 1}
                  onClick={() => navigate({ page: 1 })}
                >
                  <ChevronsLeft aria-hidden="true" className="size-4" />
                </PageButton>
                <PageButton
                  label="Trang trước"
                  disabled={page <= 1}
                  onClick={() => navigate({ page: page - 1 })}
                >
                  <ChevronLeft aria-hidden="true" className="size-4" />
                </PageButton>
                <span
                  aria-current="page"
                  className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md bg-primary px-2 text-sm font-semibold text-on-primary"
                >
                  {page}
                </span>
                <PageButton
                  label="Trang sau"
                  disabled={page >= lastPage}
                  onClick={() => navigate({ page: page + 1 })}
                >
                  <ChevronRight aria-hidden="true" className="size-4" />
                </PageButton>
                <PageButton
                  label="Trang cuối"
                  disabled={page >= lastPage}
                  onClick={() => navigate({ page: lastPage })}
                >
                  <ChevronsRight aria-hidden="true" className="size-4" />
                </PageButton>
              </nav>
            </div>
          </>
        )}
      </div>
    </section>
  );
}

function RequestRow({ request }: { request: ParentRequestListItem }) {
  const detail = `/parent/requests/${encodeURIComponent(request.id)}`;
  return (
    <tr className="hover:bg-surface">
      <td className="px-4 py-3 font-mono text-xs whitespace-nowrap">
        <Link
          to={detail}
          className="font-semibold text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        >
          {request.code}
        </Link>
      </td>
      <td className="px-4 py-3">
        <p className="font-semibold text-primary">{request.studentName ?? 'Chưa nhập'}</p>
        {request.contactPhone && <p className="text-xs text-muted">{request.contactPhone}</p>}
      </td>
      <td className="px-4 py-3">
        <span className="font-semibold text-primary">{request.subjectName}</span>
        <span className="text-muted"> – {request.grade}</span>
      </td>
      <td className="px-4 py-3 text-muted">
        {request.educationLevel ? `${EDUCATION_LEVEL_LABELS[request.educationLevel]} · ` : ''}
        <span className={request.mode === 'online' ? 'font-medium text-primary' : undefined}>
          {request.mode === 'online' ? 'Online' : 'Offline'}
        </span>
      </td>
      <td className="px-4 py-3">
        {request.area ?? (request.mode === 'online' ? 'Trực tuyến' : '—')}
      </td>
      <td className="px-4 py-3 whitespace-nowrap">
        {request.expectedBudgetMinor === null ? 'Chưa nêu' : formatVnd(request.expectedBudgetMinor)}
      </td>
      <td className="px-4 py-3 text-xs whitespace-nowrap text-muted">{scheduleSummary(request)}</td>
      <td className="px-4 py-3 whitespace-nowrap">
        <Badge tone={statusTone[request.status]}>{REQUEST_STATUS_LABELS[request.status]}</Badge>
      </td>
      <td className="px-4 py-3 text-xs whitespace-nowrap text-muted">
        {requestDate(request.createdAt)}
      </td>
      <td className="px-4 py-3 text-right">
        <Link
          to={detail}
          aria-label={`Chi tiết ${request.code}`}
          className="inline-flex min-h-11 items-center gap-1 whitespace-nowrap rounded-lg border border-border px-3 font-medium text-primary hover:bg-info-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        >
          <Eye aria-hidden="true" className="size-4" />
          Chi tiết
        </Link>
      </td>
    </tr>
  );
}

function SummaryCard({
  label,
  value,
  icon: Icon,
  tone = 'neutral',
  active = false,
  onSelect,
}: {
  label: string;
  value: number | null;
  icon?: LucideIcon;
  tone?: 'neutral' | 'warning' | 'info' | 'success';
  active?: boolean;
  onSelect?: () => void;
}) {
  const tones = {
    neutral: 'bg-surface text-primary',
    warning: 'bg-warning-surface text-warning',
    info: 'bg-info-surface text-primary',
    success: 'bg-success-surface text-success',
  } as const;
  const content: ReactNode = (
    <>
      <span className="flex items-center gap-2 text-sm font-medium">
        {Icon && <Icon aria-hidden="true" className="size-5" />}
        {label}
      </span>
      <span className="mt-3 block text-3xl font-bold">{value ?? '—'}</span>
      <span className="mt-1 block text-sm opacity-70">yêu cầu</span>
    </>
  );
  const className = `rounded-xl border p-5 text-left ${tones[tone]} ${
    active ? 'border-2 border-primary shadow-card' : 'border-border'
  }`;
  if (!onSelect) return <div className={className}>{content}</div>;
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onSelect}
      className={`${className} transition-shadow hover:shadow-card focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus`}
    >
      {content}
    </button>
  );
}

function PageButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md border border-border bg-bg text-primary hover:bg-info-surface focus-visible:outline-2 focus-visible:outline-focus disabled:cursor-not-allowed disabled:opacity-40"
    >
      {children}
    </button>
  );
}
