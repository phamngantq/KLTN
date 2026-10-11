import { Clock3, Eye, MapPin, Wallet } from 'lucide-react';
import { Link } from 'react-router';
import type { ClassRecommendation, PublicClass } from '../../features/classes/api';
import { formatDate, formatVnd, WEEKDAY_LABELS } from '../../lib/format';
import { Badge } from '../ui/Feedback';
import { MatchExplanation } from './MatchExplanation';

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

export function ClassCard({
  item,
  detailPath,
  match,
}: {
  item: PublicClass;
  detailPath: string;
  match?: ClassRecommendation['match'];
}) {
  return (
    <article className="flex h-full min-w-0 flex-col rounded-xl border border-primary/20 bg-bg p-5 shadow-card transition-all hover:-translate-y-1 hover:shadow-lg motion-reduce:transform-none motion-reduce:transition-none">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <span className="inline-flex max-w-full items-center rounded-md bg-accent px-2.5 py-1 text-xs font-semibold text-on-accent">
          {item.subjectName}
        </span>
        <Badge tone="success">Đang tìm gia sư</Badge>
      </div>
      <p className="mt-3 text-xs font-semibold text-muted">Mã lớp {item.code}</p>
      <h2 className="mt-1 min-h-14 break-words text-lg font-semibold text-primary">
        {item.subjectName} · {item.grade}
      </h2>
      {match && <MatchExplanation match={match} compact />}
      <dl className="mt-4 flex flex-1 flex-col gap-3 text-sm">
        <div className="flex items-start gap-2">
          <MapPin aria-hidden="true" size={18} className="mt-0.5 shrink-0 text-warning" />
          <div className="min-w-0">
            <dt className="sr-only">Khu vực</dt>
            <dd className="break-words text-fg">
              {item.mode === 'online' ? 'Học trực tuyến' : item.publicArea || 'Chưa công bố'}
            </dd>
          </div>
        </div>
        <div className="flex items-start gap-2">
          <Clock3 aria-hidden="true" size={18} className="mt-0.5 shrink-0 text-warning" />
          <div className="min-w-0">
            <dt className="sr-only">Lịch mong muốn</dt>
            <dd className="break-words text-fg">{classScheduleText(item)}</dd>
          </div>
        </div>
        {item.expectedBudgetMinor !== null && (
          <div className="flex items-start gap-2">
            <Wallet aria-hidden="true" size={18} className="mt-0.5 shrink-0 text-warning" />
            <div className="min-w-0">
              <dt className="text-xs text-muted">Học phí dự kiến</dt>
              <dd className="font-semibold text-primary">{formatVnd(item.expectedBudgetMinor)}</dd>
            </div>
          </div>
        )}
      </dl>
      <div className="mt-4">
        <Badge tone="info">{item.mode === 'online' ? 'Trực tuyến' : 'Trực tiếp'}</Badge>
      </div>
      <div className="mt-4 flex flex-col gap-3 border-t border-border pt-4">
        <Link
          to={detailPath}
          className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-md border border-primary px-3 text-sm font-semibold text-primary transition-colors hover:bg-primary hover:text-on-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        >
          <Eye aria-hidden="true" size={16} />
          Xem chi tiết
        </Link>
        <p className="text-xs text-muted">
          {item.publishedAt
            ? `Công bố ${formatDate(item.publishedAt, 'Asia/Ho_Chi_Minh')}`
            : 'Chưa công bố'}
        </p>
      </div>
    </article>
  );
}
