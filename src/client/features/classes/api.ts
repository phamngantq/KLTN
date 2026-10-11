import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  ClassSearchQuery,
  FeeOptionVersion,
  PublicClass,
  TutorApplication,
} from '../../../shared/schemas/classes';
import type { Page } from '../../../shared/schemas/discovery';
import { useSession } from '../../app/auth';
import { api, toQuery } from '../../lib/api-client';

export type { PublicClass, FeeOptionVersion } from '../../../shared/schemas/classes';
export type TutorClassApplication = TutorApplication;

export interface ClassFilters {
  subjectId?: string;
  grade?: string;
  mode?: 'online' | 'offline';
  area?: string;
  sort?: ClassSearchQuery['sort'];
  page: number;
  pageSize: number;
}

const publicKey = ['classes', 'public'] as const;
const matchedKey = ['classes', 'matched'] as const;
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
    }: {
      classId: string;
      feeOptionVersionId: string;
      classVersion: number;
      idempotencyKey: string;
    }) =>
      api.post<TutorClassApplication>(
        `/classes/${encodeURIComponent(classId)}/applications`,
        { feeOptionVersionId, classVersion },
        { headers: { 'Idempotency-Key': idempotencyKey } },
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [...applicationKey, user?.id] });
      void queryClient.invalidateQueries({ queryKey: matchedKey });
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
    },
  });
}
