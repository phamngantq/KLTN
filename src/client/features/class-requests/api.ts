import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AssignedParentContact } from '../../../shared/schemas/admin-assignments';
import type {
  CompletedAcceptance,
  IntroductionLetter,
  TutorProposalItem,
} from '../../../shared/schemas/class-requests';
import type { ApplicationStatus } from '../../../shared/schemas/classes';
import type { Page } from '../../../shared/schemas/discovery';
import { useSession } from '../../app/auth';
import { api, toQuery } from '../../lib/api-client';
import type { TutorClassApplication } from '../classes/api';

const requestsKey = ['tutor-class-requests'] as const;
/** Same prefix as the classes feature, so withdrawing or applying refreshes this list too. */
const applicationKey = ['classes', 'applications'] as const;

export function useRegisteredClasses(filters: {
  page: number;
  q?: string | undefined;
  status?: ApplicationStatus | undefined;
}) {
  const { user } = useSession();
  return useQuery({
    queryKey: [...applicationKey, user?.id, 'registered', filters],
    queryFn: ({ signal }) =>
      api.get<Page<TutorClassApplication>>(
        `/tutor/applications${toQuery({ ...filters, pageSize: 12 })}`,
        { signal },
      ),
    enabled: user?.role === 'tutor',
    placeholderData: keepPreviousData,
  });
}

export function useTutorProposals(page: number) {
  const { user } = useSession();
  return useQuery({
    queryKey: [...requestsKey, 'proposals', user?.id, page],
    queryFn: ({ signal }) =>
      api.get<Page<TutorProposalItem>>(`/tutor/class-requests/proposals${toQuery({ page })}`, {
        signal,
      }),
    enabled: user?.role === 'tutor',
    placeholderData: keepPreviousData,
  });
}

export function useRespondToProposal() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (
      input: { id: string; accept: true } | { id: string; accept: false; reason: string },
    ) =>
      input.accept
        ? api.post<TutorProposalItem>(
            `/tutor/class-requests/proposals/${encodeURIComponent(input.id)}/accept`,
            {},
          )
        : api.post<TutorProposalItem>(
            `/tutor/class-requests/proposals/${encodeURIComponent(input.id)}/decline`,
            { reason: input.reason },
          ),
    onSuccess: () =>
      void queryClient.invalidateQueries({ queryKey: [...requestsKey, 'proposals'] }),
  });
}

export function useCompletedClasses(page: number) {
  const { user } = useSession();
  return useQuery({
    queryKey: [...requestsKey, 'completed', user?.id, page],
    queryFn: ({ signal }) =>
      api.get<Page<CompletedAcceptance>>(`/tutor/class-requests/completed${toQuery({ page })}`, {
        signal,
      }),
    enabled: user?.role === 'tutor',
    placeholderData: keepPreviousData,
  });
}

/** Gated on the server on every read; never cached after the panel closes. */
export function useLearnerContact(assignmentId: string | null) {
  const { user } = useSession();
  return useQuery({
    queryKey: ['tutor-assignment-contact', user?.id, assignmentId],
    queryFn: ({ signal }) =>
      api.get<AssignedParentContact>(
        `/tutor/assignments/${encodeURIComponent(assignmentId!)}/contact`,
        { signal },
      ),
    enabled: Boolean(user && assignmentId),
    retry: false,
    staleTime: 0,
    gcTime: 0,
  });
}

export function useIntroductionLetter(assignmentId: string | undefined) {
  const { user } = useSession();
  return useQuery({
    queryKey: [...requestsKey, 'letter', user?.id, assignmentId],
    queryFn: ({ signal }) =>
      api.get<IntroductionLetter>(
        `/tutor/class-requests/acceptances/${encodeURIComponent(assignmentId!)}/letter`,
        { signal },
      ),
    enabled: Boolean(user?.role === 'tutor' && assignmentId),
    retry: false,
    staleTime: 0,
    gcTime: 0,
  });
}

/** Online placement-fee payment for a returning tutor; the server refuses until a gateway exists. */
export function useStartPlacementFeePayment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (assignmentId: string) =>
      api.post<{ redirectUrl: string }>(
        `/tutor/class-requests/acceptances/${encodeURIComponent(assignmentId)}/payment`,
        {},
      ),
    onSettled: () => void queryClient.invalidateQueries({ queryKey: applicationKey }),
  });
}
