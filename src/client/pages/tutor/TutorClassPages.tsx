import { useRef, useState, type FormEvent, type ReactNode } from 'react';
import {
  ArrowLeft,
  BookOpen,
  Building2,
  CalendarDays,
  CircleCheck,
  Clock,
  DollarSign,
  Eye,
  Filter,
  GraduationCap,
  MapPin,
  Phone,
  RefreshCw,
  Search,
  UserRound,
} from 'lucide-react';
import { Link, useParams, useSearchParams } from 'react-router';
import {
  feeSessionsPerWeek,
  PLACEMENT_FEE_OPTION_KEY,
  PLACEMENT_FEE_WEEKS,
  type ApplicationAvailability,
  type PublicClass,
} from '../../../shared/schemas/classes';
import { HANOI_DISTRICTS } from '../../../shared/schemas/hanoi-wards';
import { ADJUSTMENT_LABELS } from '../../components/domain/MatchExplanation';
import { Button, ButtonLink } from '../../components/ui/Button';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { Alert, EmptyState } from '../../components/ui/Feedback';
import { SelectField, TextField } from '../../components/ui/Field';
import { ListFooter } from '../../components/ui/ListControls';
import { PageLoading } from '../../components/ui/Spinner';
import {
  useApplyForClass,
  useClassRecommendation,
  useFeeOptions,
  usePublicClass,
  usePublicClasses,
  type MatchAdjustment,
} from '../../features/classes/api';
import { useWeeklyAvailability } from '../../features/availability/api';
import { useTutorTermsQuiz } from '../../features/terms-contracts/api';
import {
  isRequestGridWindow,
  RequestScheduleGrid,
} from '../../components/domain/RequestScheduleGrid';
import { useSubjects } from '../../features/tutor-profile/api';
import { formatDate } from '../../lib/format';

type GridWindow = ApplicationAvailability['windows'][number];

const NEW_DAYS = 7;
const PAGE_SIZES = [12, 24, 48] as const;
const DAYS = [
  [1, 'T2'],
  [2, 'T3'],
  [3, 'T4'],
  [4, 'T5'],
  [5, 'T6'],
  [6, 'T7'],
  [7, 'CN'],
] as const;

/** "150,000đ" as in the design. */
export const money = (minor: number) => `${minor.toLocaleString('en-US')}đ`;

function isNew(item: PublicClass): boolean {
  if (!item.publishedAt) return false;
  return Date.now() - new Date(item.publishedAt).getTime() < NEW_DAYS * 86_400_000;
}

const DAY_NAMES: Record<number, string> = {
  1: 'Thứ Hai',
  2: 'Thứ Ba',
  3: 'Thứ Tư',
  4: 'Thứ Năm',
  5: 'Thứ Sáu',
  6: 'Thứ Bảy',
  7: 'Chủ nhật',
};
const shortDay = (weekday: number) => DAYS.find(([day]) => day === weekday)?.[1] ?? `T${weekday}`;

/** Sessions per week: the request's own count, else its weekly time slots. */
export function sessionsOf(item: PublicClass): number | null {
  return feeSessionsPerWeek(item.sessionsPerWeek, item.schedule.windows.length);
}

/** "2 buổi/tuần · T3, T6 (17:00–19:00)"; days sharing a time range are grouped. */
export function classSchedule(item: PublicClass): string {
  const sessions = sessionsOf(item);
  const head = sessions ? `${sessions} buổi/tuần` : null;
  const { windows, discussLater } = item.schedule;
  if (discussLater || windows.length === 0)
    return [head, 'trao đổi lịch sau'].filter(Boolean).join(' · ');
  const groups = new Map<string, number[]>();
  for (const window of windows) {
    const range = `${window.startLocal}–${window.endLocal}`;
    groups.set(range, [...(groups.get(range) ?? []), window.weekday]);
  }
  const times = [...groups]
    .map(([range, days]) => `${days.map(shortDay).join(', ')} (${range})`)
    .join('; ');
  return [head, times].filter(Boolean).join(' · ');
}

