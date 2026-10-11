import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { SlotList } from '../../../shared/schemas/availability';
import { api, toQuery } from '../../lib/api-client';

export function slotsKey(tutorId: string) {
  return ['slots', tutorId] as const;
}

export function useSlots(tutorId: string, from: string | undefined, duration: number) {
  return useQuery({
    queryKey: [...slotsKey(tutorId), from ?? 'today', duration],
    queryFn: ({ signal }) =>
      api.get<SlotList>(
        `/tutors/${encodeURIComponent(tutorId)}/slots${toQuery({ from, duration })}`,
        { signal },
      ),
    placeholderData: keepPreviousData,
  });
}
