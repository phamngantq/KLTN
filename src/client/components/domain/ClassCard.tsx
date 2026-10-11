import { Link } from 'react-router';
import type { PublicClass } from '../../features/classes/api';
import { formatDate, formatVnd, WEEKDAY_LABELS } from '../../lib/format';
import { Badge } from '../ui/Feedback';

export function classScheduleText(item: PublicClass): string {
  if (item.schedule.discussLater) return 'Trao đổi lịch sau';
  if (item.schedule.windows.length === 0) return 'Chưa có khung giờ';
  const windows = item.schedule.windows
    .slice(0, 2)
    .map(
      (window) =>
        `${WEEKDAY_LABELS[window.weekday] ?? `Ngày ${window.weekday}`} ${window.startLocal}–${window.endLocal}`,
    );
  return `${windows.join(', ')}${item.schedule.windows.length > 2 ? ` và ${item.schedule.windows.length - 2} khung khác` : ''}`;
}

export function ClassCard({ item, detailPath }: { item: PublicClass; detailPath: string }) {
  return (
    <article className="flex h-full min-w-0 flex-col gap-4 rounded-xl border border-border bg-bg p-5 shadow-card">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-muted">{item.code}</p>
          <h2 className="mt-1 break-words text-lg font-semibold text-primary">
            {item.subjectName} · {item.grade}
          </h2>
        </div>
        <Badge tone="success">Đang tìm gia sư</Badge>
      </div>

      <dl className="grid gap-2 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-muted">Hình thức</dt>
          <dd>{item.mode === 'online' ? 'Trực tuyến' : 'Trực tiếp'}</dd>
        </div>
        <div>
          <dt className="text-muted">Khu vực</dt>
          <dd>{item.mode === 'online' ? 'Học trực tuyến' : item.publicArea || 'Chưa công bố'}</dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="text-muted">Lịch mong muốn</dt>
          <dd>{classScheduleText(item)}</dd>
        </div>
        {item.expectedBudgetMinor !== null && (
          <div className="sm:col-span-2">
            <dt className="text-muted">Học phí dự kiến</dt>
            <dd className="font-semibold text-primary">{formatVnd(item.expectedBudgetMinor)}</dd>
          </div>
        )}
      </dl>

      <div className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
        <p className="text-xs text-muted">
          {item.publishedAt
            ? `Công bố ${formatDate(item.publishedAt, 'Asia/Ho_Chi_Minh')}`
            : 'Chưa công bố'}
        </p>
        <Link
          to={detailPath}
          className="inline-flex min-h-11 items-center rounded-md px-3 font-semibold text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        >
          Xem chi tiết
        </Link>
      </div>
    </article>
  );
}
