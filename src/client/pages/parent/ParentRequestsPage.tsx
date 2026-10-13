import { useState, type FormEvent } from 'react';
import { CircleCheck, Eye, Filter, Phone, Plus, RefreshCw, Search, UserCheck } from 'lucide-react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router';
import {
  EDUCATION_LEVEL_LABELS,
  LEARNER_REQUEST_STAGES,
  type LearnerRequestStage,
  type ParentRequestListItem,
} from '../../../shared/schemas/requests';
import { Button, ButtonLink } from '../../components/ui/Button';
import { Alert, EmptyState } from '../../components/ui/Feedback';
import { SelectField, TextField } from '../../components/ui/Field';
import { ListFooter, StatusTabs, SummaryCard } from '../../components/ui/ListControls';
import { PageLoading } from '../../components/ui/Spinner';
import {
  useParentRequestCounts,
  useParentRequests,
  type ParentRequestFilters,
} from '../../features/parent-requests/api';
import { requestDate } from '../../features/parent-requests/format';
import { useSubjects } from '../../features/tutor-profile/api';
import { formatVnd } from '../../lib/format';
import type { RequestSentState } from './ParentRequestFormPage';
import { STAGE_LABELS, StageBadge } from './RequestStage';

const PAGE_SIZES = [10, 20, 40] as const;
const SHORT_DAYS = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'] as const;

function scheduleSummary(request: ParentRequestListItem): string {
  if (request.schedule.discussLater) return 'Trao đổi sau';
  const days = [...new Set(request.schedule.windows.map((window) => window.weekday))]
    .sort((a, b) => a - b)
    .map((weekday) => SHORT_DAYS[weekday - 1]);
  return `${days.join(', ')} (${request.schedule.windows.length} khung/tuần)`;
}

type Draft = { q: string; subjectId: string; mode: '' | 'online' | 'offline' };

