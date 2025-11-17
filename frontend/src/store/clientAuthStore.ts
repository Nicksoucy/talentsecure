import { create } from 'zustand';

export interface ClientUser {
  id: string;
  name: string;
  companyName?: string;
  email: string;
}

interface ClientAuthState {
  client: ClientUser | null;
  accessToken: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;

  // Actions
  setAuth: (client: ClientUser, accessToken: string, refreshToken: string) => void;
  setClient: (client: ClientUser) => void;
  logout: () => void;
  initializeFromStorage: () => void;
}

export const useClientAuthStore = create<ClientAuthState>((set) => ({
  client: null,
  accessToken: null,
  refreshToken: null,
  isAuthenticated: false,

  setAuth: (client, accessToken, refreshToken) => {
    localStorage.setItem('clientAccessToken', accessToken);
    localStorage.setItem('clientRefreshToken', refreshToken);
    localStorage.setItem('client', JSON.stringify(client));
    set({
      client,
      accessToken,
      refreshToken,
      isAuthenticated: true,
    });
  },

  setClient: (client) => {
    localStorage.setItem('client', JSON.stringify(client));
    set({ client });
  },

  logout: () => {
    localStorage.removeItem('clientAccessToken');
    localStorage.removeItem('clientRefreshToken');
    localStorage.removeItem('client');
    set({
      client: null,
      accessToken: null,
      refreshToken: null,
      isAuthenticated: false,
    });
  },

  initializeFromStorage: () => {
    const accessToken = localStorage.getItem('clientAccessToken');
    const refreshToken = localStorage.getItem('clientRefreshToken');
    const clientStr = localStorage.getItem('client');

    if (accessToken && refreshToken && clientStr) {
      try {
        const client = JSON.parse(clientStr);
        set({
          client,
          accessToken,
          refreshToken,
          isAuthenticated: true,
        });
      } catch (error) {
        // If parsing fails, clear storage
        localStorage.removeItem('clientAccessToken');
        localStorage.removeItem('clientRefreshToken');
        localStorage.removeItem('client');
      }
    }
  },
}));
