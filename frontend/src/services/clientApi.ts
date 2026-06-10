import axios, { AxiosInstance, AxiosRequestConfig, AxiosError } from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080';

// Create axios instance for Client
const clientApi: AxiosInstance = axios.create({
    baseURL: API_URL,
    headers: {
        'Content-Type': 'application/json',
    },
});

// Request interceptor - Add auth token
clientApi.interceptors.request.use(
    (config) => {
        // Check for client token
        const token = localStorage.getItem('clientAccessToken');
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
let refreshPromise: Promise<string> | null = null;

const refreshAccessToken = async (): Promise<string> => {
    const refreshToken = localStorage.getItem('clientRefreshToken');
    if (!refreshToken) throw new Error('No refresh token');

    const response = await axios.post(`${API_URL}/api/client-auth/refresh`, { refreshToken });
    const { accessToken, refreshToken: newRefreshToken } = response.data;

    localStorage.setItem('clientAccessToken', accessToken);
    if (newRefreshToken) {
        localStorage.setItem('clientRefreshToken', newRefreshToken);
    }
    return accessToken;
};

const handleRefreshFailure = () => {
    localStorage.removeItem('clientAccessToken');
    localStorage.removeItem('clientRefreshToken');
    localStorage.removeItem('client');
    window.location.href = '/client/login';
};

// Response interceptor - Handle errors
clientApi.interceptors.response.use(
    (response) => response,
    async (error: AxiosError) => {
        const originalRequest = error.config as AxiosRequestConfig & {
            _retry?: boolean;
        };

        // Never attempt a token refresh for the auth endpoints themselves: a 401
        // from /login means "bad credentials" and must propagate to the page.
        const reqUrl = originalRequest.url || '';
        const isAuthEndpoint =
            reqUrl.includes('/client-auth/login') || reqUrl.includes('/client-auth/refresh');

        // If 401 and not already retried, try to refresh token
        if (error.response?.status === 401 && !originalRequest._retry && !isAuthEndpoint) {
            originalRequest._retry = true;

            try {
                const pending = refreshPromise ??
                    (refreshPromise = refreshAccessToken().finally(() => {
                        refreshPromise = null;
                    }));
                const accessToken = await pending;

                if (originalRequest.headers) {
                    originalRequest.headers.Authorization = `Bearer ${accessToken}`;
                }
                return clientApi(originalRequest);
            } catch (refreshError) {
                handleRefreshFailure();
                return Promise.reject(refreshError);
            }
        }

        return Promise.reject(error);
    }
);

export default clientApi;
