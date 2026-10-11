import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Page } from '../../../shared/schemas/discovery';
import type {
  CreateParentRequestInput,
  OwnParentRequest,
  ParentRequestSummary,
  RequestStatus,
  UpdateParentRequestInput,
} from '../../../shared/schemas/requests';
import { useSession } from '../../app/auth';
import { api, toQuery } from '../../lib/api-client';

const listKey = (userId: string | undefined, status: RequestStatus | '', page: number) =>
  ['parent-requests', userId, status, page] as const;
const detailKey = (userId: string | undefined, id: string | undefined) =>
  ['parent-request', userId, id] as const;

export function useParentRequests(status: RequestStatus | '', page: number) {
  const { user } = useSession();
  return useQuery({
    queryKey: listKey(user?.id, status, page),
    queryFn: () =>
      api.get<Page<ParentRequestSummary>>(
        `/parent/requests${toQuery({ status: status || undefined, page })}`,
      ),
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
