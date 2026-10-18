import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Page } from '../../../shared/schemas/discovery';
import type {
  AdminContractCandidate,
  AdminTermsQuiz,
  ClassContractRecord,
  QuizQuestion,
  TutorQuizAttempt,
  TutorTermsAcknowledgement,
  TutorTermsQuiz,
} from '../../../shared/schemas/terms-contracts';
import { useSession } from '../../app/auth';
import { api, toQuery } from '../../lib/api-client';

const termsKey = ['tutor-terms'] as const;
const contractsKey = ['contracts'] as const;

export function useTutorTermsQuiz() {
  const { user } = useSession();
  return useQuery({
    queryKey: [...termsKey, user?.id],
    queryFn: ({ signal }) => api.get<TutorTermsQuiz>('/tutor/terms/quiz', { signal }),
    enabled: Boolean(user),
    retry: false,
  });
}

export function useTutorTermsActions() {
  const queryClient = useQueryClient();
  const { user } = useSession();
  const attempt = useMutation({
    mutationFn: (input: { quizId: string; answers: { questionId: string; choiceId: string }[] }) =>
      api.post<TutorQuizAttempt>('/tutor/terms/attempts', input),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: [...termsKey, user?.id] }),
  });
  const acknowledge = useMutation({
    mutationFn: (input: { quizId: string; attemptId: string }) =>
      api.post<TutorTermsAcknowledgement>('/tutor/terms/acknowledgements', {
        ...input,
        acknowledged: true,
      }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: [...termsKey, user?.id] }),
  });
  return { attempt, acknowledge };
}

export function useAdminTermsQuizzes() {
  return useQuery({
    queryKey: ['admin-terms-quizzes'],
    queryFn: ({ signal }) => api.get<AdminTermsQuiz[]>('/admin/terms/quizzes', { signal }),
  });
}

export function useAdminTermsQuizActions() {
  const queryClient = useQueryClient();
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ['admin-terms-quizzes'] });
  const create = useMutation({
    mutationFn: (input: {
      termsContentRevisionId: string;
      questions: QuizQuestion[];
      minimumCorrect: number;
    }) => api.post<AdminTermsQuiz>('/admin/terms/quizzes', input),
    onSuccess: refresh,
  });
  const edit = useMutation({
    mutationFn: (input: {
      id: string;
      editVersion: number;
      questions: QuizQuestion[];
      minimumCorrect: number;
    }) =>
      api.patch<AdminTermsQuiz>(`/admin/terms/quizzes/${encodeURIComponent(input.id)}`, {
        editVersion: input.editVersion,
        questions: input.questions,
        minimumCorrect: input.minimumCorrect,
      }),
    onSuccess: refresh,
  });
  const publish = useMutation({
    mutationFn: (input: { id: string; editVersion: number }) =>
      api.post<AdminTermsQuiz>(`/admin/terms/quizzes/${encodeURIComponent(input.id)}/publish`, {
        editVersion: input.editVersion,
      }),
    onSuccess: refresh,
  });
  return { create, edit, publish };
}

/** Every class contract record of the tutor (latest 50), for the single signed contract. */
export function useAllTutorContracts() {
  const { user } = useSession();
  return useQuery({
    queryKey: [...contractsKey, 'tutor', user?.id, 'all'],
    queryFn: ({ signal }) =>
      api.get<Page<ClassContractRecord>>(`/tutor/contracts${toQuery({ page: 1, pageSize: 50 })}`, {
        signal,
      }),
    enabled: Boolean(user),
  });
}

export function useAcknowledgeContract() {
  const queryClient = useQueryClient();
  const { user } = useSession();
  return useMutation({
    mutationFn: (input: { id: string; version: number }) =>
      api.post<ClassContractRecord>(
        `/tutor/contracts/${encodeURIComponent(input.id)}/acknowledge`,
        {
          version: input.version,
          acknowledged: true,
        },
      ),
    onSuccess: () =>
      void queryClient.invalidateQueries({ queryKey: [...contractsKey, 'tutor', user?.id] }),
  });
}

export function useAdminContracts(page: number) {
  return useQuery({
    queryKey: [...contractsKey, 'admin', page],
    queryFn: ({ signal }) =>
      api.get<Page<ClassContractRecord>>(`/admin/contracts${toQuery({ page })}`, { signal }),
    placeholderData: keepPreviousData,
  });
}

export function useAdminContractCandidates(page: number) {
  return useQuery({
    queryKey: [...contractsKey, 'candidates', page],
    queryFn: ({ signal }) =>
      api.get<Page<AdminContractCandidate>>(`/admin/contracts/candidates${toQuery({ page })}`, {
        signal,
      }),
    placeholderData: keepPreviousData,
  });
}

export function useIssueContract() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      assignmentId: string;
      assignmentVersion: number;
      contentRevisionId: string;
    }) =>
      api.post<ClassContractRecord>(
        `/admin/assignments/${encodeURIComponent(input.assignmentId)}/contracts`,
        { assignmentVersion: input.assignmentVersion, contentRevisionId: input.contentRevisionId },
      ),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: contractsKey }),
  });
}

/** Moderator attests the placement fee was received offline; unlocks the tutor's contact view. */
export function useRecordPlacementFee() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { contractId: string; amountMinor: number }) =>
      api.post<ClassContractRecord>(
        `/admin/contracts/${encodeURIComponent(input.contractId)}/placement-fee`,
        { amountMinor: input.amountMinor },
      ),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: contractsKey }),
  });
}

/** Moderator records that a first-time tutor signed the contract in person at the centre. */
export function useRecordContractSignedAtCentre() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { contractId: string; version: number }) =>
      api.post<ClassContractRecord>(
        `/admin/contracts/${encodeURIComponent(input.contractId)}/signed-at-centre`,
        { version: input.version },
      ),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: contractsKey }),
  });
}
