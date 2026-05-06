import { describe, it, expect, beforeEach } from 'vitest';
import { useAuthStore } from './authStore';
import type { User } from '@/types';

const sampleUser: User = {
  id: 'user-1',
  email: 'admin@xguard.ca',
  firstName: 'Admin',
  lastName: 'XGUARD',
  role: 'ADMIN',
  isActive: true,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
} as User;

describe('authStore', () => {
  beforeEach(() => {
    useAuthStore.getState().logout();
  });

  it('starts in unauthenticated state', () => {
    const state = useAuthStore.getState();
    expect(state.isAuthenticated).toBe(false);
    expect(state.user).toBeNull();
    expect(state.accessToken).toBeNull();
    expect(state.refreshToken).toBeNull();
    expect(localStorage.getItem('accessToken')).toBeNull();
  });

  it('persists tokens and user in localStorage on setAuth', () => {
    useAuthStore.getState().setAuth(sampleUser, 'access-123', 'refresh-456');

    const state = useAuthStore.getState();
    expect(state.isAuthenticated).toBe(true);
    expect(state.user).toEqual(sampleUser);
    expect(state.accessToken).toBe('access-123');
    expect(state.refreshToken).toBe('refresh-456');
    expect(localStorage.getItem('accessToken')).toBe('access-123');
    expect(localStorage.getItem('refreshToken')).toBe('refresh-456');
    expect(localStorage.getItem('user')).toBe(JSON.stringify(sampleUser));
  });

  it('logout clears storage and store completely', () => {
    useAuthStore.getState().setAuth(sampleUser, 'access-123', 'refresh-456');
    useAuthStore.getState().logout();

    const state = useAuthStore.getState();
    expect(state.isAuthenticated).toBe(false);
    expect(state.user).toBeNull();
    expect(localStorage.getItem('accessToken')).toBeNull();
    expect(localStorage.getItem('refreshToken')).toBeNull();
    expect(localStorage.getItem('user')).toBeNull();
  });

  it('initializeFromStorage rehydrates a valid session', () => {
    localStorage.setItem('accessToken', 'access-123');
    localStorage.setItem('refreshToken', 'refresh-456');
    localStorage.setItem('user', JSON.stringify(sampleUser));

    useAuthStore.getState().initializeFromStorage();

    const state = useAuthStore.getState();
    expect(state.isAuthenticated).toBe(true);
    expect(state.user).toEqual(sampleUser);
    expect(state.accessToken).toBe('access-123');
  });

  it('initializeFromStorage clears storage if user JSON is corrupted', () => {
    localStorage.setItem('accessToken', 'access-123');
    localStorage.setItem('refreshToken', 'refresh-456');
    localStorage.setItem('user', '{ this is not valid json');

    useAuthStore.getState().initializeFromStorage();

    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    expect(localStorage.getItem('accessToken')).toBeNull();
    expect(localStorage.getItem('user')).toBeNull();
  });

  it('initializeFromStorage stays unauthenticated if any key is missing', () => {
    // Only access token, no refresh / user → should not authenticate
    localStorage.setItem('accessToken', 'access-123');

    useAuthStore.getState().initializeFromStorage();

    expect(useAuthStore.getState().isAuthenticated).toBe(false);
  });
});
