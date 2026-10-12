import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { LucideIcon } from 'lucide-react';
import {
  CircleCheck,
  ClipboardList,
  FileText,
  Filter,
  GraduationCap,
  MapPin,
  Search,
  TrendingUp,
  Users,
} from 'lucide-react';
import { useState, type FormEvent, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router';
import { DEFAULT_TIMEZONE } from '../../../shared/schemas/availability';
import type { Page } from '../../../shared/schemas/discovery';
import {
  reportRangeSchema,
  type AdminReportOverview,
  type ConversionReport,
  type NoTutorClass,
  type RevenueReport,
} from '../../../shared/schemas/reports';
import { addDays, todayIn } from '../../../shared/time';
import { Button } from '../../components/ui/Button';
import { Alert, EmptyState, PageHeader } from '../../components/ui/Feedback';
import { SelectField, TextField } from '../../components/ui/Field';
import { PageLoading } from '../../components/ui/Spinner';
import { api, toQuery } from '../../lib/api-client';

type ReportKind = 'overview' | 'conversion' | 'no-tutor' | 'revenue';
const NAV: { kind: ReportKind; to: string; label: string }[] = [
  { kind: 'overview', to: '/admin/reports', label: 'Tổng quan' },
  { kind: 'conversion', to: '/admin/reports/conversion', label: 'Chuyển đổi' },
  { kind: 'no-tutor', to: '/admin/reports/no-tutor', label: 'Lớp thiếu gia sư' },
  { kind: 'revenue', to: '/admin/reports/revenue', label: 'Doanh thu' },
];

function rangeFromParams(params: URLSearchParams) {
  const defaultTo = todayIn(DEFAULT_TIMEZONE);
  const requestedTo = params.get('to');
  const to =
    requestedTo &&
    reportRangeSchema.safeParse({ from: requestedTo, to: requestedTo, timeZone: DEFAULT_TIMEZONE })
      .success
      ? requestedTo
      : defaultTo;
  const candidate = {
    from: params.get('from') ?? addDays(to, -29),
    to,
    timeZone: DEFAULT_TIMEZONE,
  };
  const parsed = reportRangeSchema.safeParse(candidate);
  return parsed.success
    ? parsed.data
    : ({ from: addDays(defaultTo, -29), to: defaultTo, timeZone: DEFAULT_TIMEZONE } as const);
}

function PrintButton() {
  return (
    <div className="print:hidden">
      <Button variant="secondary" onClick={() => window.print()}>
        In hoặc lưu PDF
      </Button>
    </div>
  );
}

function rate(value: number | null) {
  return value === null ? 'Chưa có mẫu số' : `${value.toLocaleString('vi-VN')}%`;
}

function NumberCard({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-lg border border-border bg-bg p-4 shadow-card">
      <p className="text-sm text-muted">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-primary">
        {typeof value === 'number' ? value.toLocaleString('vi-VN') : value}
      </p>
    </div>
  );
}

function OverviewMetric({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string;
  value: number;
  icon: LucideIcon;
  tone: 'primary' | 'warning' | 'success' | 'accent';
}) {
  const iconClass = {
    primary: 'bg-info-surface text-primary',
    warning: 'bg-warning-surface text-warning',
    success: 'bg-success-surface text-success',
    accent: 'bg-accent text-on-accent',
  }[tone];
  return (
    <div className="flex min-h-28 items-center gap-4 rounded-xl border border-border border-l-4 border-l-accent bg-bg p-5 shadow-card">
      <span
        aria-hidden="true"
        className={`flex size-12 shrink-0 items-center justify-center rounded-lg ${iconClass}`}
      >
        <Icon size={24} strokeWidth={2} />
      </span>
      <div className="min-w-0">
        <p className="text-2xl font-bold text-primary">{value.toLocaleString('vi-VN')}</p>
        <p className="text-sm text-muted">{label}</p>
      </div>
    </div>
  );
}

function OverviewFunnel({ data }: { data: ConversionReport }) {
  const steps = [
    { label: 'Yêu cầu đã gửi', value: data.submittedRequests, tone: 'bg-primary' },
    { label: 'Đã xuất bản lớp', value: data.publishedClasses, tone: 'bg-primary-hover' },
    { label: 'Đã gán gia sư', value: data.assignedClasses, tone: 'bg-success' },
    { label: 'Đã hoàn tất', value: data.completedClasses, tone: 'bg-accent' },
  ];
  const maximum = Math.max(1, data.submittedRequests);
  return (
    <section
      className="rounded-xl border border-border bg-bg p-5 shadow-card"
      aria-labelledby="overview-funnel-title"
    >
      <h2 id="overview-funnel-title" className="text-xl font-semibold text-primary">
        Tiến độ chuyển đổi
      </h2>
      <p className="mt-1 text-sm text-muted">Số lượng thực tế của các yêu cầu được gửi trong kỳ.</p>
      <div className="mt-5 space-y-4">
        {steps.map((step) => (
          <div
            key={step.label}
            className="grid gap-2 sm:grid-cols-[11rem_minmax(0,1fr)_3rem] sm:items-center"
          >
            <span className="text-sm font-medium text-fg">{step.label}</span>
            <div className="h-3 overflow-hidden rounded-full bg-surface" aria-hidden="true">
              <div
                className={`h-full rounded-full ${step.tone}`}
                style={{ width: `${Math.min(100, (step.value / maximum) * 100)}%` }}
              />
            </div>
            <span className="text-sm font-semibold text-primary sm:text-right">
              {step.value.toLocaleString('vi-VN')}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

function Conversion({ data }: { data: ConversionReport }) {
  return (
    <section className="flex flex-col gap-4" aria-labelledby="conversion-title">
      <h2 id="conversion-title" className="text-lg font-semibold">
        Từ yêu cầu đến lớp hoàn tất
      </h2>
      <p className="text-sm text-muted">
        Nhóm yêu cầu được người học gửi trong kỳ; các bước tiếp theo được tính theo lịch sử của
        chính nhóm đó.
      </p>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <NumberCard label="Yêu cầu đã gửi" value={data.submittedRequests} />
        <NumberCard label="Đã xuất bản lớp" value={data.publishedClasses} />
        <NumberCard label="Đã gán gia sư" value={data.assignedClasses} />
        <NumberCard label="Đã hoàn tất" value={data.completedClasses} />
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <NumberCard label="Tỷ lệ xuất bản / yêu cầu" value={rate(data.publishRatePercent)} />
        <NumberCard label="Tỷ lệ gán / yêu cầu" value={rate(data.assignRatePercent)} />
        <NumberCard label="Tỷ lệ hoàn tất / yêu cầu" value={rate(data.completeRatePercent)} />
      </div>
      {data.submittedRequests === 0 && (
        <EmptyState
          title="Chưa có yêu cầu trong kỳ"
          description="Chọn khoảng ngày khác để xem chuyển đổi."
        />
      )}
    </section>
  );
}

function ConversionDetail({ data }: { data: ConversionReport }) {
  return (
    <section className="flex flex-col gap-6" aria-label="Báo cáo tỷ lệ chuyển đổi">
      <div className="rounded-2xl bg-gradient-to-r from-primary to-primary-gradient-end px-6 py-7 text-on-primary print:border print:border-border print:bg-bg print:text-fg">
        <h2 className="text-2xl font-semibold">Từ yêu cầu đến lớp hoàn tất</h2>
        <p className="mt-2 text-sm text-on-primary/90 print:text-fg">
          Theo dõi các bước xử lý của những yêu cầu người học đã gửi trong kỳ.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <OverviewMetric
          label="Yêu cầu đã gửi"
          value={data.submittedRequests}
          icon={Users}
          tone="primary"
        />
        <OverviewMetric
          label="Đã xuất bản lớp"
          value={data.publishedClasses}
          icon={FileText}
          tone="accent"
        />
        <OverviewMetric
          label="Đã gán gia sư"
          value={data.assignedClasses}
          icon={GraduationCap}
          tone="warning"
        />
        <OverviewMetric
          label="Đã hoàn tất"
          value={data.completedClasses}
          icon={CircleCheck}
          tone="success"
        />
      </div>
      {data.submittedRequests > 0 ? (
        <>
          <OverviewFunnel data={data} />
          <section
            className="rounded-xl border border-border bg-bg p-5 shadow-card"
            aria-labelledby="conversion-rates-title"
          >
            <h2
              id="conversion-rates-title"
              className="flex items-center gap-2 text-xl font-semibold text-primary"
            >
              <TrendingUp aria-hidden="true" className="size-5" />
              Tỷ lệ chuyển đổi
            </h2>
            <p className="mt-1 text-sm text-muted">
              Tỷ lệ của từng bước so với số yêu cầu đã gửi trong kỳ.
            </p>
            <div className="mt-5 grid gap-4 sm:grid-cols-3">
              <NumberCard label="Xuất bản / yêu cầu" value={rate(data.publishRatePercent)} />
              <NumberCard label="Gán gia sư / yêu cầu" value={rate(data.assignRatePercent)} />
              <NumberCard label="Hoàn tất / yêu cầu" value={rate(data.completeRatePercent)} />
            </div>
          </section>
        </>
      ) : (
        <EmptyState
          title="Chưa có yêu cầu trong kỳ"
          description="Chọn khoảng ngày khác để xem chuyển đổi."
        />
      )}
      <Alert tone="info">
        Mỗi yêu cầu được tính theo lần gửi đầu tiên trong kỳ. Các bước tiếp theo dựa trên lịch sử
        của chính nhóm yêu cầu đó.
      </Alert>
    </section>
  );
}

function ReportLayout({
  kind,
  children,
}: {
  kind: ReportKind;
  children: (range: ReturnType<typeof rangeFromParams>, page: number) => ReactNode;
}) {
  const [params, setParams] = useSearchParams();
  const range = rangeFromParams(params);
  const [fromText, setFromText] = useState(range.from);
  const [toText, setToText] = useState(range.to);
  const [error, setError] = useState('');
  const rawPage = Number(params.get('page') ?? 1);
  const page = Number.isSafeInteger(rawPage) && rawPage >= 1 && rawPage <= 1000 ? rawPage : 1;
  const heading: Record<ReportKind, { title: string; description: string }> = {
    overview: {
      title: 'Tổng quan hệ thống',
      description: 'Số liệu tổng hợp từ yêu cầu, lớp và đơn nhận lớp đã lưu trong D1.',
    },
    conversion: {
      title: 'Báo cáo tỷ lệ chuyển đổi',
      description: 'Phân tích hiệu suất chuyển đổi từ yêu cầu đến hoàn tất',
    },
    'no-tutor': {
      title: 'Báo cáo lớp chưa có gia sư',
      description: 'Theo dõi các lớp học đang chờ phân công gia sư',
    },
    revenue: {
      title: 'Báo cáo doanh thu theo dịch vụ',
      description: 'Theo dõi tình trạng dữ liệu doanh thu được xác minh',
    },
  };

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = reportRangeSchema.safeParse({
      from: fromText,
      to: toText,
      timeZone: DEFAULT_TIMEZONE,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Khoảng ngày không hợp lệ.');
      return;
    }
    setError('');
    setParams({ from: parsed.data.from, to: parsed.data.to });
  }

  return (
    <section className="report-print flex min-w-0 flex-col gap-6">
      <PageHeader title={heading[kind].title} description={heading[kind].description} />
      <nav aria-label="Loại báo cáo" className="flex flex-wrap gap-2 print:hidden">
        {NAV.map((item) => (
          <Link
            key={item.kind}
            to={`${item.to}${toQuery({ from: range.from, to: range.to })}`}
            aria-current={kind === item.kind ? 'page' : undefined}
            className={`rounded-md border px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-focus ${kind === item.kind ? 'border-primary bg-info-surface text-primary' : 'border-border text-fg'}`}
          >
            {item.label}
          </Link>
        ))}
      </nav>
      <form onSubmit={submit} className="flex flex-wrap items-end gap-3 print:hidden">
        <TextField
          label="Từ ngày"
          type="date"
          value={fromText}
          onChange={(event) => setFromText(event.target.value)}
          required
        />
        <TextField
          label="Đến ngày"
          type="date"
          value={toText}
          onChange={(event) => setToText(event.target.value)}
          required
        />
        <Button type="submit">Áp dụng</Button>
      </form>
      {error && <Alert tone="danger">{error}</Alert>}
      <p className="text-sm text-muted">
        Kỳ báo cáo: {range.from} đến {range.to} · Múi giờ {range.timeZone}
      </p>
      {children(range, page)}
    </section>
  );
}

export function AdminReportsOverviewPage() {
  return <ReportLayout kind="overview">{(range) => <OverviewData range={range} />}</ReportLayout>;
}

function OverviewData({ range }: { range: ReturnType<typeof rangeFromParams> }) {
  const report = useQuery({
    queryKey: ['admin-report-overview', range.from, range.to],
    queryFn: ({ signal }) =>
      api.get<AdminReportOverview>(`/admin/reports/overview${toQuery(range)}`, { signal }),
  });
  if (report.isPending) return <PageLoading label="Đang tải báo cáo…" />;
  if (report.isError)
    return (
      <Alert
        tone="danger"
        action={
          <Button variant="secondary" onClick={() => void report.refetch()}>
            Thử lại
          </Button>
        }
      >
        {report.error.message}
      </Alert>
    );
  return (
    <>
      <div className="rounded-2xl bg-gradient-to-r from-primary to-primary-gradient-end px-6 py-7 text-on-primary print:border print:border-border print:bg-bg print:text-fg">
        <h2 className="text-2xl font-semibold">Theo dõi lớp học</h2>
        <p className="mt-2 text-sm text-on-primary/90 print:text-fg">
          Các chỉ số dưới đây lấy từ lớp học và yêu cầu đã lưu trong hệ thống.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <OverviewMetric
          label="Lớp đang tuyển"
          value={report.data.openClasses}
          icon={GraduationCap}
          tone="primary"
        />
        <OverviewMetric
          label="Chưa có đơn ứng tuyển"
          value={report.data.openWithoutApplications}
          icon={Users}
          tone="warning"
        />
        <OverviewMetric
          label="Lớp hoạt động"
          value={report.data.activeClasses}
          icon={ClipboardList}
          tone="accent"
        />
        <OverviewMetric
          label="Lớp hoàn tất"
          value={report.data.completedClasses}
          icon={CircleCheck}
          tone="success"
        />
      </div>
      {report.data.conversion.submittedRequests > 0 && (
        <OverviewFunnel data={report.data.conversion} />
      )}
      <Conversion data={report.data.conversion} />
      <Alert tone="info">
        Doanh thu chưa có nguồn thanh toán hoặc chứng từ được xác minh; báo cáo không tính tiền từ
        lựa chọn phí của gia sư.
      </Alert>
      <PrintButton />
    </>
  );
}

export function AdminConversionPage() {
  return (
    <ReportLayout kind="conversion">{(range) => <ConversionData range={range} />}</ReportLayout>
  );
}

function ConversionData({ range }: { range: ReturnType<typeof rangeFromParams> }) {
  const report = useQuery({
    queryKey: ['admin-report-conversion', range.from, range.to],
    queryFn: ({ signal }) =>
      api.get<ConversionReport>(`/admin/reports/conversion${toQuery(range)}`, { signal }),
  });
  if (report.isPending) return <PageLoading label="Đang tải chuyển đổi…" />;
  if (report.isError)
    return (
      <Alert
        tone="danger"
        action={
          <Button variant="secondary" onClick={() => void report.refetch()}>
            Thử lại
          </Button>
        }
      >
        {report.error.message}
      </Alert>
    );
  return (
    <>
      <ConversionDetail data={report.data} />
      <PrintButton />
    </>
  );
}

export function AdminNoTutorPage() {
  return (
    <ReportLayout kind="no-tutor">
      {(range, page) => <NoTutorData range={range} page={page} />}
    </ReportLayout>
  );
}

function NoTutorData({ range, page }: { range: ReturnType<typeof rangeFromParams>; page: number }) {
  const [, setParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const [mode, setMode] = useState<'' | 'online' | 'offline'>('');
  const [applications, setApplications] = useState<'' | 'none' | 'some'>('');
  const report = useQuery({
    queryKey: ['admin-report-no-tutor', range.from, range.to, page],
    queryFn: ({ signal }) =>
      api.get<Page<NoTutorClass>>(`/admin/reports/no-tutor${toQuery({ ...range, page })}`, {
        signal,
      }),
    placeholderData: keepPreviousData,
  });
  if (report.isPending) return <PageLoading label="Đang tải lớp thiếu gia sư…" />;
  if (report.isError)
    return (
      <Alert
        tone="danger"
        action={
          <Button variant="secondary" onClick={() => void report.refetch()}>
            Thử lại
          </Button>
        }
      >
        {report.error.message}
      </Alert>
    );
  const searchTerm = search.trim().toLocaleLowerCase('vi-VN');
  const visibleItems = report.data.items.filter(
    (item) =>
      (!mode || item.mode === mode) &&
      (!applications ||
        (applications === 'none'
          ? item.submittedApplicationCount === 0
          : item.submittedApplicationCount > 0)) &&
      [item.code, item.subjectName, item.grade, item.publicArea ?? ''].some((value) =>
        value.toLocaleLowerCase('vi-VN').includes(searchTerm),
      ),
  );
  return (
    <section className="flex flex-col gap-6" aria-labelledby="no-tutor-title">
      <div className="rounded-2xl bg-gradient-to-r from-primary to-primary-gradient-end px-6 py-7 text-on-primary print:border print:border-border print:bg-bg print:text-fg">
        <h2 id="no-tutor-title" className="text-2xl font-semibold">
          Lớp đang chờ gia sư
        </h2>
        <p className="mt-2 text-sm text-on-primary/90 print:text-fg">
          Các lớp đang tuyển được xuất bản trong kỳ đã chọn.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <OverviewMetric
          label="Tổng lớp trong kỳ"
          value={report.data.total}
          icon={GraduationCap}
          tone="primary"
        />
        <OverviewMetric
          label="Chưa có đơn trong trang"
          value={report.data.items.filter((item) => item.submittedApplicationCount === 0).length}
          icon={Users}
          tone="warning"
        />
        <OverviewMetric
          label="Đơn chờ xét trong trang"
          value={report.data.items.reduce((sum, item) => sum + item.submittedApplicationCount, 0)}
          icon={ClipboardList}
          tone="accent"
        />
      </div>
      <div className="rounded-xl border border-border bg-bg p-5 shadow-card print:hidden">
        <h3 className="flex items-center gap-2 font-semibold text-primary">
          <Filter aria-hidden="true" className="size-5" /> Bộ lọc
        </h3>
        <p className="mt-1 text-xs text-muted">
          Các bộ lọc bên dưới chỉ áp dụng cho trang đang xem.
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <div className="relative">
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute right-3 top-9 size-4 text-muted"
            />
            <TextField
              label="Tìm trong trang hiện tại"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Mã, môn, lớp hoặc khu vực"
            />
          </div>
          <SelectField
            label="Hình thức"
            value={mode}
            onChange={(event) => setMode(event.target.value as typeof mode)}
          >
            <option value="">Tất cả</option>
            <option value="online">Trực tuyến</option>
            <option value="offline">Trực tiếp</option>
          </SelectField>
          <SelectField
            label="Đơn ứng tuyển"
            value={applications}
            onChange={(event) => setApplications(event.target.value as typeof applications)}
          >
            <option value="">Tất cả</option>
            <option value="none">Chưa có đơn</option>
            <option value="some">Có đơn chờ xét</option>
          </SelectField>
        </div>
      </div>
      <div className="flex flex-wrap items-end justify-between gap-2">
        <h3 className="text-xl font-semibold text-primary">Danh sách lớp</h3>
        <p className="text-sm text-muted">
          {report.data.total} lớp · Trang {report.data.page}
        </p>
      </div>
      {report.data.items.length === 0 ? (
        <EmptyState
          title="Không có lớp đang tuyển trong kỳ"
          description="Thử chọn khoảng ngày khác."
        />
      ) : visibleItems.length === 0 ? (
        <EmptyState
          title="Không tìm thấy lớp trong trang này"
          description="Thử thay đổi bộ lọc hoặc chuyển trang."
          action={
            <Button
              variant="secondary"
              onClick={() => {
                setSearch('');
                setMode('');
                setApplications('');
              }}
            >
              Xóa bộ lọc
            </Button>
          }
        />
      ) : (
        <ul className="grid gap-4 lg:grid-cols-2">
          {visibleItems.map((item) => (
            <li
              key={item.id}
              className="rounded-xl border border-border border-l-4 border-l-warning bg-bg p-5 shadow-card"
            >
              <p className="font-mono text-xs text-muted">{item.code}</p>
              <p className="mt-1 break-words text-lg font-semibold text-primary">
                {item.subjectName} · {item.grade}
              </p>
              <div className="mt-4 space-y-2 text-sm text-muted">
                <p className="flex items-center gap-2">
                  <MapPin aria-hidden="true" className="size-4 shrink-0" />
                  {item.mode === 'online'
                    ? 'Trực tuyến'
                    : `Trực tiếp · ${item.publicArea ?? 'Chưa có khu vực'}`}
                </p>
                <p className="flex items-center gap-2">
                  <FileText aria-hidden="true" className="size-4 shrink-0" />
                  Xuất bản{' '}
                  {new Date(item.publishedAt).toLocaleDateString('vi-VN', {
                    timeZone: DEFAULT_TIMEZONE,
                  })}
                </p>
                <p className="flex items-center gap-2 font-medium text-fg">
                  <ClipboardList aria-hidden="true" className="size-4 shrink-0 text-primary" />
                  {item.submittedApplicationCount} đơn đang chờ xem xét
                </p>
              </div>
              <Link
                className="mt-4 inline-flex min-h-11 items-center rounded-lg border border-border-strong px-4 text-sm font-medium text-primary hover:bg-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus print:hidden"
                to={`/admin/applications?classId=${encodeURIComponent(item.id)}`}
              >
                Xem đơn của lớp
              </Link>
            </li>
          ))}
        </ul>
      )}
      {report.data.total > report.data.pageSize && (
        <nav
          aria-label="Trang lớp thiếu gia sư"
          className="flex flex-wrap items-center gap-3 print:hidden"
        >
          <Button
            variant="secondary"
            disabled={page <= 1}
            onClick={() =>
              setParams({
                from: range.from,
                to: range.to,
                ...(page > 2 ? { page: String(page - 1) } : {}),
              })
            }
          >
            Trang trước
          </Button>
          <span className="text-sm text-muted">
            Trang {page} / {Math.max(1, Math.ceil(report.data.total / report.data.pageSize))}
          </span>
          <Button
            variant="secondary"
            disabled={page * report.data.pageSize >= report.data.total}
            onClick={() => setParams({ from: range.from, to: range.to, page: String(page + 1) })}
          >
            Trang sau
          </Button>
        </nav>
      )}
      <PrintButton />
    </section>
  );
}

export function AdminRevenuePage() {
  return <ReportLayout kind="revenue">{(range) => <RevenueData range={range} />}</ReportLayout>;
}

function RevenueData({ range }: { range: ReturnType<typeof rangeFromParams> }) {
  const report = useQuery({
    queryKey: ['admin-report-revenue', range.from, range.to],
    queryFn: ({ signal }) =>
      api.get<RevenueReport>(`/admin/reports/revenue${toQuery(range)}`, { signal }),
  });
  if (report.isPending) return <PageLoading label="Đang kiểm tra nguồn doanh thu…" />;
  if (report.isError)
    return (
      <Alert
        tone="danger"
        action={
          <Button variant="secondary" onClick={() => void report.refetch()}>
            Thử lại
          </Button>
        }
      >
        {report.error.message}
      </Alert>
    );
  return (
    <>
      <div className="rounded-2xl bg-gradient-to-r from-primary to-primary-gradient-end px-6 py-7 text-on-primary print:border print:border-border print:bg-bg print:text-fg">
        <h2 className="text-2xl font-semibold">Doanh thu theo dịch vụ</h2>
        <p className="mt-2 text-sm text-on-primary/90 print:text-fg">
          Báo cáo chỉ hiển thị số tiền khi có nguồn thanh toán và chứng từ đối soát được xác minh.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-3" aria-label="Các chỉ số doanh thu chưa có dữ liệu">
        {['Tổng doanh thu', 'Doanh thu theo dịch vụ', 'Giá trị trung bình mỗi khách hàng'].map(
          (label) => (
            <div key={label} className="rounded-xl border border-border bg-bg p-5 shadow-card">
              <p className="text-sm font-medium text-muted">{label}</p>
              <p className="mt-2 text-3xl font-bold text-primary" aria-label="Chưa có dữ liệu">
                —
              </p>
              <p className="mt-1 text-xs text-muted">Chưa có số liệu xác minh</p>
            </div>
          ),
        )}
      </div>
      <div className="rounded-xl border border-border bg-bg p-5 shadow-card">
        <EmptyState
          title="Chưa có dữ liệu doanh thu được xác minh"
          description="Chưa tích hợp thanh toán và chứng từ đối soát. Phương án phí gia sư đã chọn không được tính là doanh thu."
        />
      </div>
      <PrintButton />
    </>
  );
}
