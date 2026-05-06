import { describe, it, expect, beforeEach } from 'vitest';
import { useClientAuthStore, type ClientUser } from './clientAuthStore';

const sampleClient: ClientUser = {
  id: 'client-1',
  name: 'Acme Inc',
  companyName: 'Acme Corporation',
  email: 'contact@acme.com',
};

describe('clientAuthStore', () => {
  beforeEach(() => {
    useClientAuthStore.getState().logout();
  });

  it('starts unauthenticated', () => {
    const state = useClientAuthStore.getState();
    expect(state.isAuthenticated).toBe(false);
    expect(state.client).toBeNull();
    expect(localStorage.getItem('clientAccessToken')).toBeNull();
  });

  it('persists separately from admin store keys', () => {
    useClientAuthStore.getState().setAuth(sampleClient, 'c-access', 'c-refresh');

    expect(localStorage.getItem('clientAccessToken')).toBe('c-access');
    expect(localStorage.getItem('clientRefreshToken')).toBe('c-refresh');
    expect(localStorage.getItem('client')).toBe(JSON.stringify(sampleClient));
    // Critical: must not pollute admin keys
    expect(localStorage.getItem('accessToken')).toBeNull();
    expect(localStorage.getItem('refreshToken')).toBeNull();
    expect(localStorage.getItem('user')).toBeNull();
  });

  it('logout clears all client-prefixed keys', () => {
    useClientAuthStore.getState().setAuth(sampleClient, 'c-access', 'c-refresh');
    useClientAuthStore.getState().logout();

    expect(useClientAuthStore.getState().isAuthenticated).toBe(false);
    expect(localStorage.getItem('clientAccessToken')).toBeNull();
    expect(localStorage.getItem('clientRefreshToken')).toBeNull();
    expect(localStorage.getItem('client')).toBeNull();
  });

  it('initializeFromStorage rehydrates from client-prefixed keys', () => {
    localStorage.setItem('clientAccessToken', 'c-access');
    localStorage.setItem('clientRefreshToken', 'c-refresh');
    localStorage.setItem('client', JSON.stringify(sampleClient));

    useClientAuthStore.getState().initializeFromStorage();

    const state = useClientAuthStore.getState();
    expect(state.isAuthenticated).toBe(true);
    expect(state.client).toEqual(sampleClient);
  });

  it('initializeFromStorage ignores admin keys', () => {
    // Admin-style keys present but no client keys → should NOT authenticate the client store
    localStorage.setItem('accessToken', 'admin-token');
    localStorage.setItem('refreshToken', 'admin-refresh');
    localStorage.setItem('user', JSON.stringify({ role: 'ADMIN' }));

    useClientAuthStore.getState().initializeFromStorage();

    expect(useClientAuthStore.getState().isAuthenticated).toBe(false);
  });
});
