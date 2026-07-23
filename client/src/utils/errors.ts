import axios from 'axios';
import type { ApiFailure } from '../types/api';

export function getErrorMessage(error: unknown): string {
  if (axios.isAxiosError<ApiFailure>(error)) return error.response?.data?.message || error.message;
  return error instanceof Error ? error.message : 'Unexpected error';
}

export function getErrorCode(error: unknown): string | undefined {
  return axios.isAxiosError<ApiFailure>(error) ? error.response?.data?.code : undefined;
}
