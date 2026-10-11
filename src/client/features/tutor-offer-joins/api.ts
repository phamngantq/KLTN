import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Page } from '../../../shared/schemas/discovery';
import type {
  AdminTutorOfferJoin,
  AdminTutorOfferJoinDetail,
  ParentTutorOfferJoin,
  TutorOfferJoinContact,
  TutorOfferJoinForTutor,
} from '../../../shared/schemas/tutor-offer-joins';
import { useSession } from '../../app/auth';
import { api, toQuery } from '../../lib/api-client';

export type {
  AdminTutorOfferJoin,
  ParentTutorOfferJoin,
  TutorOfferJoinForTutor,
} from '../../../shared/schemas/tutor-offer-joins';

const parentKey = ['tutor-offer-joins', 'parent'] as const;
const tutorKey = ['tutor-offer-joins', 'tutor'] as const;
const adminKey = ['tutor-offer-joins', 'admin'] as const;

export function useParentTutorOfferJoins(page: number) {
  const { user } = useSession();
  return useQuery({
    queryKey: [...parentKey, user?.id, page],
    queryFn: ({ signal }) =>
      api.get<Page<ParentTutorOfferJoin>>(
        `/parent/tutor-offer-joins${toQuery({ page, pageSize: 12 })}`,
        { signal },
      ),
    enabled: user?.role === 'student',
    placeholderData: keepPreviousData,
  });
}

export function useLatestParentTutorOfferJoin(offerId: string) {
  const { user } = useSession();
  return useQuery({
    queryKey: [...parentKey, user?.id, 'offer', offerId],
    queryFn: async ({ signal }) => {
      const page = await api.get<Page<ParentTutorOfferJoin>>(
        `/parent/tutor-offer-joins${toQuery({ offerId, page: 1, pageSize: 1 })}`,
        { signal },
      );
      return page.items[0] ?? null;
    },
    enabled: Boolean(offerId && user?.role === 'student'),
  });
}

export function useParentTutorOfferJoin(id: string | undefined) {
  const { user } = useSession();
  return useQuery({
    queryKey: [...parentKey, user?.id, id],
    queryFn: ({ signal }) =>
      api.get<ParentTutorOfferJoin>(`/parent/tutor-offer-joins/${encodeURIComponent(id!)}`, {
        signal,
      }),
    enabled: Boolean(id && user?.role === 'student'),
    retry: false,
  });
}

export function useParentTutorOfferJoinActions() {
  const { user } = useSession();
  const queryClient = useQueryClient();
  const refresh = () => void queryClient.invalidateQueries({ queryKey: [...parentKey, user?.id] });
  const create = useMutation({
    mutationFn: (input: {
      offerId: string;
      offerVersion: number;
      studentGrade: string;
      learningNeeds: string;
      teachingArea: string | null;
      contactPhone: string;
      shareApplicationDetailsConsent: true;
      shareContactAfterApprovalConsent: true;
    }) =>
      api.post<ParentTutorOfferJoin>(
        `/tutor-offers/${encodeURIComponent(input.offerId)}/join-requests`,
        {
          offerVersion: input.offerVersion,
          studentGrade: input.studentGrade,
          learningNeeds: input.learningNeeds,
          teachingArea: input.teachingArea,
          contactPhone: input.contactPhone,
          shareApplicationDetailsConsent: input.shareApplicationDetailsConsent,
          shareContactAfterApprovalConsent: input.shareContactAfterApprovalConsent,
        },
      ),
    onSuccess: () => {
      refresh();
      void queryClient.invalidateQueries({ queryKey: ['admin-dashboard-tutor-offer-joins'] });
    },
  });
  const withdraw = useMutation({
    mutationFn: (input: { id: string; version: number }) =>
      api.post<ParentTutorOfferJoin>(
        `/parent/tutor-offer-joins/${encodeURIComponent(input.id)}/withdraw`,
        { version: input.version },
      ),
    onSuccess: () => {
      refresh();
      void queryClient.invalidateQueries({ queryKey: ['admin-dashboard-tutor-offer-joins'] });
    },
  });
  return { create, withdraw };
}

