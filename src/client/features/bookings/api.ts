import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  Booking,
  BookingAction,
  BookingStatus,
  BookingWithActions,
  CreateBookingInput,
} from '../../../shared/schemas/bookings';
import type { Page } from '../../../shared/schemas/discovery';
import { api, isApiError, toQuery } from '../../lib/api-client';
import { slotsKey } from '../slots/api';

export const BOOKINGS_KEY = ['bookings'] as const;

export interface CreateBookingVariables {
  input: CreateBookingInput;
  /** One key per user intent; reused for every automatic retry of that intent. */
  idempotencyKey: string;
}

export function newIdempotencyKey(): string {
  return `bk-${crypto.randomUUID()}`;
}

/** Transient outcomes where replaying the same key is safe and useful. */
function isRetryable(error: unknown): boolean {
  return isApiError(error, 'IDEMPOTENCY_IN_PROGRESS') || isApiError(error, 'NETWORK_ERROR');
}

export function useCreateBooking() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ input, idempotencyKey }: CreateBookingVariables) =>
      api.post<Booking>('/bookings', input, { headers: { 'Idempotency-Key': idempotencyKey } }),
    retry: (count, error) => count < 2 && isRetryable(error),
    retryDelay: 800,
    onSettled: (_data, error, { input }) => {
      // Success or a lost race both change availability: always reload the server's view.
      void queryClient.invalidateQueries({ queryKey: slotsKey(input.tutorId) });
      if (!error || isApiError(error, 'SLOT_UNAVAILABLE')) {
        void queryClient.invalidateQueries({ queryKey: BOOKINGS_KEY });
      }
    },
  });
}

export type BookingTab = 'pending' | 'confirmed' | 'completed' | 'cancelled';

export const BOOKING_TABS: {
  id: BookingTab;
  label: string;
  statuses: BookingStatus[];
  order: 'asc' | 'desc';
}[] = [
  { id: 'pending', label: 'Chờ xác nhận', statuses: ['PENDING'], order: 'asc' },
  { id: 'confirmed', label: 'Đã xác nhận', statuses: ['CONFIRMED'], order: 'asc' },
  { id: 'completed', label: 'Hoàn thành', statuses: ['COMPLETED'], order: 'desc' },
  {
    id: 'cancelled',
    label: 'Đã hủy / từ chối',
    statuses: ['CANCELLED', 'REJECTED', 'EXPIRED'],
    order: 'desc',
  },
];

export function useBookings(tab: BookingTab, page: number) {
  const config = BOOKING_TABS.find((t) => t.id === tab)!;
  return useQuery({
    queryKey: [...BOOKINGS_KEY, tab, page],
    queryFn: ({ signal }) =>
      api.get<Page<BookingWithActions>>(
        `/bookings${toQuery({ status: config.statuses.join(','), order: config.order, page, pageSize: 10 })}`,
        { signal },
      ),
    placeholderData: keepPreviousData,
  });
}

export function useBookingAction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, action }: { id: string; action: BookingAction }) =>
      api.post<BookingWithActions>(`/bookings/${encodeURIComponent(id)}/${action}`),
    // Server state is the truth: refetch every tab and any open slot pickers.
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: BOOKINGS_KEY });
      void queryClient.invalidateQueries({ queryKey: ['slots'] });
    },
  });
}
