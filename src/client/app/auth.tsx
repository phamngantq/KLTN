import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  LoginInput,
  PublicUser,
  RegisterInput,
  SessionPayload,
  UserRole,
} from '../../shared/schemas/auth';
import { api, isApiError, setCsrfToken } from '../lib/api-client';

export const ME_KEY = ['me'] as const;

/** Where each role lands after signing in (only routes that exist are listed). */
export function homePathFor(role: UserRole): string {
  switch (role) {
    case 'student':
      return '/student/bookings';
    case 'tutor':
      return '/tutor/bookings';
    case 'admin':
      return '/account';
  }
}

/** Only same-origin relative paths are accepted as post-login targets (no open redirect). */
export function safeNextPath(next: string | null): string | null {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\'))
    return null;
  return next;
}

async function fetchMe(): Promise<SessionPayload | null> {
  try {
    return await api.get<SessionPayload>('/me');
  } catch (err) {
    if (isApiError(err) && err.status === 401) return null;
    throw err;
  }
}

/** Server-confirmed session state. `user` is null for guests; never inferred client-side. */
export function useSession() {
  const query = useQuery({
    queryKey: ME_KEY,
    queryFn: async () => {
      const session = await fetchMe();
      setCsrfToken(session?.csrfToken ?? null);
      return session;
    },
    staleTime: 60_000,
    retry: false,
  });
  return {
    user: query.data?.user ?? null,
    isLoading: query.isPending,
    error: query.error,
    refetch: query.refetch,
  };
}

function useSessionWriter() {
  const queryClient = useQueryClient();
  return (session: SessionPayload | null) => {
    setCsrfToken(session?.csrfToken ?? null);
    queryClient.setQueryData(ME_KEY, session);
  };
}

export function useLogin() {
  const write = useSessionWriter();
  return useMutation({
    mutationFn: (input: LoginInput) => api.post<SessionPayload>('/auth/login', input),
    onSuccess: write,
  });
}

export function useRegister() {
  const write = useSessionWriter();
  return useMutation({
    mutationFn: (input: RegisterInput) => api.post<SessionPayload>('/auth/register', input),
    onSuccess: write,
  });
}

export function useLogout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<{ loggedOut: true }>('/auth/logout'),
    onSettled: () => {
      // Whatever the outcome, drop cached user data; the server is the source of truth.
      setCsrfToken(null);
      queryClient.clear();
      queryClient.setQueryData(ME_KEY, null);
    },
  });
}

export type { PublicUser };
