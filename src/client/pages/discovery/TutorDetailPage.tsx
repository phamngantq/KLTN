import { useState } from 'react';
import { useParams } from 'react-router';
import type { Booking } from '../../../shared/schemas/bookings';
import { BookingCreatedNotice, BookingRequest } from '../../components/domain/BookingRequest';
import { SlotPicker, type SelectedSlot } from '../../components/domain/SlotPicker';
import { teachingModes, TutorAvatar } from '../../components/domain/TutorCard';
import { Button, ButtonLink } from '../../components/ui/Button';
import { Alert, Badge, EmptyState } from '../../components/ui/Feedback';
import { PageLoading } from '../../components/ui/Spinner';
import { useTutor } from '../../features/discovery/api';
import { isApiError } from '../../lib/api-client';
import { formatVnd } from '../../lib/format';

export function TutorDetailPage() {
  const { slug = '' } = useParams();
  const tutor = useTutor(slug);
  const [selected, setSelected] = useState<SelectedSlot | null>(null);
  const [booked, setBooked] = useState<{ booking: Booking; timezone: string } | null>(null);
  const [slotLost, setSlotLost] = useState(false);

  if (tutor.isPending) return <PageLoading />;
  if (tutor.isError) {
    if (isApiError(tutor.error, 'TUTOR_NOT_FOUND')) {
      return (
        <EmptyState
          title="Không tìm thấy gia sư"
          description="Hồ sơ không tồn tại hoặc chưa được công khai."
          action={<ButtonLink to="/tutors">Xem danh sách gia sư</ButtonLink>}
        />
      );
    }
    return (
      <Alert
        tone="danger"
        title="Không tải được hồ sơ"
        action={
          <Button variant="secondary" onClick={() => void tutor.refetch()}>
            Thử lại
          </Button>
        }
      >
        {tutor.error.message}
      </Alert>
    );
  }

  const data = tutor.data;
  return (
    <article className="flex flex-col gap-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <TutorAvatar name={data.displayName} size="lg" />
        <div className="flex flex-col gap-1">
          <h1 className="text-[length:var(--text-heading)] font-bold">{data.displayName}</h1>
          <p className="text-muted">{teachingModes(data)}</p>
          <p className="text-lg font-semibold">
            {formatVnd(data.hourlyRateMinor)}
            <span className="text-sm font-normal text-muted"> /giờ</span>
          </p>
        </div>
      </header>
      <section aria-labelledby="subjects-heading" className="flex flex-col gap-2">
        <h2 id="subjects-heading" className="font-semibold">
          Môn dạy
        </h2>
        <ul className="flex flex-wrap gap-2">
          {data.subjects.map((subject) => (
            <li key={subject.id}>
              <Badge tone="info">{subject.name}</Badge>
            </li>
          ))}
        </ul>
      </section>
      <section aria-labelledby="bio-heading" className="flex flex-col gap-2">
        <h2 id="bio-heading" className="font-semibold">
          Giới thiệu
        </h2>
        <p className="max-w-prose whitespace-pre-line text-fg">{data.bio}</p>
      </section>
      <SlotPicker
        tutorId={data.id}
        selected={selected}
        onSelect={(slot) => {
          setBooked(null);
          setSlotLost(false);
          setSelected(slot);
        }}
      />
      {booked && <BookingCreatedNotice booking={booked.booking} timezone={booked.timezone} />}
      {slotLost && (
        <Alert tone="danger" title="Chưa đặt được lịch">
          Khung giờ bạn chọn vừa được người khác đặt hoặc không còn trống. Lịch trống đã được tải
          lại — vui lòng chọn giờ khác.
        </Alert>
      )}
      {selected && (
        <BookingRequest
          tutor={data}
          selected={selected}
          onBooked={(booking) => {
            setBooked({ booking, timezone: selected.timezone });
            setSelected(null);
          }}
          onSlotLost={() => {
            setSelected(null);
            setSlotLost(true);
          }}
        />
      )}
    </article>
  );
}
