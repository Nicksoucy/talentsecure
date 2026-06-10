import axios, { AxiosInstance, AxiosRequestConfig, AxiosError } from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

// Create axios instance
const api: AxiosInstance = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor - Add auth token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('accessToken');
    if (token && !config.headers.Authorization) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    // Remove Content-Type header for FormData to let axios set it with boundary
    if (config.data instanceof FormData) {
      delete config.headers['Content-Type'];
    }

    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Single in-flight refresh promise so concurrent 401s share one network call.
// Without this, N parallel requests that all hit 401 would each fire their
// own /auth/refresh — and only the first one's response would be used,
// the others would race or fail silently with the now-rotated refresh token.
let refreshPromise: Promise<string> | null = null;

const refreshAccessToken = async (): Promise<string> => {
  const refreshToken = localStorage.getItem('refreshToken');
  if (!refreshToken) throw new Error('No refresh token');

  const response = await axios.post(`${API_URL}/api/auth/refresh`, { refreshToken });
  const { accessToken, refreshToken: newRefreshToken } = response.data;

  localStorage.setItem('accessToken', accessToken);
  if (newRefreshToken) {
    localStorage.setItem('refreshToken', newRefreshToken);
  }
  return accessToken;
};

const handleRefreshFailure = () => {
  localStorage.removeItem('accessToken');
  localStorage.removeItem('refreshToken');
  window.location.href = '/login';
};

// Response interceptor - Handle errors
api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as AxiosRequestConfig & {
      _retry?: boolean;
    };

    // Never attempt a token refresh for the auth endpoints themselves: a 401 from
    // /login means "bad credentials" and must propagate to the page; otherwise the
    // refresh-then-redirect flow silently reloads /login and the user never sees
    // the error message.
    const reqUrl = originalRequest.url || '';
    const isAuthEndpoint =
      reqUrl.includes('/auth/login') || reqUrl.includes('/auth/refresh');

    // If 401 and not already retried, try to refresh token
    if (error.response?.status === 401 && !originalRequest._retry && !isAuthEndpoint) {
      originalRequest._retry = true;

      try {
        // Reuse existing refresh in flight, otherwise start one and cache it.
        const pending = refreshPromise ??
          (refreshPromise = refreshAccessToken().finally(() => {
            refreshPromise = null;
          }));
        const accessToken = await pending;

        // Retry original request with the fresh token
        if (originalRequest.headers) {
          originalRequest.headers.Authorization = `Bearer ${accessToken}`;
        }
        return api(originalRequest);
      } catch (refreshError) {
        handleRefreshFailure();
        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  }
);

export default api;
