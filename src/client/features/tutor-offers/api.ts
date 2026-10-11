import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Page } from '../../../shared/schemas/discovery';
import type {
  CreateTutorOfferInput,
  PublicTutorOffer,
  TutorOffer,
  TutorOfferContract,
  UpdateTutorOfferInput,
} from '../../../shared/schemas/tutor-offers';
import { useSession } from '../../app/auth';
import { api, toQuery } from '../../lib/api-client';

export type {
  PublicTutorOffer,
  TutorOffer,
  TutorOfferContract,
} from '../../../shared/schemas/tutor-offers';

const publicKey = ['tutor-offers', 'public'] as const;
const ownKey = ['tutor-offers', 'own'] as const;
const adminKey = ['tutor-offers', 'admin'] as const;

export function usePublicTutorOffers(page: number) {
  return useQuery({
    queryKey: [...publicKey, page],
    queryFn: ({ signal }) =>
      api.get<Page<PublicTutorOffer>>(`/tutor-offers${toQuery({ page, pageSize: 12 })}`, {
        signal,
      }),
    placeholderData: keepPreviousData,
  });
}

export function usePublicTutorOffer(id: string | undefined) {
  return useQuery({
    queryKey: [...publicKey, id],
    queryFn: ({ signal }) =>
      api.get<PublicTutorOffer>(`/tutor-offers/${encodeURIComponent(id!)}`, { signal }),
    enabled: Boolean(id),
    retry: false,
  });
}

export function useTutorOffers(page: number) {
  const { user } = useSession();
  return useQuery({
    queryKey: [...ownKey, user?.id, page],
    queryFn: ({ signal }) =>
      api.get<Page<TutorOffer>>(`/tutor/offers${toQuery({ page, pageSize: 12 })}`, { signal }),
    enabled: user?.role === 'tutor',
    placeholderData: keepPreviousData,
  });
}

export function useTutorOffer(id: string | undefined) {
  const { user } = useSession();
  return useQuery({
    queryKey: [...ownKey, user?.id, id],
    queryFn: ({ signal }) =>
      api.get<TutorOffer>(`/tutor/offers/${encodeURIComponent(id!)}`, { signal }),
    enabled: Boolean(id && user?.role === 'tutor'),
    retry: false,
  });
}

export function useTutorOfferContract(enabled: boolean) {
  const { user } = useSession();
  return useQuery({
    queryKey: ['tutor-offers', 'contract', user?.id],
    queryFn: ({ signal }) => api.get<TutorOfferContract>('/tutor/offers/contract', { signal }),
    enabled: enabled && user?.role === 'tutor',
    retry: false,
  });
}

export function useTutorOfferActions() {
  const { user } = useSession();
  const queryClient = useQueryClient();
  const refresh = () => void queryClient.invalidateQueries({ queryKey: [...ownKey, user?.id] });
  const create = useMutation({
    mutationFn: (input: CreateTutorOfferInput) => api.post<TutorOffer>('/tutor/offers', input),
    onSuccess: refresh,
  });
  const update = useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateTutorOfferInput }) =>
      api.patch<TutorOffer>(`/tutor/offers/${encodeURIComponent(id)}`, input),
    onSuccess: refresh,
  });
  const submit = useMutation({
    mutationFn: (input: { id: string; version: number; contractRevisionId: string }) =>
      api.post<TutorOffer>(`/tutor/offers/${encodeURIComponent(input.id)}/submit`, {
        version: input.version,
        contractRevisionId: input.contractRevisionId,
        acknowledged: true,
        shareContactAfterApproval: true,
      }),
    onSuccess: () => {
      refresh();
      void queryClient.invalidateQueries({ queryKey: ['admin-dashboard-tutor-offers'] });
    },
  });
  const close = useMutation({
    mutationFn: (input: { id: string; version: number }) =>
      api.post<TutorOffer>(`/tutor/offers/${encodeURIComponent(input.id)}/close`, {
        version: input.version,
      }),
    onSuccess: () => {
      refresh();
      void queryClient.invalidateQueries({ queryKey: publicKey });
    },
  });
  return { create, update, submit, close };
}

export function useAdminTutorOffers(page: number, status: string) {
  return useQuery({
    queryKey: [...adminKey, status, page],
    queryFn: ({ signal }) =>
      api.get<Page<TutorOffer>>(
        `/admin/tutor-offers${toQuery({ page, pageSize: 12, status: status || undefined })}`,
        { signal },
      ),
    placeholderData: keepPreviousData,
  });
}

export function useAdminTutorOfferActions() {
  const queryClient = useQueryClient();
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: adminKey });
    void queryClient.invalidateQueries({ queryKey: publicKey });
    void queryClient.invalidateQueries({ queryKey: ['admin-dashboard-tutor-offers'] });
  };
  const approve = useMutation({
    mutationFn: (input: { id: string; version: number }) =>
      api.post<TutorOffer>(`/admin/tutor-offers/${encodeURIComponent(input.id)}/approve`, {
        version: input.version,
      }),
    onSuccess: refresh,
  });
  const reject = useMutation({
    mutationFn: (input: { id: string; version: number; reason: string }) =>
      api.post<TutorOffer>(`/admin/tutor-offers/${encodeURIComponent(input.id)}/reject`, {
        version: input.version,
        reason: input.reason,
      }),
    onSuccess: refresh,
  });
  return { approve, reject };
}
