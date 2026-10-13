import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Page } from '../../../shared/schemas/discovery';
import type {
  CreateParentRequestInput,
  OwnParentRequest,
  ParentRequestListItem,
  RequestStatus,
  LearnerRequestStage,
  LearnerStageCounts,
  UpdateParentRequestInput,
} from '../../../shared/schemas/requests';
import { useSession } from '../../app/auth';
import { api, toQuery } from '../../lib/api-client';

export interface ParentRequestFilters {
  status?: RequestStatus;
  group?: LearnerRequestStage;
  q?: string;
  subjectId?: string;
  mode?: 'online' | 'offline';
  from?: string;
  to?: string;
  page: number;
  pageSize?: number;
}

const listKey = (userId: string | undefined, filters: ParentRequestFilters) =>
  ['parent-requests', userId, filters] as const;
const detailKey = (userId: string | undefined, id: string | undefined) =>
  ['parent-request', userId, id] as const;

export function useParentRequests(filters: ParentRequestFilters) {
  const { user } = useSession();
  return useQuery({
    queryKey: listKey(user?.id, filters),
    queryFn: () =>
      api.get<Page<ParentRequestListItem>>(
        `/parent/requests${toQuery({ ...filters, page: filters.page > 1 ? filters.page : undefined })}`,
      ),
    enabled: Boolean(user),
  });
}

/** Counts for the three learner tabs and summary cards. */
export function useParentRequestCounts() {
  const { user } = useSession();
  return useQuery({
    queryKey: ['parent-request-stages', user?.id],
    queryFn: ({ signal }) =>
      api.get<LearnerStageCounts>('/parent/requests/stage-counts', { signal }),
    enabled: Boolean(user),
  });
}

export function useOwnParentRequest(id: string | undefined) {
  const { user } = useSession();
  return useQuery({
    queryKey: detailKey(user?.id, id),
    queryFn: () => api.get<OwnParentRequest>(`/parent/requests/${encodeURIComponent(id!)}`),
    enabled: Boolean(user && id),
    retry: false,
  });
}

function useRequestCache() {
  const queryClient = useQueryClient();
  const { user } = useSession();
  return (request: OwnParentRequest) => {
    queryClient.setQueryData(detailKey(user?.id, request.id), request);
    void queryClient.invalidateQueries({ queryKey: ['parent-requests', user?.id] });
    void queryClient.invalidateQueries({ queryKey: ['parent-dashboard'] });
    void queryClient.invalidateQueries({ queryKey: ['parent-request-stages', user?.id] });
  };
}

export function useCreateParentRequest() {
  const cache = useRequestCache();
  return useMutation({
    mutationFn: ({
      input,
      idempotencyKey,
    }: {
      input: CreateParentRequestInput;
      idempotencyKey: string;
    }) =>
      api.post<OwnParentRequest>('/parent/requests', input, {
        headers: { 'Idempotency-Key': idempotencyKey },
      }),
    onSuccess: cache,
  });
}

export function useUpdateParentRequest() {
  const cache = useRequestCache();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateParentRequestInput }) =>
      api.patch<OwnParentRequest>(`/parent/requests/${encodeURIComponent(id)}`, input),
    onSuccess: cache,
  });
}

export function useSubmitParentRequest() {
  const cache = useRequestCache();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, version }: { id: string; version: number }) =>
      api.post<OwnParentRequest>(`/parent/requests/${encodeURIComponent(id)}/submit`, {
        version,
        consentToShareContact: true,
      }),
    onSuccess: (request) => {
      cache(request);
      void queryClient.invalidateQueries({ queryKey: ['classes', 'public'] });
    },
  });
}

/** Learner confirms hiring the tutor the centre proposed for this request. */
export function useConfirmTutor() {
  const cache = useRequestCache();
  return useMutation({
    mutationFn: ({
      id,
      version,
      assignmentId,
    }: {
      id: string;
      version: number;
      assignmentId: string;
    }) =>
      api.post<OwnParentRequest>(`/parent/requests/${encodeURIComponent(id)}/confirm-tutor`, {
        version,
        assignmentId,
      }),
    onSuccess: cache,
  });
}
