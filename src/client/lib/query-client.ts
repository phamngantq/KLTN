import { QueryClient } from '@tanstack/react-query';
import { isApiError } from './api-client';

export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Retry transient failures once; never retry client errors (4xx).
        retry: (count, error) =>
          !(isApiError(error) && error.status >= 400 && error.status < 500) && count < 1,
        refetchOnWindowFocus: false,
      },
    },
  });
}
