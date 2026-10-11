import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  BookingAction,
  BookingStatus,
  BookingWithActions,
} from '../../../shared/schemas/bookings';
import type { Page } from '../../../shared/schemas/discovery';
import { api, toQuery } from '../../lib/api-client';

export const BOOKINGS_KEY = ['bookings'] as const;

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
    // Server state is the truth for existing bookings.
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: BOOKINGS_KEY });
    },
  });
}
