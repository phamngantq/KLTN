import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AffectedBookings,
  ExceptionInput,
  ExceptionList,
  ExceptionSaveResult,
  PutWeeklyAvailabilityInput,
  WeeklyAvailability,
  WeeklyAvailabilitySaveResult,
} from '../../../shared/schemas/availability';
import { api } from '../../lib/api-client';

export const WEEKLY_KEY = ['tutor-availability'] as const;
export const EXCEPTIONS_KEY = ['tutor-availability-exceptions'] as const;

export function useWeeklyAvailability() {
  return useQuery({
    queryKey: WEEKLY_KEY,
    queryFn: () => api.get<WeeklyAvailability>('/tutor/availability'),
  });
}

export function useSaveWeekly() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: PutWeeklyAvailabilityInput) =>
      api.put<WeeklyAvailabilitySaveResult>('/tutor/availability', input),
    onSuccess: ({ affectedBookings: _ignored, ...weekly }) => {
      queryClient.setQueryData(WEEKLY_KEY, weekly);
      void queryClient.invalidateQueries({ queryKey: EXCEPTIONS_KEY }); // timezone may change
    },
  });
}

export function useExceptions() {
  return useQuery({
    queryKey: EXCEPTIONS_KEY,
    queryFn: () => api.get<ExceptionList>('/tutor/availability/exceptions'),
  });
}

export function useCreateException() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ExceptionInput) =>
      api.post<ExceptionSaveResult>('/tutor/availability/exceptions', input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: EXCEPTIONS_KEY }),
  });
}

export function useDeleteException() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api.delete<{ deleted: true } & AffectedBookings>(
        `/tutor/availability/exceptions/${encodeURIComponent(id)}`,
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: EXCEPTIONS_KEY }),
  });
}
