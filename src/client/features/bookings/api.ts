import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { Booking, CreateBookingInput } from '../../../shared/schemas/bookings';
import { api, isApiError } from '../../lib/api-client';
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
