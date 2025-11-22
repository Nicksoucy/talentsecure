import axios, { AxiosInstance, AxiosRequestConfig, AxiosError } from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

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

// Response interceptor - Handle errors
clientApi.interceptors.response.use(
    (response) => response,
    async (error: AxiosError) => {
        const originalRequest = error.config as AxiosRequestConfig & {
            _retry?: boolean;
        };

        // If 401 and not already retried, try to refresh token
        if (error.response?.status === 401 && !originalRequest._retry) {
            originalRequest._retry = true;

            try {
                const refreshToken = localStorage.getItem('clientRefreshToken');
                if (refreshToken) {
                    // Call refresh endpoint for client
                    const response = await axios.post(`${API_URL}/api/client-auth/refresh`, {
                        refreshToken,
                    });

                    const { accessToken, refreshToken: newRefreshToken } = response.data;

                    // Update storage
                    localStorage.setItem('clientAccessToken', accessToken);
                    if (newRefreshToken) {
                        localStorage.setItem('clientRefreshToken', newRefreshToken);
                    }

                    // Retry original request
                    if (originalRequest.headers) {
                        originalRequest.headers.Authorization = `Bearer ${accessToken}`;
                    }
                    return clientApi(originalRequest);
                }
            } catch (refreshError) {
                // Refresh failed, logout user
                localStorage.removeItem('clientAccessToken');
                localStorage.removeItem('clientRefreshToken');
                localStorage.removeItem('client');
                window.location.href = '/client/login';
                return Promise.reject(refreshError);
            }
        }

        return Promise.reject(error);
    }
);

export default clientApi;
