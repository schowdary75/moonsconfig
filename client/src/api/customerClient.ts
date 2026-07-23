import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios';
import { API_BASE_URL } from '@/constants/app';

let customerAccessToken: string | null = null;

export const customerClient = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
  timeout: 30_000,
  headers: { 'Content-Type': 'application/json' },
});

customerClient.interceptors.request.use((config) => {
  if (customerAccessToken) config.headers.Authorization = `Bearer ${customerAccessToken}`;
  return config;
});

let refreshRequest: Promise<string | null> | null = null;

async function refreshCustomerSession() {
  refreshRequest ??= axios
    .post(`${API_BASE_URL}/customer-auth/refresh`, undefined, { withCredentials: true })
    .then(({ data }) => {
      customerAccessToken = data.data?.accessToken ?? null;
      return customerAccessToken;
    })
    .catch(() => {
      customerAccessToken = null;
      return null;
    })
    .finally(() => {
      refreshRequest = null;
    });
  return refreshRequest;
}

customerClient.interceptors.response.use(undefined, async (error: AxiosError) => {
  const request = error.config as
    (InternalAxiosRequestConfig & { _customerRetried?: boolean }) | undefined;
  if (
    error.response?.status !== 401 ||
    !request ||
    request._customerRetried ||
    request.url?.includes('/customer-auth/')
  )
    throw error;
  request._customerRetried = true;
  const token = await refreshCustomerSession();
  if (!token) throw error;
  request.headers.Authorization = `Bearer ${token}`;
  return customerClient(request);
});

export const customerSession = {
  async restore() {
    return Boolean(await refreshCustomerSession());
  },
  async login(email: string, password: string) {
    const { data } = await customerClient.post('/customer-auth/login', { email, password });
    customerAccessToken = data.data.accessToken;
    return data.data;
  },
  async logout() {
    await customerClient.post('/customer-auth/logout').catch(() => undefined);
    customerAccessToken = null;
  },
};
