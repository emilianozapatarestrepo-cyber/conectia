import axios, { type AxiosInstance } from 'axios';
import { getAuth } from 'firebase/auth';

const BASE_URL = import.meta.env.VITE_API_URL ?? '/api/v1';

export const api: AxiosInstance = axios.create({
  baseURL: BASE_URL,
  headers: { 'Content-Type': 'application/json' },
});

// Inject Firebase JWT on every request.
// If the user is not authenticated, reject immediately — never send unauthenticated requests.
api.interceptors.request.use(async (config) => {
  const auth = getAuth();
  const user = auth.currentUser;

  if (!user) {
    // Abort the request — no silent unauthenticated calls
    return Promise.reject(Object.assign(new Error('NOT_AUTHENTICATED'), { isAuthError: true }));
  }

  // getIdToken() automatically refreshes if the token is within 5 min of expiry
  const token = await user.getIdToken();
  config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Global error normalization + auth/billing redirects
api.interceptors.response.use(
  (res) => res,
  (error: unknown) => {
    if (axios.isAxiosError(error)) {
      if (error.response?.status === 401) {
        // Token expired or revoked — redirect to login
        window.location.href = '/login';
        return Promise.reject(new Error('UNAUTHORIZED'));
      }
      if (error.response?.status === 402) {
        // Subscription expired — redirect to billing page
        window.location.href = '/configuracion';
        return Promise.reject(new Error('SUBSCRIPTION_EXPIRED'));
      }
      const message =
        (error.response?.data as { message?: string; error?: string })?.message ??
        (error.response?.data as { message?: string; error?: string })?.error ??
        error.message;
      return Promise.reject(new Error(message));
    }
    // Re-throw auth errors without wrapping (already well-formed)
    if ((error as { isAuthError?: boolean })?.isAuthError) {
      return Promise.reject(error);
    }
    return Promise.reject(error);
  },
);