export function useParentTutorOfferJoinContact(id: string | undefined, enabled: boolean) {
  const { user } = useSession();
  return useQuery({
    queryKey: [...parentKey, user?.id, id, 'contact'],
    queryFn: ({ signal }) =>
      api.get<TutorOfferJoinContact>(
        `/parent/tutor-offer-joins/${encodeURIComponent(id!)}/contact`,
        { signal },
      ),
    enabled: Boolean(id && enabled && user?.role === 'student'),
    retry: false,
  });
}

export function useTutorOfferJoinRequests(offerId: string, enabled: boolean) {
  const { user } = useSession();
  return useQuery({
    queryKey: [...tutorKey, user?.id, offerId],
    queryFn: ({ signal }) =>
      api.get<Page<TutorOfferJoinForTutor>>(
        `/tutor/offers/${encodeURIComponent(offerId)}/join-requests${toQuery({ page: 1, pageSize: 20 })}`,
        { signal },
      ),
    enabled: enabled && user?.role === 'tutor',
  });
}

export function useTutorOfferJoinContact(offerId: string, joinId: string, enabled: boolean) {
  const { user } = useSession();
  return useQuery({
    queryKey: [...tutorKey, user?.id, offerId, joinId, 'contact'],
    queryFn: ({ signal }) =>
      api.get<TutorOfferJoinContact>(
        `/tutor/offers/${encodeURIComponent(offerId)}/join-requests/${encodeURIComponent(joinId)}/contact`,
        { signal },
      ),
    enabled: enabled && user?.role === 'tutor',
    retry: false,
  });
}

export function useAdminTutorOfferJoins(page: number, status: string) {
  return useQuery({
    queryKey: [...adminKey, status, page],
    queryFn: ({ signal }) =>
      api.get<Page<AdminTutorOfferJoin>>(
        `/admin/tutor-offer-joins${toQuery({ status: status || undefined, page, pageSize: 12 })}`,
        { signal },
      ),
    placeholderData: keepPreviousData,
  });
}

export function useAdminTutorOfferJoinDetail(id: string | undefined) {
  return useQuery({
    queryKey: [...adminKey, id, 'detail'],
    queryFn: ({ signal }) =>
      api.get<AdminTutorOfferJoinDetail>(`/admin/tutor-offer-joins/${encodeURIComponent(id!)}`, {
        signal,
      }),
    enabled: Boolean(id),
    retry: false,
  });
}

export function useAdminTutorOfferJoinActions() {
  const queryClient = useQueryClient();
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: adminKey });
    void queryClient.invalidateQueries({ queryKey: tutorKey });
    void queryClient.invalidateQueries({ queryKey: parentKey });
    void queryClient.invalidateQueries({ queryKey: ['admin-dashboard-tutor-offer-joins'] });
  };
  const approve = useMutation({
    mutationFn: (input: { id: string; version: number; agreedTuitionPerSessionMinor: number }) =>
      api.post<AdminTutorOfferJoin>(
        `/admin/tutor-offer-joins/${encodeURIComponent(input.id)}/approve`,
        {
          version: input.version,
          agreedTuitionPerSessionMinor: input.agreedTuitionPerSessionMinor,
          partiesAgreed: true,
        },
      ),
    onSuccess: refresh,
  });
  const reject = useMutation({
    mutationFn: (input: { id: string; version: number; reason: string }) =>
      api.post<AdminTutorOfferJoin>(
        `/admin/tutor-offer-joins/${encodeURIComponent(input.id)}/reject`,
        { version: input.version, reason: input.reason },
      ),
    onSuccess: refresh,
  });
  const complete = useMutation({
    mutationFn: (input: { id: string; version: number; reason: string }) =>
      api.post<AdminTutorOfferJoin>(
        `/admin/tutor-offer-joins/${encodeURIComponent(input.id)}/complete`,
        { version: input.version, reason: input.reason },
      ),
    onSuccess: refresh,
  });
  const revoke = useMutation({
    mutationFn: (input: { id: string; version: number; reason: string }) =>
      api.post<AdminTutorOfferJoin>(
        `/admin/tutor-offer-joins/${encodeURIComponent(input.id)}/revoke`,
        { version: input.version, reason: input.reason },
      ),
    onSuccess: refresh,
  });
  return { approve, reject, complete, revoke };
}
