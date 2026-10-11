import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import {
  CANCELLATION_POLICY,
  type BookingAction,
  type BookingWithActions,
} from '../../../shared/schemas/bookings';
import {
  BOOKING_TABS,
  useBookingAction,
  useBookings,
  type BookingTab,
} from '../../features/bookings/api';
import { formatDate, formatTimeRange } from '../../lib/format';
import { Button, ButtonLink } from '../ui/Button';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { Alert, EmptyState, PageHeader } from '../ui/Feedback';
import { Skeleton } from '../ui/Spinner';
import { ACTION_LABELS, BookingCard } from './BookingCard';

const CONFIRM_REQUIRED: BookingAction[] = ['cancel', 'reject'];

const EMPTY_TEXT: Record<BookingTab, string> = {
  pending: 'Không có yêu cầu nào đang chờ xác nhận.',
  confirmed: 'Chưa có buổi học nào được xác nhận.',
  completed: 'Chưa có buổi học hoàn thành.',
  cancelled: 'Không có buổi học bị hủy hoặc từ chối.',
};

function viewerTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
}

interface Props {
  viewer: 'student' | 'tutor';
  title: string;
  description: string;
}

/** Shared student/tutor dashboard. Data is fetched for the signed-in account only (server-scoped). */
export function BookingsDashboard({ viewer, title, description }: Props) {
  const [params, setParams] = useSearchParams();
  const tab = (BOOKING_TABS.find((t) => t.id === params.get('tab'))?.id ?? 'pending') as BookingTab;
  const page = Math.max(1, Number(params.get('page')) || 1);
  const bookings = useBookings(tab, page);
  const action = useBookingAction();
  const [pending, setPending] = useState<{
    booking: BookingWithActions;
    action: BookingAction;
  } | null>(null);
  const [notice, setNotice] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);
  const timeZone = viewerTimeZone();

  function run(booking: BookingWithActions, which: BookingAction) {
    setNotice(null);
    action.mutate(
      { id: booking.id, action: which },
      {
        onSuccess: () => {
          setPending(null);
          setNotice({
            tone: 'success',
            text: `${ACTION_LABELS[which]}: thành công. Trạng thái mới đã được cập nhật.`,
          });
        },
        onError: (error) => {
          setPending(null);
          setNotice({ tone: 'danger', text: error.message });
        },
      },
    );
  }

  function onAction(booking: BookingWithActions, which: BookingAction) {
    if (CONFIRM_REQUIRED.includes(which)) setPending({ booking, action: which });
    else run(booking, which);
  }

  const data = bookings.data;
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <section className="flex flex-col gap-4">
      <PageHeader
        title={title}
        description={description}
        actions={
          viewer === 'student' ? <ButtonLink to="/tutors">Tìm gia sư</ButtonLink> : undefined
        }
      />

      <nav aria-label="Lọc theo trạng thái" className="overflow-x-auto">
        <ul className="flex gap-1 border-b border-border">
          {BOOKING_TABS.map((t) => (
            <li key={t.id}>
              <Link
                to={`?tab=${t.id}`}
                aria-current={t.id === tab ? 'page' : undefined}
                className={`inline-flex min-h-11 items-center px-3 text-sm font-medium whitespace-nowrap focus-visible:outline-2 focus-visible:outline-focus ${
                  t.id === tab
                    ? 'border-b-2 border-primary text-primary'
                    : 'text-muted hover:text-fg'
                }`}
              >
                {t.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <p className="text-sm text-muted">Thời gian hiển thị theo múi giờ của bạn: {timeZone}.</p>
      {notice && <Alert tone={notice.tone}>{notice.text}</Alert>}

      <div aria-live="polite" aria-busy={bookings.isFetching}>
        {bookings.isPending ? (
          <ul className="flex flex-col gap-3" aria-label="Đang tải">
            {[0, 1, 2].map((i) => (
              <li key={i}>
                <Skeleton className="h-24" />
              </li>
            ))}
          </ul>
        ) : bookings.isError ? (
          <Alert
            tone="danger"
            title="Không tải được danh sách"
            action={
              <Button variant="secondary" onClick={() => void bookings.refetch()}>
                Thử lại
              </Button>
            }
          >
            {bookings.error.message}
          </Alert>
        ) : bookings.data.items.length === 0 ? (
          <EmptyState
            title={EMPTY_TEXT[tab]}
            action={
              viewer === 'student' && tab === 'pending' ? (
                <ButtonLink to="/tutors">Tìm gia sư</ButtonLink>
              ) : undefined
            }
          />
        ) : (
          <>
            <ul className="flex flex-col gap-3">
              {bookings.data.items.map((booking) => (
                <li key={booking.id}>
                  <BookingCard
                    booking={booking}
                    viewer={viewer}
                    timeZone={timeZone}
                    busyAction={
                      action.isPending && action.variables?.id === booking.id
                        ? action.variables.action
                        : null
                    }
                    onAction={(which) => onAction(booking, which)}
                  />
                </li>
              ))}
            </ul>
            {totalPages > 1 && (
              <nav aria-label="Phân trang" className="mt-4 flex items-center justify-center gap-3">
                <Button
                  variant="secondary"
                  disabled={page <= 1}
                  onClick={() => setParams({ tab, page: String(page - 1) })}
                >
                  Trang trước
                </Button>
                <span className="text-sm text-muted">
                  Trang {page}/{totalPages}
                </span>
                <Button
                  variant="secondary"
                  disabled={page >= totalPages}
                  onClick={() => setParams({ tab, page: String(page + 1) })}
                >
                  Trang sau
                </Button>
              </nav>
            )}
          </>
        )}
      </div>

      <ConfirmDialog
        open={pending !== null}
        title={pending?.action === 'reject' ? 'Từ chối yêu cầu đặt lịch?' : 'Hủy buổi học?'}
        tone="danger"
        confirmLabel={pending ? ACTION_LABELS[pending.action] : ''}
        loading={action.isPending}
        onCancel={() => setPending(null)}
        onConfirm={() => pending && run(pending.booking, pending.action)}
        description={
          pending && (
            <div className="flex flex-col gap-2">
              <p className="capitalize">
                {formatDate(pending.booking.startsAtUtc, timeZone)},{' '}
                {formatTimeRange(pending.booking.startsAtUtc, pending.booking.endsAtUtc, timeZone)}
              </p>
              <p>
                {pending.action === 'reject'
                  ? 'Học viên sẽ thấy yêu cầu bị từ chối và khung giờ được mở lại.'
                  : CANCELLATION_POLICY}
              </p>
              <p className="font-medium">Thao tác này không thể hoàn tác.</p>
            </div>
          )
        }
      />
    </section>
  );
}
