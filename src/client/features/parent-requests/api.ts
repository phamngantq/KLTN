import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Page } from '../../../shared/schemas/discovery';
import type {
  CreateParentRequestInput,
  OwnParentRequest,
  ParentRequestListItem,
  RequestStatus,
  RequestStatusGroup,
  UpdateParentRequestInput,
} from '../../../shared/schemas/requests';
import type { ParentDashboard } from '../../../shared/schemas/reports';
import { useSession } from '../../app/auth';
import { api, toQuery } from '../../lib/api-client';

export interface ParentRequestFilters {
  status?: RequestStatus;
  group?: RequestStatusGroup;
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

/** Status counts for the summary cards and tabs; the same D1 dashboard as "Tổng quan". */
export function useParentRequestCounts() {
  const { user } = useSession();
  return useQuery({
    queryKey: ['parent-dashboard'],
    queryFn: ({ signal }) => api.get<ParentDashboard>('/parent/dashboard', { signal }),
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
