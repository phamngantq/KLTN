import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  SignedContractScan,
  Subject,
  TutorProfile,
  UpdateTutorProfileInput,
} from '../../../shared/schemas/tutors';
import { ME_KEY } from '../../app/auth';
import { api } from '../../lib/api-client';

export const SUBJECTS_KEY = ['subjects'] as const;
export const OWN_PROFILE_KEY = ['tutor-profile'] as const;

export function useSubjects() {
  return useQuery({
    queryKey: SUBJECTS_KEY,
    queryFn: () => api.get<Subject[]>('/subjects'),
    staleTime: 10 * 60_000,
  });
}

export function useOwnProfile() {
  return useQuery({
    queryKey: OWN_PROFILE_KEY,
    queryFn: () => api.get<TutorProfile | null>('/tutor/profile'),
  });
}

/** Scan of the contract signed at the centre, or null before a moderator uploads it. */
export function useSignedContract() {
  return useQuery({
    queryKey: [...OWN_PROFILE_KEY, 'signed-contract'],
    queryFn: ({ signal }) =>
      api.get<SignedContractScan | null>('/tutor/profile/signed-contract', { signal }),
  });
}

export function useUpdateProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateTutorProfileInput) =>
      api.patch<TutorProfile>('/tutor/profile', input),
    onSuccess: (profile) => {
      queryClient.setQueryData(OWN_PROFILE_KEY, profile);
      void queryClient.invalidateQueries({ queryKey: ME_KEY }); // display name lives on the account
    },
  });
}

export function useSubmitProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<TutorProfile>('/tutor/profile/submit'),
    onSuccess: (profile) => queryClient.setQueryData(OWN_PROFILE_KEY, profile),
  });
}