export function ParentRequestsPage() {
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const goTo = useNavigate();
  const sentCode = (location.state as RequestSentState | null)?.sentRequestCode ?? null;
  const subjects = useSubjects();
  const counts = useParentRequestCounts();

  const groupParam = params.get('group');
  const group: LearnerRequestStage = LEARNER_REQUEST_STAGES.includes(
    groupParam as LearnerRequestStage,
  )
    ? (groupParam as LearnerRequestStage)
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
  };
  const filters: ParentRequestFilters = {
    group,
    q: applied.q || undefined,
    subjectId: applied.subjectId || undefined,
    mode: applied.mode || undefined,
    page,
    pageSize,
  };
  const requests = useParentRequests(filters);
  const [draft, setDraft] = useState<Draft>(applied);

  function navigate(
    next: Partial<Draft & { group: LearnerRequestStage; page: number; pageSize: number }>,
  ) {
    const merged = { ...applied, group, page: 1, pageSize, ...next };
    const search = new URLSearchParams();
    if (merged.group !== 'searching') search.set('group', merged.group);
    for (const key of ['q', 'subjectId', 'mode'] as const) {
      if (merged[key]) search.set(key, merged[key]);
    }
    if (merged.page > 1) search.set('page', String(merged.page));
    if (merged.pageSize !== PAGE_SIZES[0]) search.set('pageSize', String(merged.pageSize));
    setParams(search, { preventScrollReset: true });
  }

  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    navigate({ ...draft, q: draft.q.trim() });
  }

  function resetFilters() {
    const empty: Draft = { q: '', subjectId: '', mode: '' };
    setDraft(empty);
    navigate(empty);
    void counts.refetch();
    void requests.refetch();
  }

  const total = counts.data
    ? LEARNER_REQUEST_STAGES.reduce((sum, stage) => sum + counts.data[stage], 0)
    : null;

  return (
    <section className="flex min-w-0 flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-primary">Tìm kiếm gia sư</h1>
          <p className="mt-1 text-sm text-muted">
            Gửi yêu cầu để chúng tôi tìm gia sư phù hợp cho bạn
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <a
            href="tel:0394618480"
            className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-primary px-4 py-2.5 text-sm text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          >
            <Phone aria-hidden="true" className="size-4" />
            Hotline: <strong>0394 618 480</strong>
          </a>
          <ButtonLink to="/parent/request" className="gap-2">
            <Plus aria-hidden="true" className="size-4" />
            Tạo yêu cầu tìm gia sư
          </ButtonLink>
        </div>
      </div>

      {sentCode && (
        <Alert
          tone="success"
          title="Gửi yêu cầu thành công"
          action={
            <Button
              variant="secondary"
              onClick={() => void goTo(location, { replace: true, state: null })}
            >
              Đóng
            </Button>
          }
        >
          Yêu cầu {sentCode} đã được tiếp nhận và hiển thị trong tab “{STAGE_LABELS.searching}”.
          Trung tâm sẽ sớm liên hệ để hỗ trợ bạn.
        </Alert>
      )}

      <section aria-labelledby="my-requests" className="flex min-w-0 flex-col gap-6">
        <h2 id="my-requests" className="text-2xl font-semibold text-primary">
          Yêu cầu của tôi
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <SummaryCard label="Tổng yêu cầu" value={total} unit="yêu cầu" />
          <SummaryCard
            label={STAGE_LABELS.searching}
            value={counts.data?.searching ?? null}
            unit="yêu cầu"
            icon={Search}
            tone="warning"
            active={group === 'searching'}
            onSelect={() => navigate({ group: 'searching' })}
          />
          <SummaryCard
            label={STAGE_LABELS.found}
            value={counts.data?.found ?? null}
            unit="yêu cầu"
            icon={UserCheck}
            tone="info"
            active={group === 'found'}
            onSelect={() => navigate({ group: 'found' })}
          />
          <SummaryCard
            label={STAGE_LABELS.confirmed}
            value={counts.data?.confirmed ?? null}
            unit="yêu cầu"
            icon={CircleCheck}
            tone="success"
            active={group === 'confirmed'}
            onSelect={() => navigate({ group: 'confirmed' })}
          />
        </div>

        <form
          onSubmit={applyFilters}
          className="grid gap-3 rounded-xl border border-border bg-bg p-4 shadow-card md:grid-cols-2 xl:grid-cols-[minmax(0,2fr)_repeat(2,minmax(0,1fr))_auto] xl:items-end"
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
          <StatusTabs
            label="Trạng thái yêu cầu"
            tabs={LEARNER_REQUEST_STAGES.map((key) => ({
              key,
              label: STAGE_LABELS[key],
              count: counts.data?.[key] ?? null,
            }))}
            selected={group}
            onSelect={(key) => navigate({ group: key })}
          />
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
                    ? 'Bấm “Tạo yêu cầu tìm gia sư” để gửi yêu cầu đầu tiên.'
                    : 'Không có yêu cầu nào khớp với tab và bộ lọc hiện tại.'
                }
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
              <ListFooter
                page={page}
                pageSize={pageSize}
                pageSizes={PAGE_SIZES}
                shown={requests.data.items.length}
                total={requests.data.total}
                navigationLabel="Trang yêu cầu"
                onPage={(next) => navigate({ page: next })}
                onPageSize={(size) => navigate({ pageSize: size })}
              />
            </>
          )}
        </div>
      </section>
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
        <StageBadge stage={request.stage} status={request.status} />
      </td>
      <td className="px-4 py-3 text-xs whitespace-nowrap text-muted">
        {requestDate(request.createdAt)}
      </td>
      <td className="px-4 py-3 text-right">
        <Link
          to={detail}
          aria-label={`Xem chi tiết ${request.code}`}
          className="inline-flex min-h-11 items-center gap-1 whitespace-nowrap rounded-lg border border-border px-3 font-medium text-primary hover:bg-info-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        >
          <Eye aria-hidden="true" className="size-4" />
          Xem chi tiết
        </Link>
      </td>
    </tr>
  );
}
