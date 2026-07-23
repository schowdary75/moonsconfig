import axios from 'axios';
import { QueryClient } from '@tanstack/react-query';
import { OperationRequestError } from '@/services/legacyOperationService';

export function shouldRetryQuery(failureCount: number, error: unknown) {
  if (error instanceof OperationRequestError && error.status && error.status >= 400) return false;
  if (axios.isAxiosError(error)) {
    const status = error.response?.status;
    if (status && status >= 400 && status < 500) return false;
  }

  return failureCount < 1;
}

export function createQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { staleTime: 30_000, retry: shouldRetryQuery } },
  });
}
