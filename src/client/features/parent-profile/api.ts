import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ParentProfile, UpdateParentProfileInput } from '../../../shared/schemas/parents';
import { ME_KEY, useSession } from '../../app/auth';
import { api } from '../../lib/api-client';

const parentProfileKey = (userId: string | undefined) => ['parent-profile', userId] as const;

export function useParentProfile() {
  const { user } = useSession();
  return useQuery({
    queryKey: parentProfileKey(user?.id),
    queryFn: () => api.get<ParentProfile | null>('/parent/profile'),
    enabled: Boolean(user),
  });
}

export function useUpdateParentProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateParentProfileInput) =>
      api.patch<ParentProfile>('/parent/profile', input),
    onSuccess: (profile) => {
      queryClient.setQueryData(parentProfileKey(profile.userId), profile);
      void queryClient.invalidateQueries({ queryKey: ME_KEY });
    },
  });
}
