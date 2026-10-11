import { useState } from 'react';
import { useLocation } from 'react-router';
import type { PublicTutor } from '../../../shared/schemas/discovery';
import {
  BOOKING_STATUS_LABELS,
  CANCELLATION_POLICY,
  type Booking,
} from '../../../shared/schemas/bookings';
import { useSession } from '../../app/auth';
import { useCreateBooking } from '../../features/bookings/api';
import { isApiError } from '../../lib/api-client';
import { formatDate, formatTimeRange, formatVnd } from '../../lib/format';
import { Button, ButtonLink } from '../ui/Button';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { Alert } from '../ui/Feedback';
import type { SelectedSlot } from './SlotPicker';

interface BookingRequestProps {
  tutor: PublicTutor;
  selected: SelectedSlot;
  onBooked: (booking: Booking) => void;
  onSlotLost: () => void;
}

/** Step 1 summary → confirm (policy shown) → server result. Never shows success without a 201. */
export function BookingRequest({ tutor, selected, onBooked, onSlotLost }: BookingRequestProps) {
  const { user } = useSession();
  const location = useLocation();
  const create = useCreateBooking();
  const [confirming, setConfirming] = useState(false);
  const price = (tutor.hourlyRateMinor * selected.duration) / 60;
  const when = `${formatDate(selected.startUtc, selected.timezone)}, ${formatTimeRange(selected.startUtc, selected.endUtc, selected.timezone)}`;

  function submit() {
    create.mutate(
      { tutorId: tutor.id, startUtc: selected.startUtc, durationMinutes: selected.duration },
      {
        onSuccess: (booking) => {
          setConfirming(false);
          onBooked(booking);
        },
        onError: (error) => {
          setConfirming(false);
          if (isApiError(error, 'SLOT_UNAVAILABLE') || isApiError(error, 'SLOT_NOT_AVAILABLE'))
            onSlotLost();
        },
      },
    );
  }

  let action;
  if (!user) {
    const next = encodeURIComponent(`${location.pathname}${location.search}`);
    action = <ButtonLink to={`/sign-in?next=${next}`}>Đăng nhập để đặt lịch</ButtonLink>;
  } else if (user.role !== 'student') {
    action = <p className="text-sm text-muted">Chỉ tài khoản học viên mới có thể đặt lịch.</p>;
  } else {
    action = (
      <Button onClick={() => setConfirming(true)} loading={create.isPending}>
        Gửi yêu cầu đặt lịch
      </Button>
    );
  }

  return (
    <section
      aria-labelledby="selection-heading"
      className="sticky bottom-0 flex flex-col gap-3 rounded-lg border border-primary bg-bg p-4 shadow-card"
    >
      <h2 id="selection-heading" className="font-semibold">
        Khung giờ đã chọn
      </h2>
      <p>
        <span className="capitalize">{when}</span> ({selected.duration} phút)
      </p>
      <p>
        Học phí dự kiến: <strong>{formatVnd(price)}</strong>
      </p>
      {create.isError && (
        <Alert tone="danger" title="Chưa đặt được lịch">
          {isApiError(create.error, 'SLOT_UNAVAILABLE')
            ? 'Khung giờ này vừa được người khác đặt. Lịch trống đã được tải lại — vui lòng chọn giờ khác.'
            : create.error.message}
        </Alert>
      )}
      <div>{action}</div>
      <ConfirmDialog
        open={confirming}
        title="Xác nhận gửi yêu cầu đặt lịch"
        confirmLabel="Gửi yêu cầu"
        loading={create.isPending}
        onCancel={() => setConfirming(false)}
        onConfirm={submit}
        description={
          <div className="flex flex-col gap-2">
            <p>
              Gia sư: <strong>{tutor.displayName}</strong>
            </p>
            <p className="capitalize">{when}</p>
            <p>
              Thời lượng: {selected.duration} phút — Học phí: <strong>{formatVnd(price)}</strong>
            </p>
            <p className="text-muted">
              Yêu cầu sẽ ở trạng thái "{BOOKING_STATUS_LABELS.PENDING}" cho tới khi gia sư xác nhận.{' '}
              {CANCELLATION_POLICY}
            </p>
          </div>
        }
      />
    </section>
  );
}

export function BookingCreatedNotice({
  booking,
  timezone,
}: {
  booking: Booking;
  timezone: string;
}) {
  return (
    <Alert tone="success" title="Đã gửi yêu cầu đặt lịch">
      <p>
        Mã yêu cầu: <strong>{booking.id.slice(0, 8).toUpperCase()}</strong> — Trạng thái:{' '}
        <strong>{BOOKING_STATUS_LABELS[booking.status]}</strong>.
      </p>
      <p className="capitalize">
        {formatDate(booking.startsAtUtc, timezone)},{' '}
        {formatTimeRange(booking.startsAtUtc, booking.endsAtUtc, timezone)} —{' '}
        {formatVnd(booking.priceMinor)}
      </p>
      <p>Buổi học chỉ được tính là đã xác nhận khi gia sư chấp nhận yêu cầu.</p>
    </Alert>
  );
}
