import { apiClient } from '@/api/client';
import axios from 'axios';
import type { ApiFailure } from '@/types/api';

export interface OperationOptions<T = unknown> {
  data?: T;
}

export class OperationRequestError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly retryAfterMs?: number,
  ) {
    super(message);
    this.name = 'OperationRequestError';
  }
}

const LONG_RUNNING_OPERATION = /ai|export|import|upload|scrap|generate|backup|migration/i;

function timeoutForOperation(name: string) {
  return LONG_RUNNING_OPERATION.test(name) ? 120_000 : 30_000;
}

export async function executeLegacyOperation<T = unknown>(
  name: string,
  options: OperationOptions = {},
): Promise<T> {
  try {
    const response = await apiClient.post<{ success: true; data: T }>(
      `/operations/${name}`,
      options,
      { timeout: timeoutForOperation(name) },
    );
    return response.data.data;
  } catch (error) {
    if (axios.isAxiosError<ApiFailure>(error)) {
      const failure = error.response?.data;
      const details = failure?.errors
        ?.map(({ field, message }) => `${field ? `${field}: ` : ''}${message}`)
        .join('; ');
      const retryAfterSeconds = Number(error.response?.headers?.['retry-after']);
      throw new OperationRequestError(
        details || failure?.message || error.message,
        error.response?.status,
        Number.isFinite(retryAfterSeconds) ? retryAfterSeconds * 1000 : undefined,
      );
    }
    throw error;
  }
}
