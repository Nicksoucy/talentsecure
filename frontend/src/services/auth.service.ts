import api from './api';
import {
  User,
  LoginCredentials,
  RegisterData,
  AuthTokens,
} from '@/types';

export const authService = {
  /**
   * Login with email/password
   */
  async login(credentials: LoginCredentials): Promise<{ user: User } & AuthTokens> {
    const response = await api.post('/api/auth/login', credentials);
    return response.data;
  },

  /**
   * Register new user
   */
  async register(data: RegisterData): Promise<{ user: User }> {
    const response = await api.post('/api/auth/register', data);
    return response.data;
  },

  /**
   * Get current user profile
   */
  async getProfile(): Promise<{ user: User }> {
    const response = await api.get('/api/auth/profile');
    return response.data;
  },

  /**
   * Logout
   */
  async logout(): Promise<void> {
    await api.post('/api/auth/logout');
  },

  /**
   * Refresh access token
   */
  async refreshToken(refreshToken: string): Promise<{ accessToken: string }> {
    const response = await api.post('/api/auth/refresh', { refreshToken });
    return response.data;
  },

  /**
   * Login with Google OAuth
   */
  initiateGoogleLogin(): void {
    window.location.href = `${import.meta.env.VITE_API_URL || 'http://localhost:5000'}/api/auth/google`;
  },
};