/** One line per weekly slot, for the detail page. */
export function ScheduleLines({ item }: { item: PublicClass }) {
  const sessions = sessionsOf(item);
  const { windows, discussLater } = item.schedule;
  return (
    <div className="flex flex-col gap-1">
      {sessions && <p className="text-lg font-medium">{sessions} buổi/tuần</p>}
      {discussLater || windows.length === 0 ? (
        <p className="text-muted">Trao đổi lịch học sau</p>
      ) : (
        <ul aria-label="Thời gian có thể học" className="flex flex-col gap-0.5">
          {windows.map((window) => (
            <li key={`${window.weekday}-${window.startLocal}`}>
              {DAY_NAMES[window.weekday]}: {window.startLocal}–{window.endLocal}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function Badges({ item, dark = false }: { item: PublicClass; dark?: boolean }) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm font-medium">
      <span className="rounded-full bg-accent px-3 py-0.5 text-on-accent">{item.subjectName}</span>
      {isNew(item) && <span className="rounded-full bg-success px-3 py-0.5 text-white">Mới</span>}
      {dark && (
        <span className="rounded-full border border-white/60 px-3 py-0.5">{item.grade}</span>
      )}
    </div>
  );
}

export function Fact({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <span aria-hidden="true" className="mt-0.5 text-accent">
        {icon}
      </span>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

function ClassCard({ item }: { item: PublicClass }) {
  return (
    <article className="flex h-full min-w-0 flex-col gap-4 rounded-2xl border border-border bg-bg p-5 shadow-card">
      <div className="flex items-start justify-between gap-2">
        <span className="rounded-full bg-accent px-3 py-0.5 text-sm font-medium text-on-accent">
          {item.subjectName}
        </span>
        {isNew(item) && (
          <span className="rounded-full bg-success px-3 py-0.5 text-sm font-medium text-white">
            Mới
          </span>
        )}
      </div>
      <h2 className="min-h-14 text-xl font-semibold text-primary">
        {item.subjectName} - {item.grade}
      </h2>
      <div className="flex flex-col gap-3 text-sm">
        <Fact icon={<MapPin className="size-5" />}>
          {item.mode === 'online' ? 'Học trực tuyến' : (item.publicArea ?? 'Khu vực chưa công bố')}
        </Fact>
        <Fact icon={<CalendarDays className="size-5" />}>{classSchedule(item)}</Fact>
        <Fact icon={<DollarSign className="size-5" />}>
          <p className="font-semibold text-primary">
            {item.expectedBudgetMinor === null
              ? 'Học phí thỏa thuận'
              : `${money(item.expectedBudgetMinor)}/buổi`}
          </p>
          {item.placementFeeMinor !== null && (
            <p className="text-xs text-muted">Phí nhận lớp: {money(item.placementFeeMinor)}</p>
          )}
        </Fact>
        <span className="self-start rounded-full border border-primary px-3 py-0.5 text-xs font-semibold text-primary">
          {item.mode === 'online' ? 'Online' : 'Offline'}
        </span>
        {item.studentTraits && (
          <Fact icon={<UserRound className="size-5" />}>
            <p className="line-clamp-2 text-muted">{item.studentTraits}</p>
          </Fact>
        )}
      </div>
      <div className="mt-auto border-t border-border pt-4">
        <ButtonLink
          to={`/tutor/new-classes/${encodeURIComponent(item.id)}`}
          variant="secondary"
          className="w-full gap-2"
          aria-label={`Xem chi tiết lớp ${item.code}`}
        >
          <Eye aria-hidden="true" className="size-4" />
          Xem chi tiết
        </ButtonLink>
      </div>
    </article>
  );
}

type Draft = { q: string; subjectId: string; area: string; mode: '' | 'online' | 'offline' };

/** "Danh sách lớp mới": open classes with keyword, subject, Hà Nội area and mode filters. */
export function TutorNewClassesPage() {
  const [params, setParams] = useSearchParams();
  const subjects = useSubjects();
  const modeParam = params.get('mode');
  const applied: Draft = {
    q: params.get('q')?.slice(0, 100) ?? '',
    subjectId: params.get('subjectId') ?? '',
    area: params.get('area') ?? '',
    mode: modeParam === 'online' || modeParam === 'offline' ? modeParam : '',
  };
  const rawPage = Number(params.get('page') ?? 1);
  const page = Number.isSafeInteger(rawPage) && rawPage >= 1 && rawPage <= 1000 ? rawPage : 1;
  const rawSize = Number(params.get('pageSize') ?? PAGE_SIZES[0]);
  const pageSize = PAGE_SIZES.includes(rawSize as (typeof PAGE_SIZES)[number])
    ? rawSize
    : PAGE_SIZES[0];
  const [draft, setDraft] = useState<Draft>(applied);
  const classes = usePublicClasses({
    q: applied.q || undefined,
    subjectId: applied.subjectId || undefined,
    area: applied.area || undefined,
    mode: applied.mode || undefined,
    page,
    pageSize,
  });

  function navigate(next: Partial<Draft & { page: number; pageSize: number }>) {
    const merged = { ...applied, page: 1, pageSize, ...next };
    const search = new URLSearchParams();
    for (const key of ['q', 'subjectId', 'area', 'mode'] as const) {
      if (merged[key]) search.set(key, merged[key]);
    }
    if (merged.page > 1) search.set('page', String(merged.page));
    if (merged.pageSize !== PAGE_SIZES[0]) search.set('pageSize', String(merged.pageSize));
    setParams(search, { preventScrollReset: true });
  }

  function apply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    navigate({ ...draft, q: draft.q.trim() });
  }

  function reset() {
    const empty: Draft = { q: '', subjectId: '', area: '', mode: '' };
    setDraft(empty);
    navigate(empty);
    void classes.refetch();
  }

  return (
    <section className="flex min-w-0 flex-col gap-6">
      <header>
        <h1 className="text-3xl font-bold text-primary md:text-4xl">Danh sách lớp mới</h1>
        <p className="mt-2 text-muted">Các lớp học mới nhất đang tìm gia sư phù hợp</p>
      </header>

      <form
        onSubmit={apply}
        className="flex flex-col gap-4 rounded-2xl border border-border bg-bg p-5 shadow-card"
      >
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(0,2.4fr)_repeat(3,minmax(0,1fr))_auto] xl:items-end">
          <div className="relative">
            <TextField
              label="Từ khóa"
              type="search"
              placeholder="Tên môn, địa điểm..."
              maxLength={100}
              value={draft.q}
              onChange={(event) => setDraft({ ...draft, q: event.target.value })}
            />
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute bottom-3.5 right-3 size-4 text-muted"
            />
          </div>
          <SelectField
            label="Môn học"
            value={draft.subjectId}
            onChange={(event) => setDraft({ ...draft, subjectId: event.target.value })}
          >
            <option value="">Tất cả</option>
            {subjects.data?.map((subject) => (
              <option key={subject.id} value={subject.id}>
                {subject.name}
              </option>
            ))}
          </SelectField>
          <SelectField
            label="Khu vực"
            value={draft.area}
            onChange={(event) => setDraft({ ...draft, area: event.target.value })}
          >
            <option value="">Tất cả</option>
            {HANOI_DISTRICTS.map((district) => (
              <option key={district} value={district}>
                {district}
              </option>
            ))}
          </SelectField>
          <SelectField
            label="Hình thức dạy"
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
            <Button type="button" variant="secondary" className="gap-2" onClick={reset}>
              <RefreshCw aria-hidden="true" className="size-4" />
              Làm mới
            </Button>
          </div>
        </div>
        {classes.data && (
          <p role="status" className="flex items-center gap-2 text-sm text-muted">
            <BookOpen aria-hidden="true" className="size-4" />
            Tìm thấy <strong className="text-primary">{classes.data.total}</strong> lớp học
          </p>
        )}
      </form>

      {classes.isPending ? (
        <PageLoading label="Đang tải lớp học…" />
      ) : classes.isError ? (
        <Alert
          tone="danger"
          title="Không tải được lớp học"
          action={
            <Button variant="secondary" onClick={() => void classes.refetch()}>
              Thử lại
            </Button>
          }
        >
          {classes.error.message}
        </Alert>
      ) : classes.data.items.length === 0 ? (
        <EmptyState
          title="Chưa có lớp phù hợp"
          description="Không có lớp nào khớp với bộ lọc hiện tại. Thử bỏ bớt điều kiện lọc."
        />
      ) : (
        <>
          <ul className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
            {classes.data.items.map((item) => (
              <li key={item.id} className="min-w-0">
                <ClassCard item={item} />
              </li>
            ))}
          </ul>
          <div className="overflow-hidden rounded-xl border border-border bg-bg">
            <ListFooter
              page={page}
              pageSize={pageSize}
              pageSizes={PAGE_SIZES}
              shown={classes.data.items.length}
              total={classes.data.total}
              navigationLabel="Trang lớp học"
              onPage={(next) => navigate({ page: next })}
              onPageSize={(size) => navigate({ pageSize: size })}
            />
          </div>
        </>
      )}
    </section>
  );
}

export function BackLink({ to }: { to: string }) {
  return (
    <ButtonLink to={to} variant="secondary" className="gap-2 rounded-xl">
      <ArrowLeft aria-hidden="true" className="size-4" />
      Quay lại
    </ButtonLink>
  );
}

function useClassPage() {
  const { id } = useParams();
  const detail = usePublicClass(id);
  let fallback: ReactNode = null;
  if (detail.isPending) fallback = <PageLoading label="Đang tải thông tin lớp…" />;
  else if (detail.isError)
    fallback = (
      <Alert
        tone="danger"
        title="Không tải được thông tin lớp"
        action={
          <Button variant="secondary" onClick={() => void detail.refetch()}>
            Thử lại
          </Button>
        }
      >
        {detail.error.message}
      </Alert>
    );
  return { id, detail, fallback };
}

/** Requirements written one per line (or separated by ";") read as a bullet list. */
export function requirementList(text: string): string[] {
  return text
    .split(/\n|;/)
    .map((line) => line.replace(/^[-•*\s]+/, '').trim())
    .filter(Boolean);
}

/** "Chi tiết lớp học". */
export function TutorClassDetailPage() {
  const { id, detail, fallback } = useClassPage();
  if (fallback || !detail.data) return fallback;
  const item = detail.data;
  const requirements = item.tutorRequirements ? requirementList(item.tutorRequirements) : [];
  return (
    <section className="mx-auto flex w-full max-w-5xl min-w-0 flex-col gap-6">
      <div className="flex flex-wrap items-center gap-4">
        <BackLink to="/tutor/new-classes" />
        <h1 className="text-3xl font-semibold text-primary">Chi tiết lớp học</h1>
      </div>
      <article className="overflow-hidden rounded-2xl border border-border bg-bg shadow-card">
        <header className="flex flex-col gap-3 bg-primary px-6 py-6 text-on-primary sm:px-8">
          <Badges item={item} dark />
          <h2 className="text-3xl font-semibold">
            {item.subjectName} – {item.grade}
          </h2>
          <p className="text-sm text-white/80">
            Mã lớp: {item.code}
            {item.publishedAt && ` · Đăng ngày ${formatDate(item.publishedAt, 'Asia/Ho_Chi_Minh')}`}
          </p>
        </header>
        <div className="flex flex-col gap-6 px-6 py-6 sm:px-8">
          <section aria-labelledby="class-info" className="flex flex-col gap-5">
            <h3 id="class-info" className="text-xl font-semibold text-primary">
              Thông tin lớp học
            </h3>
            <dl className="grid gap-5 sm:grid-cols-2">
              <Fact icon={<MapPin className="size-6" />}>
                <dt className="text-sm text-muted">Địa điểm</dt>
                <dd className="text-lg font-medium">
                  {item.mode === 'online' ? 'Học trực tuyến' : (item.publicArea ?? 'Chưa công bố')}
                </dd>
              </Fact>
              <Fact icon={<CalendarDays className="size-6" />}>
                <dt className="text-sm text-muted">Lịch học</dt>
                <dd>
                  <ScheduleLines item={item} />
                </dd>
              </Fact>
              <Fact icon={<DollarSign className="size-6" />}>
                <dt className="text-sm text-muted">Học phí / buổi</dt>
                <dd>
                  <p className="text-2xl font-bold text-primary">
                    {item.expectedBudgetMinor === null
                      ? 'Thỏa thuận'
                      : `${money(item.expectedBudgetMinor)}/buổi`}
                  </p>
                </dd>
              </Fact>
              <Fact icon={<BookOpen className="size-6" />}>
                <dt className="text-sm text-muted">Hình thức dạy</dt>
                <dd className="text-lg font-medium">
                  {item.mode === 'online' ? 'Online' : 'Offline'}
                </dd>
              </Fact>
              {item.studentTraits && (
                <div className="sm:col-span-2">
                  <Fact icon={<UserRound className="size-6" />}>
                    <dt className="text-sm text-muted">Đặc điểm học sinh</dt>
                    <dd className="text-lg">{item.studentTraits}</dd>
                  </Fact>
                </div>
              )}
            </dl>
          </section>
          {requirements.length > 0 && (
            <section
              aria-labelledby="class-requirements"
              className="flex flex-col gap-3 border-t border-border pt-6"
            >
              <h3
                id="class-requirements"
                className="flex items-center gap-2 text-xl font-semibold text-primary"
              >
                <GraduationCap aria-hidden="true" className="size-6 text-accent" />
                Yêu cầu gia sư
              </h3>
              <ul className="flex flex-col gap-2 text-lg">
                {requirements.map((requirement) => (
                  <li key={requirement} className="flex items-start gap-3">
                    <span
                      aria-hidden="true"
                      className="mt-3 size-1.5 shrink-0 rounded-full bg-accent"
                    />
                    {requirement}
                  </li>
                ))}
              </ul>
            </section>
          )}
          <div className="border-t border-border pt-6">
            <ButtonLink
              to={`/tutor/new-classes/${encodeURIComponent(id!)}/nhan-lop`}
              variant="accent"
              className="w-full rounded-2xl text-lg font-semibold"
            >
              Nhận lớp
            </ButtonLink>
          </div>
        </div>
      </article>
    </section>
  );
}

function Panel({
  title,
  icon,
  children,
}: {
  title: string;
  icon?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-bg shadow-card">
      <h2 className="flex items-center gap-2 border-b border-border bg-surface px-6 py-4 text-lg font-semibold text-primary sm:px-8">
        {icon}
        {title}
      </h2>
      <div className="flex flex-col gap-5 px-6 py-6 sm:px-8">{children}</div>
    </section>
  );
}

/** "Nhận lớp": placement fee, process, free time for this class and the terms step. */
export function TutorAcceptClassPage() {
  const { id, detail, fallback } = useClassPage();
  const recommendation = useClassRecommendation(id);
  const feeOptions = useFeeOptions(id, Boolean(id));
  const quiz = useTutorTermsQuiz();
  const weekly = useWeeklyAvailability();
  const apply = useApplyForClass();
  // Free time starts from the tutor's saved weekly grid and can be changed for this class.
  const [windows, setWindows] = useState<GridWindow[] | null>(null);
  const [agreed, setAgreed] = useState(false);
  const [timeError, setTimeError] = useState('');
  const [confirming, setConfirming] = useState(false);
  const idempotencyKey = useRef<string | null>(null);
  if (fallback || !detail.data) return fallback;
  const item = detail.data;
  const placement = feeOptions.data?.find(
    (option) => option.optionKey === PLACEMENT_FEE_OPTION_KEY,
  );
  const match = recommendation.data?.match;
  const passed = Boolean(quiz.data?.acknowledgedAt);
  const here = `/tutor/new-classes/${encodeURIComponent(id!)}/nhan-lop`;
  const saved = (weekly.data?.rules ?? [])
    .filter((rule) => !rule.effectiveFrom && !rule.effectiveTo)
    .map((rule) => ({ weekday: rule.weekday, startLocal: rule.start, endLocal: rule.end }))
    .filter(isRequestGridWindow);
  const chosen = windows ?? saved;
  const sessions = sessionsOf(item);
  const rate = placement ? placement.rateBasisPoints / 100 : null;

  function availability(): ApplicationAvailability | null {
    if (chosen.length === 0) {
      setTimeError('Chọn ít nhất một khung giờ có thể dạy trong bảng.');
      return null;
    }
    setTimeError('');
    return { windows: chosen };
  }

  function send(adjustments: MatchAdjustment[]) {
    const times = availability();
    if (!times || !placement || !recommendation.data || !agreed || apply.isPending) return;
    idempotencyKey.current ??= crypto.randomUUID();
    apply.mutate(
      {
        classId: item.id,
        feeOptionVersionId: placement.id,
        classVersion: recommendation.data.class.version,
        idempotencyKey: idempotencyKey.current,
        availability: times,
        termsAgreed: true,
        ...(adjustments.length > 0 && { acceptedAdjustments: adjustments }),
      },
      {
        onSuccess: () => setConfirming(false),
        onError: () => {
          setConfirming(false);
          idempotencyKey.current = null;
          void recommendation.refetch();
          void feeOptions.refetch();
        },
      },
    );
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!availability() || !passed || !agreed) return;
    if (match && match.adjustments.length > 0) setConfirming(true);
    else send([]);
  }

  if (apply.isSuccess) {
    return (
      <section className="mx-auto flex w-full max-w-4xl flex-col gap-6">
        <div className="flex flex-wrap items-center gap-4">
          <BackLink to={`/tutor/new-classes/${encodeURIComponent(id!)}`} />
          <h1 className="text-3xl font-semibold text-primary">Nhận lớp {item.code}</h1>
        </div>
        <Alert tone="success" title="Đã gửi yêu cầu nhận lớp">
          Trung tâm sẽ liên hệ với phụ huynh và báo lại cho bạn. Theo dõi trạng thái tại{' '}
          <Link className="font-medium text-primary underline" to="/tutor/class-requests">
            Yêu cầu nhận lớp
          </Link>
          .
        </Alert>
      </section>
    );
  }

  return (
    <form onSubmit={submit} noValidate className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <div className="flex flex-wrap items-center gap-4">
        <BackLink to={`/tutor/new-classes/${encodeURIComponent(id!)}`} />
        <h1 className="text-3xl font-semibold text-primary">Nhận lớp {item.code}</h1>
      </div>

      <Panel title="Thông tin nhận lớp">
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-accent/60 bg-warning-surface px-5 py-4">
          <div className="flex items-center gap-3">
            <DollarSign aria-hidden="true" className="size-7 text-warning" />
            <div>
              <p className="text-sm text-warning">Phí nhận lớp</p>
              <p className="text-2xl font-bold text-primary">
                {item.placementFeeMinor !== null
                  ? money(item.placementFeeMinor)
                  : `${rate ?? 40}% học phí một tháng`}
              </p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-sm text-warning">Học phí gia sư nhận được</p>
            <p className="text-lg font-medium text-primary">
              {item.expectedBudgetMinor === null
                ? 'Thỏa thuận với phụ huynh'
                : `${money(item.expectedBudgetMinor)}/buổi`}
            </p>
          </div>
        </div>
        <dl className="-mt-1 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
          <div className="flex gap-2">
            <dt className="text-muted">Cách tính:</dt>
            <dd>
              {rate ?? 40}% × học phí 1 buổi × số buổi/tuần × {PLACEMENT_FEE_WEEKS} tuần
            </dd>
          </div>
          <div className="flex gap-2">
            <dt className="text-muted">Áp dụng cho lớp này:</dt>
            <dd className="font-medium">
              {item.expectedBudgetMinor !== null && sessions
                ? `${rate ?? 40}% × ${money(item.expectedBudgetMinor)} × ${sessions} buổi × ${PLACEMENT_FEE_WEEKS}`
                : 'Trung tâm xác nhận học phí với phụ huynh rồi thông báo mức phí cụ thể'}
            </dd>
          </div>
        </dl>
        <div>
          <h3 className="mb-3 font-semibold text-primary">Quy trình thực hiện</h3>
          <ol className="flex flex-col gap-4 text-sm">
            {(
              [
                [Phone, <>Trung tâm sẽ liên hệ với phụ huynh. Nếu phụ huynh đồng ý:</>],
                [
                  Building2,
                  <>
                    Bạn sẽ đến văn phòng trung tâm tại{' '}
                    <strong>Số 41 Khuất Duy Tiến, Thanh Xuân, Hà Nội</strong> để ký hợp đồng cam kết
                    và thanh toán phí nhận lớp.
                  </>,
                ],
                [
                  CircleCheck,
                  <>
                    Sau khi hoàn tất thủ tục, bạn sẽ nhận được thông tin liên hệ của phụ huynh và
                    thư giới thiệu từ trung tâm.
                  </>,
                ],
              ] as const
            ).map(([Icon, text], index) => (
              <li key={index} className="flex items-start gap-3">
                <span
                  aria-hidden="true"
                  className="flex size-9 shrink-0 items-center justify-center rounded-full bg-surface text-primary"
                >
                  <Icon className="size-4" />
                </span>
                <span className="pt-1.5">{text}</span>
              </li>
            ))}
          </ol>
        </div>
      </Panel>

      <Panel
        title="Thời gian rảnh có thể đi dạy"
        icon={<Clock aria-hidden="true" className="size-5" />}
      >
        <p className="-mt-2 text-sm text-muted">
          Chọn các ô theo ngày trong tuần và khung giờ bạn có thể dạy lớp này
          {saved.length > 0 && ' (đã điền sẵn theo hồ sơ của bạn)'}. Lớp học vào:{' '}
          <strong className="text-primary">{classSchedule(item)}</strong>.
        </p>
        <RequestScheduleGrid
          value={chosen}
          onChange={(next) => {
            setTimeError('');
            setWindows(next);
          }}
          caption="Chọn thời gian rảnh có thể đi dạy theo tuần"
        />
        {timeError && (
          <p role="alert" className="text-sm text-danger">
            {timeError}
          </p>
        )}
      </Panel>

      <Panel title="Điều khoản trách nhiệm">
        {quiz.isPending ? (
          <PageLoading label="Đang tải điều khoản…" />
        ) : quiz.isError ? (
          <Alert tone="warning" title="Chưa có bài test điều khoản">
            {quiz.error.message}
          </Alert>
        ) : passed ? (
          <>
            <Alert tone="success" title="Bạn đã hoàn thành bài test điều khoản trách nhiệm.">
              Kết quả đã được lưu ngày {formatDate(quiz.data.acknowledgedAt!, 'Asia/Ho_Chi_Minh')};
              các lần nhận lớp sau không cần làm lại.
            </Alert>
            <label className="flex min-h-11 items-start gap-3 rounded-xl border border-border p-4 text-sm">
              <input
                type="checkbox"
                className="mt-0.5 size-4 accent-[var(--color-primary)]"
                checked={agreed}
                onChange={(event) => setAgreed(event.target.checked)}
              />
              Tôi xác nhận đã đọc và đồng ý với Điều khoản trách nhiệm của trung tâm
            </label>
          </>
        ) : (
          <>
            <p className="rounded-xl border border-accent/60 bg-warning-surface px-5 py-4 text-sm">
              Để nhận lớp, bạn cần hoàn thành bài test về điều khoản trách nhiệm. Bài test chỉ cần
              làm một lần duy nhất — các lần nhận lớp sau sẽ không cần làm lại.
            </p>
            <ButtonLink to={`/tutor/terms?next=${encodeURIComponent(here)}`} className="w-full">
              Làm bài test điều khoản trách nhiệm
            </ButtonLink>
          </>
        )}
      </Panel>

      {(feeOptions.isError || (feeOptions.data && !placement)) && (
        <Alert tone="warning" title="Chưa thể nhận lớp">
          Chưa có phí nhận lớp được công bố cho lớp này.
        </Alert>
      )}
      {recommendation.isError && (
        <Alert tone="warning" title="Chưa thể nhận lớp">
          {recommendation.error.message}
        </Alert>
      )}
      {apply.isError && (
        <Alert tone="danger" title="Chưa gửi được yêu cầu nhận lớp">
          {apply.error.message}
        </Alert>
      )}
      <Button
        type="submit"
        variant="accent"
        className="w-full rounded-2xl text-base font-semibold"
        loading={apply.isPending}
        disabled={!passed || !agreed || !placement || !recommendation.data}
      >
        Xác nhận nhận lớp
      </Button>
      {passed && !agreed && (
        <p className="-mt-3 text-center text-sm text-muted">
          Tích chọn đồng ý với Điều khoản trách nhiệm để xác nhận nhận lớp.
        </p>
      )}

      {match && (
        <ConfirmDialog
          open={confirming}
          title="Xác nhận điều chỉnh để nhận lớp"
          description={
            <div className="space-y-2">
              <p>Lớp {item.code} có tiêu chí khác với hồ sơ của bạn:</p>
              <ul className="list-disc pl-5">
                {match.adjustments.map((adjustment) => (
                  <li key={adjustment}>{ADJUSTMENT_LABELS[adjustment]}</li>
                ))}
              </ul>
              <p>Nếu xác nhận, hồ sơ sẽ được cập nhật theo các điểm này và yêu cầu được gửi.</p>
            </div>
          }
          confirmLabel="Xác nhận và gửi"
          cancelLabel="Xem lại"
          loading={apply.isPending}
          onConfirm={() => send(match.adjustments)}
          onCancel={() => setConfirming(false)}
        />
      )}
    </form>
  );
}
