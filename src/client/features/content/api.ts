import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Page } from '../../../shared/schemas/discovery';
import type {
  AdminContent,
  AdminContentListQuery,
  ContentAudience,
  ContentKind,
  CreateContentInput,
  EditContentInput,
  PublishedContent,
  PublicContentListQuery,
} from '../../../shared/schemas/content';
import { useSession } from '../../app/auth';
import { api, toQuery } from '../../lib/api-client';

const publicKey = ['content', 'published'] as const;
const adminKey = ['content', 'admin'] as const;

export function usePublishedContentList(query: PublicContentListQuery) {
  const { user } = useSession();
  return useQuery({
    queryKey: [...publicKey, user?.id, query],
    queryFn: ({ signal }) =>
      api.get<Page<PublishedContent>>(
        `/content${toQuery({
          kind: query.kind,
          audience: query.audience,
          slugPrefix: query.slugPrefix,
          category: query.category,
          q: query.q,
          page: query.page,
          pageSize: query.pageSize,
        })}`,
        { signal },
      ),
  });
}

export function usePublishedContent(
  kind: ContentKind,
  slug: string | undefined,
  audience: ContentAudience,
) {
  const { user } = useSession();
  return useQuery({
    queryKey: [...publicKey, user?.id, kind, slug, audience],
    queryFn: ({ signal }) =>
      api.get<PublishedContent>(
        `/content/${encodeURIComponent(kind)}/${encodeURIComponent(slug!)}${toQuery({ audience })}`,
        { signal },
      ),
    enabled: Boolean(slug),
    retry: false,
  });
}

export function useAdminContentList(query: AdminContentListQuery) {
  return useQuery({
    queryKey: [...adminKey, query],
    queryFn: ({ signal }) =>
      api.get<Page<AdminContent>>(
        `/admin/content${toQuery({
          kind: query.kind,
          audience: query.audience,
          status: query.status,
          page: query.page,
          pageSize: query.pageSize,
        })}`,
        { signal },
      ),
  });
}

export function useAdminContent(id: string | null) {
  return useQuery({
    queryKey: [...adminKey, id],
    queryFn: ({ signal }) =>
      api.get<AdminContent>(`/admin/content/${encodeURIComponent(id!)}`, { signal }),
    enabled: Boolean(id),
  });
}

export function useContentActions() {
  const queryClient = useQueryClient();
  function refresh() {
    void queryClient.invalidateQueries({ queryKey: adminKey });
    void queryClient.invalidateQueries({ queryKey: publicKey });
  }
  const create = useMutation({
    mutationFn: (input: CreateContentInput) => api.post<AdminContent>('/admin/content', input),
    onSuccess: refresh,
  });
  const edit = useMutation({
    mutationFn: ({ id, input }: { id: string; input: EditContentInput }) =>
      api.patch<AdminContent>(`/admin/content/${encodeURIComponent(id)}`, input),
    onSuccess: refresh,
  });
  const revise = useMutation({
    mutationFn: ({ id, editVersion }: { id: string; editVersion: number }) =>
      api.post<AdminContent>(`/admin/content/${encodeURIComponent(id)}/revise`, { editVersion }),
    onSuccess: refresh,
  });
  const publish = useMutation({
    mutationFn: ({ id, editVersion }: { id: string; editVersion: number }) =>
      api.post<AdminContent>(`/admin/content/${encodeURIComponent(id)}/publish`, { editVersion }),
    onSuccess: refresh,
  });
  const retire = useMutation({
    mutationFn: ({ id, editVersion }: { id: string; editVersion: number }) =>
      api.post<AdminContent>(`/admin/content/${encodeURIComponent(id)}/retire`, { editVersion }),
    onSuccess: refresh,
  });
  return { create, edit, revise, publish, retire };
}
