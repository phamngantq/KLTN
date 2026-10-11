import { keepPreviousData, useQuery } from '@tanstack/react-query';
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
import { TextField } from '../../components/ui/Field';
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

function Conversion({ data }: { data: ConversionReport }) {
  return (
    <section className="flex flex-col gap-4" aria-labelledby="conversion-title">
      <h2 id="conversion-title" className="text-lg font-semibold">
        Từ yêu cầu đến lớp hoàn tất
      </h2>
      <p className="text-sm text-muted">
        Nhóm yêu cầu được phụ huynh gửi trong kỳ; các bước tiếp theo được tính theo lịch sử của
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
      <PageHeader
        title="Báo cáo hệ thống"
        description="Số liệu tổng hợp từ yêu cầu, lớp và đơn nhận lớp đã lưu trong D1."
      />
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
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <NumberCard label="Lớp đang tuyển" value={report.data.openClasses} />
        <NumberCard label="Chưa có đơn ứng tuyển" value={report.data.openWithoutApplications} />
        <NumberCard label="Lớp hoạt động" value={report.data.activeClasses} />
        <NumberCard label="Lớp hoàn tất" value={report.data.completedClasses} />
      </div>
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
      <Conversion data={report.data} />
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
  if (report.data.items.length === 0)
    return (
      <>
        <EmptyState
          title="Không có lớp đang tuyển trong kỳ"
          description="Thử chọn khoảng ngày khác."
        />
        <PrintButton />
      </>
    );
  return (
    <section className="flex flex-col gap-4" aria-labelledby="no-tutor-title">
      <h2 id="no-tutor-title" className="text-lg font-semibold">
        Lớp đang chờ gia sư
      </h2>
      <p className="text-sm text-muted">
        {report.data.total} lớp · Trang {report.data.page}
      </p>
      <ul className="grid gap-3">
        {report.data.items.map((item) => (
          <li key={item.id} className="rounded-lg border border-border bg-bg p-4">
            <p className="font-semibold text-primary">
              {item.code} · {item.subjectName} · {item.grade}
            </p>
            <p className="mt-1 text-sm text-muted">
              {item.mode === 'online' ? 'Trực tuyến' : `Trực tiếp · ${item.publicArea ?? ''}`} ·
              Xuất bản{' '}
              {new Date(item.publishedAt).toLocaleDateString('vi-VN', {
                timeZone: DEFAULT_TIMEZONE,
              })}
            </p>
            <p className="mt-1 text-sm">{item.submittedApplicationCount} đơn đang chờ xem xét</p>
            <Link
              className="mt-2 inline-block text-sm text-primary underline print:hidden"
              to={`/admin/applications?classId=${encodeURIComponent(item.id)}`}
            >
              Xem đơn của lớp
            </Link>
          </li>
        ))}
      </ul>
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
      <EmptyState
        title="Chưa có dữ liệu doanh thu được xác minh"
        description="Chưa tích hợp thanh toán và chứng từ đối soát. Phương án phí gia sư đã chọn không được tính là doanh thu."
      />
      <PrintButton />
    </>
  );
}
