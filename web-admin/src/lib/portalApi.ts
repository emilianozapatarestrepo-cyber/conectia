import axios, { type AxiosInstance } from 'axios';

// Public client for the resident portal — NO Firebase auth.
// Authorization is the capability token embedded in each request path.
export const portalApi: AxiosInstance = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? '/api/v1',
  headers: { 'Content-Type': 'application/json' },
});

portalApi.interceptors.response.use(
  (res) => res,
  (error: unknown) => {
    if (axios.isAxiosError(error)) {
      const message =
        (error.response?.data as { error?: string })?.error ?? error.message;
      return Promise.reject(new Error(message));
    }
    return Promise.reject(error instanceof Error ? error : new Error(String(error)));
  },
);
