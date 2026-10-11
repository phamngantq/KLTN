import { useState } from 'react';
import {
  BOOKING_DURATIONS,
  SLOT_HORIZON_DAYS,
  type BookingDuration,
  type Slot,
} from '../../../shared/schemas/availability';
import { addDays, utcToLocal } from '../../../shared/time';
import { useSlots } from '../../features/slots/api';
import { formatDate, formatTimeRange } from '../../lib/format';
import { Button } from '../ui/Button';
import { Alert, EmptyState } from '../ui/Feedback';
import { SelectField } from '../ui/Field';
import { PageLoading } from '../ui/Spinner';

export interface SelectedSlot extends Slot {
  duration: BookingDuration;
  timezone: string;
}

interface SlotPickerProps {
  tutorId: string;
  selected: SelectedSlot | null;
  onSelect: (slot: SelectedSlot | null) => void;
}

/** Availability comes from the API and may change before submit; the server re-checks on booking. */
export function SlotPicker({ tutorId, selected, onSelect }: SlotPickerProps) {
  const [duration, setDuration] = useState<BookingDuration>(60);
  const [from, setFrom] = useState<string | undefined>(undefined);
  const [today, setToday] = useState<string | null>(null);
  const query = useSlots(tutorId, from, duration);
  const data = query.data;

  // The first response (no explicit `from`) tells us "today" in the tutor's timezone.
  if (data && from === undefined && today !== data.from) setToday(data.from);

  const horizonEnd = today ? addDays(today, SLOT_HORIZON_DAYS) : null;
  const canGoBack = Boolean(data && today && data.from > today);
  const canGoForward = Boolean(data && horizonEnd && data.to < horizonEnd);

  const byDate = new Map<string, Slot[]>();
  if (data) {
    for (const slot of data.slots) {
      const { date } = utcToLocal(Date.parse(slot.startUtc), data.timezone);
      byDate.set(date, [...(byDate.get(date) ?? []), slot]);
    }
  }

  return (
    <section aria-labelledby="slots-heading" className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 id="slots-heading" className="text-lg font-semibold">
          Lịch trống
        </h2>
        {data && (
          <p className="text-sm text-muted">
            Giờ hiển thị theo múi giờ của gia sư: <strong>{data.timezone}</strong>. Lịch có thể thay
            đổi cho tới khi bạn gửi yêu cầu.
          </p>
        )}
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-44">
          <SelectField
            label="Thời lượng"
            value={duration}
            onChange={(e) => {
              setDuration(Number(e.target.value) as BookingDuration);
              onSelect(null);
            }}
          >
            {BOOKING_DURATIONS.map((d) => (
              <option key={d} value={d}>
                {d} phút
              </option>
            ))}
          </SelectField>
        </div>
        <Button
          variant="secondary"
          disabled={!canGoBack || query.isFetching}
          onClick={() =>
            data &&
            today &&
            setFrom(addDays(data.from, -7) < today ? today : addDays(data.from, -7))
          }
        >
          ← Tuần trước
        </Button>
        <Button
          variant="secondary"
          disabled={!canGoForward || query.isFetching}
          onClick={() => data && setFrom(addDays(data.to, 1))}
        >
          Tuần sau →
        </Button>
      </div>

      <div aria-live="polite" aria-busy={query.isFetching}>
        {query.isPending ? (
          <PageLoading label="Đang tải lịch trống…" />
        ) : query.isError ? (
          <Alert
            tone="danger"
            title="Không tải được lịch trống"
            action={
              <Button variant="secondary" onClick={() => void query.refetch()}>
                Thử lại
              </Button>
            }
          >
            {query.error.message}
          </Alert>
        ) : byDate.size === 0 ? (
          <EmptyState
            title="Không còn khung giờ trống trong khoảng này"
            description={
              canGoForward
                ? 'Hãy xem tuần sau hoặc chọn thời lượng ngắn hơn.'
                : 'Hãy chọn thời lượng ngắn hơn.'
            }
          />
        ) : (
          <ol className="flex flex-col gap-4">
            {[...byDate.entries()].map(([date, slots]) => (
              <li key={date} className="flex flex-col gap-2">
                <h3 className="font-medium capitalize">
                  {formatDate(slots[0]!.startUtc, data!.timezone)}
                </h3>
                <ul className="flex flex-wrap gap-2">
                  {slots.map((slot) => {
                    const isSelected =
                      selected?.startUtc === slot.startUtc && selected.duration === duration;
                    const label = formatTimeRange(slot.startUtc, slot.endUtc, data!.timezone);
                    return (
                      <li key={slot.startUtc}>
                        <Button
                          size="sm"
                          variant={isSelected ? 'primary' : 'secondary'}
                          aria-pressed={isSelected}
                          onClick={() =>
                            onSelect(
                              isSelected ? null : { ...slot, duration, timezone: data!.timezone },
                            )
                          }
                        >
                          {label}
                        </Button>
                      </li>
                    );
                  })}
                </ul>
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  );
}
