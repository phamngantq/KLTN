import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { Booking, CreateBookingInput } from '../../../shared/schemas/bookings';
import { api, isApiError } from '../../lib/api-client';
import { slotsKey } from '../slots/api';

export const BOOKINGS_KEY = ['bookings'] as const;

export function useCreateBooking() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateBookingInput) => api.post<Booking>('/bookings', input),
    onSettled: (_data, error, input) => {
      // Success or a lost race both change availability: always reload the server's view.
      void queryClient.invalidateQueries({ queryKey: slotsKey(input.tutorId) });
      if (!error || isApiError(error, 'SLOT_UNAVAILABLE')) {
        void queryClient.invalidateQueries({ queryKey: BOOKINGS_KEY });
      }
    },
  });
}
