import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { Page, PublicTutor, TutorSearchQuery } from '../../../shared/schemas/discovery';
import { api, toQuery } from '../../lib/api-client';

export type TutorFilters = Partial<
  Pick<TutorSearchQuery, 'subject' | 'mode' | 'minRate' | 'maxRate' | 'sort' | 'page'>
>;

/** Reads filters from the URL (the URL is the source of truth for search state). */
export function filtersFromParams(params: URLSearchParams): TutorFilters {
  const num = (key: string) => {
    const value = params.get(key);
    return value && /^\d+$/.test(value) ? Number(value) : undefined;
  };
  const mode = params.get('mode');
  const sort = params.get('sort');
  return {
    subject: params.get('subject') || undefined,
    mode: mode === 'online' || mode === 'offline' ? mode : undefined,
    minRate: num('minRate'),
    maxRate: num('maxRate'),
    sort: sort === 'rate_asc' || sort === 'rate_desc' || sort === 'newest' ? sort : undefined,
    page: num('page'),
  };
}

export function useTutorSearch(filters: TutorFilters) {
  return useQuery({
    queryKey: ['tutors', filters],
    queryFn: ({ signal }) => api.get<Page<PublicTutor>>(`/tutors${toQuery(filters)}`, { signal }),
    placeholderData: keepPreviousData,
  });
}

export function useTutor(slug: string) {
  return useQuery({
    queryKey: ['tutor', slug],
    queryFn: ({ signal }) =>
      api.get<PublicTutor>(`/tutors/${encodeURIComponent(slug)}`, { signal }),
  });
}
