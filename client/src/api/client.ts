import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios';
import { API_BASE_URL } from '../constants/app';
import type { ApiSuccess, Session } from '../types/api';
import { tokenStore, type TokenKind } from './tokenStore';

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
  timeout: 30_000,
  headers: { 'Content-Type': 'application/json' },
});

let refreshRequest: Promise<string | null> | null = null;
type AuthenticatedRequestConfig = InternalAxiosRequestConfig & {
  _authKind?: TokenKind | null;
  _retried?: boolean;
};
const SESSION_ISSUE_PATHS = new Set([
  '/auth/login',
  '/auth/refresh',
  '/auth/legacy/exchange',
  '/auth/mfa/challenge',
]);

apiClient.interceptors.request.use((config) => {
  const request = config as AuthenticatedRequestConfig;
  const token = tokenStore.get();
  request._authKind = tokenStore.getKind();
  if (token) request.headers.Authorization = `Bearer ${token}`;
  return request;
});

apiClient.interceptors.response.use(undefined, async (error: AxiosError) => {
  const request = error.config as AuthenticatedRequestConfig | undefined;
  if (
    error.response?.status !== 401 ||
    !request ||
    request._retried ||
    request._authKind === 'legacy' ||
    SESSION_ISSUE_PATHS.has(request.url ?? '')
  ) {
    throw error;
  }

  request._retried = true;
  refreshRequest ??= axios
    .post<ApiSuccess<Session>>(`${API_BASE_URL}/auth/refresh`, undefined, {
      withCredentials: true,
      timeout: 20_000,
    })
    .then(({ data }) => {
      tokenStore.set(data.data.accessToken);
      return data.data.accessToken;
    })
    .catch(() => {
      tokenStore.set(null);
      return null;
    })
    .finally(() => {
      refreshRequest = null;
    });

  const token = await refreshRequest;
  if (!token) throw error;
  request._authKind = 'access';
  request.headers.Authorization = `Bearer ${token}`;
  return apiClient(request);
});
