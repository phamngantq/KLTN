import {
  BOOKING_STATUS_LABELS,
  type BookingAction,
  type BookingStatus,
  type BookingWithActions,
} from '../../../shared/schemas/bookings';
import { formatDate, formatTimeRange, formatVnd } from '../../lib/format';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Feedback';

const STATUS_TONE: Record<BookingStatus, 'info' | 'success' | 'neutral' | 'danger' | 'warning'> = {
  PENDING: 'warning',
  CONFIRMED: 'success',
  COMPLETED: 'info',
  REJECTED: 'danger',
  CANCELLED: 'neutral',
  EXPIRED: 'neutral',
};

export function BookingStatusBadge({ status }: { status: BookingStatus }) {
  return <Badge tone={STATUS_TONE[status]}>{BOOKING_STATUS_LABELS[status]}</Badge>;
}

export const ACTION_LABELS: Record<BookingAction, string> = {
  confirm: 'Xác nhận',
  reject: 'Từ chối',
  cancel: 'Hủy buổi học',
  complete: 'Đánh dấu hoàn thành',
};

const ACTION_VARIANT: Record<BookingAction, 'primary' | 'secondary' | 'danger'> = {
  confirm: 'primary',
  complete: 'primary',
  reject: 'danger',
  cancel: 'secondary',
};

interface BookingCardProps {
  booking: BookingWithActions;
  viewer: 'student' | 'tutor';
  timeZone: string;
  busyAction: BookingAction | null;
  onAction: (action: BookingAction) => void;
}

export function BookingCard({ booking, viewer, timeZone, busyAction, onAction }: BookingCardProps) {
  const counterpart =
    viewer === 'student' ? `Gia sư: ${booking.tutorName}` : `Học viên: ${booking.studentName}`;
  return (
    <article className="flex flex-col gap-3 rounded-lg border border-border bg-bg p-4 shadow-card sm:flex-row sm:items-center">
      <div className="flex flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-semibold capitalize">{formatDate(booking.startsAtUtc, timeZone)}</h3>
          <BookingStatusBadge status={booking.status} />
        </div>
        <p>
          {formatTimeRange(booking.startsAtUtc, booking.endsAtUtc, timeZone)} ·{' '}
          {booking.durationMinutes} phút · {formatVnd(booking.priceMinor)}
        </p>
        <p className="text-sm text-muted">
          {counterpart} · Mã {booking.id.slice(0, 8).toUpperCase()}
        </p>
      </div>
      {booking.allowedActions.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {booking.allowedActions.map((action) => (
            <Button
              key={action}
              size="sm"
              variant={ACTION_VARIANT[action]}
              loading={busyAction === action}
              disabled={busyAction !== null}
              onClick={() => onAction(action)}
            >
              {ACTION_LABELS[action]}
            </Button>
          ))}
        </div>
      )}
    </article>
  );
}
