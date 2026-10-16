import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  ApplicationAvailability,
  ClassSearchQuery,
  ClassRecommendation,
  FeeOptionVersion,
  MatchAdjustment,
  PublicClass,
  TutorApplication,
} from '../../../shared/schemas/classes';
import type { Page } from '../../../shared/schemas/discovery';
import { useSession } from '../../app/auth';
import { api, toQuery } from '../../lib/api-client';
import { OWN_PROFILE_KEY } from '../tutor-profile/api';

export type {
  ClassRecommendation,
  MatchAdjustment,
  PublicClass,
  FeeOptionVersion,
} from '../../../shared/schemas/classes';
export type TutorClassApplication = TutorApplication;

export interface ClassFilters {
  subjectId?: string;
  grade?: string;
  mode?: 'online' | 'offline';
  area?: string;
  q?: string;
  sort?: ClassSearchQuery['sort'];
  page: number;
  pageSize: number;
}

const publicKey = ['classes', 'public'] as const;
const matchedKey = ['classes', 'matched'] as const;
const recommendationKey = ['classes', 'recommendations'] as const;
const applicationKey = ['classes', 'applications'] as const;

export function usePublicClasses(filters: ClassFilters) {
  return useQuery({
    queryKey: [...publicKey, filters],
    queryFn: ({ signal }) =>
      api.get<Page<PublicClass>>(
        `/classes${toQuery({
          subjectId: filters.subjectId,
          grade: filters.grade,
          mode: filters.mode,
          area: filters.area,
          q: filters.q,
          sort: filters.sort,
          page: filters.page,
          pageSize: filters.pageSize,
        })}`,
        { signal },
      ),
  });
}

export function usePublicClass(id: string | undefined) {
  return useQuery({
    queryKey: [...publicKey, id],
    queryFn: ({ signal }) =>
      api.get<PublicClass>(`/classes/${encodeURIComponent(id!)}`, { signal }),
    enabled: Boolean(id),
    retry: false,
  });
}

export function useMatchedClasses(page: number) {
  const { user } = useSession();
  return useQuery({
    queryKey: [...matchedKey, user?.id, page],
    queryFn: ({ signal }) =>
      api.get<Page<PublicClass>>(`/tutor/classes/matched${toQuery({ page, pageSize: 12 })}`, {
        signal,
      }),
    enabled: user?.role === 'tutor',
  });
}

export function useClassRecommendations(page: number) {
  const { user } = useSession();
  return useQuery({
    queryKey: [...recommendationKey, user?.id, page],
    queryFn: ({ signal }) =>
      api.get<Page<ClassRecommendation>>(
        `/tutor/classes/recommendations${toQuery({ page, pageSize: 12 })}`,
        { signal },
      ),
    enabled: user?.role === 'tutor',
  });
}

export function useClassRecommendation(classId: string | undefined) {
  const { user } = useSession();
  return useQuery({
    queryKey: [...recommendationKey, user?.id, classId],
    queryFn: ({ signal }) =>
      api.get<ClassRecommendation>(
        `/tutor/classes/${encodeURIComponent(classId!)}/recommendation`,
        { signal },
      ),
    enabled: Boolean(classId && user?.role === 'tutor'),
    retry: false,
  });
}

export function useFeeOptions(classId: string | undefined, enabled: boolean) {
  const { user } = useSession();
  return useQuery({
    queryKey: ['classes', 'fee-options', user?.id, classId],
    queryFn: ({ signal }) =>
      api.get<FeeOptionVersion[]>(`/tutor/fee-options${toQuery({ classId })}`, { signal }),
    enabled: Boolean(classId && enabled && user?.role === 'tutor'),
  });
}

export function useTutorApplications(page: number) {
  const { user } = useSession();
  return useQuery({
    queryKey: [...applicationKey, user?.id, page],
    queryFn: ({ signal }) =>
      api.get<Page<TutorClassApplication>>(
        `/tutor/applications${toQuery({ page, pageSize: 12 })}`,
        { signal },
      ),
    enabled: user?.role === 'tutor',
  });
}

export function useApplyForClass() {
  const queryClient = useQueryClient();
  const { user } = useSession();
  return useMutation({
    mutationFn: ({
      classId,
      feeOptionVersionId,
      classVersion,
      idempotencyKey,
      acceptedAdjustments,
      availability,
    }: {
      classId: string;
      feeOptionVersionId: string;
      classVersion: number;
      idempotencyKey: string;
      acceptedAdjustments?: MatchAdjustment[];
      availability: ApplicationAvailability;
    }) =>
      api.post<TutorClassApplication>(
        `/classes/${encodeURIComponent(classId)}/applications`,
        {
          feeOptionVersionId,
          classVersion,
          availability,
          ...(acceptedAdjustments && { acceptedAdjustments }),
        },
        { headers: { 'Idempotency-Key': idempotencyKey } },
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [...applicationKey, user?.id] });
      void queryClient.invalidateQueries({ queryKey: matchedKey });
      void queryClient.invalidateQueries({ queryKey: recommendationKey });
      void queryClient.invalidateQueries({ queryKey: OWN_PROFILE_KEY });
    },
  });
}

export function useWithdrawApplication() {
  const queryClient = useQueryClient();
  const { user } = useSession();
  return useMutation({
    mutationFn: ({ id, version }: { id: string; version: number }) =>
      api.post<TutorClassApplication>(`/tutor/applications/${encodeURIComponent(id)}/withdraw`, {
        version,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [...applicationKey, user?.id] });
      void queryClient.invalidateQueries({ queryKey: matchedKey });
      void queryClient.invalidateQueries({ queryKey: recommendationKey });
    },
  });
}
