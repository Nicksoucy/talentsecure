import { describe, it, expect, beforeEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '@/test/server';
import { authService } from './auth.service';
import type { User } from '@/types';

const API = 'http://localhost:5000';

const fakeUser: User = {
  id: 'u-1',
  email: 'jane@example.com',
  firstName: 'Jane',
  lastName: 'Doe',
  role: 'RH_RECRUITER',
  isActive: true,
  createdAt: '2026-01-01T00:00:00.000Z',
};

beforeEach(() => {
  localStorage.clear();
});

describe('authService — service d\'authentification', () => {
  describe('login()', () => {
    it('POST /api/auth/login avec les identifiants et renvoie user + tokens', async () => {
      let body: unknown = null;
      let method = '';
      let path = '';
      server.use(
        http.post(`${API}/api/auth/login`, async ({ request }) => {
          method = request.method;
          path = new URL(request.url).pathname;
          body = await request.json();
          return HttpResponse.json({
            user: fakeUser,
            accessToken: 'acc-1',
            refreshToken: 'ref-1',
          });
        })
      );

      const result = await authService.login({
        email: 'jane@example.com',
        password: 's3cret',
      });

      expect(method).toBe('POST');
      expect(path).toBe('/api/auth/login');
      expect(body).toEqual({ email: 'jane@example.com', password: 's3cret' });
      expect(result).toEqual({
        user: fakeUser,
        accessToken: 'acc-1',
        refreshToken: 'ref-1',
      });
    });

    it('propage une erreur 401 (identifiants invalides)', async () => {
      server.use(
        http.post(`${API}/api/auth/login`, () =>
          HttpResponse.json({ message: 'Identifiants invalides' }, { status: 401 })
        )
      );

      await expect(
        authService.login({ email: 'bad@example.com', password: 'nope' })
      ).rejects.toMatchObject({ response: { status: 401 } });
    });
  });

  describe('register()', () => {
    it('POST /api/auth/register avec les données et renvoie le user créé', async () => {
      let body: unknown = null;
      server.use(
        http.post(`${API}/api/auth/register`, async ({ request }) => {
          body = await request.json();
          return HttpResponse.json({ user: fakeUser }, { status: 201 });
        })
      );

      const payload = {
        email: 'jane@example.com',
        password: 's3cret',
        firstName: 'Jane',
        lastName: 'Doe',
        role: 'RH_RECRUITER' as const,
      };
      const result = await authService.register(payload);

      expect(body).toEqual(payload);
      expect(result).toEqual({ user: fakeUser });
    });

    it('propage une erreur 409 (email déjà utilisé)', async () => {
      server.use(
        http.post(`${API}/api/auth/register`, () =>
          HttpResponse.json({ message: 'Email déjà utilisé' }, { status: 409 })
        )
      );

      await expect(
        authService.register({
          email: 'dup@example.com',
          password: 'x',
          firstName: 'A',
          lastName: 'B',
        })
      ).rejects.toMatchObject({ response: { status: 409 } });
    });
  });

  describe('getProfile()', () => {
    it('GET /api/auth/profile avec le header Authorization et renvoie le user', async () => {
      localStorage.setItem('accessToken', 't-abc');
      let method = '';
      let path = '';
      let auth: string | null = null;
      server.use(
        http.get(`${API}/api/auth/profile`, ({ request }) => {
          method = request.method;
          path = new URL(request.url).pathname;
          auth = request.headers.get('authorization');
          return HttpResponse.json({ user: fakeUser });
        })
      );

      const result = await authService.getProfile();

      expect(method).toBe('GET');
      expect(path).toBe('/api/auth/profile');
      expect(auth).toBe('Bearer t-abc');
      expect(result).toEqual({ user: fakeUser });
    });

    it('propage une erreur 500 du serveur', async () => {
      localStorage.setItem('accessToken', 't-abc');
      server.use(
        http.get(`${API}/api/auth/profile`, () => new HttpResponse(null, { status: 500 }))
      );

      await expect(authService.getProfile()).rejects.toMatchObject({
        response: { status: 500 },
      });
    });
  });

  describe('logout()', () => {
    it('POST /api/auth/logout et résout sans valeur', async () => {
      let method = '';
      let path = '';
      server.use(
        http.post(`${API}/api/auth/logout`, ({ request }) => {
          method = request.method;
          path = new URL(request.url).pathname;
          return HttpResponse.json({ message: 'Déconnecté' });
        })
      );

      await expect(authService.logout()).resolves.toBeUndefined();
      expect(method).toBe('POST');
      expect(path).toBe('/api/auth/logout');
    });
  });

  describe('refreshToken()', () => {
    it('POST /api/auth/refresh avec le refreshToken et renvoie le nouvel accessToken', async () => {
      let body: unknown = null;
      let path = '';
      server.use(
        http.post(`${API}/api/auth/refresh`, async ({ request }) => {
          path = new URL(request.url).pathname;
          body = await request.json();
          return HttpResponse.json({ accessToken: 'new-acc' });
        })
      );

      const result = await authService.refreshToken('ref-xyz');

      expect(path).toBe('/api/auth/refresh');
      expect(body).toEqual({ refreshToken: 'ref-xyz' });
      expect(result).toEqual({ accessToken: 'new-acc' });
    });

    it('propage une erreur 401 (refresh token invalide) sans boucle de refresh', async () => {
      server.use(
        http.post(`${API}/api/auth/refresh`, () => new HttpResponse(null, { status: 401 }))
      );

      await expect(authService.refreshToken('expired')).rejects.toMatchObject({
        response: { status: 401 },
      });
    });
  });

  describe('initiateGoogleLogin()', () => {
    it('redirige vers l\'endpoint OAuth Google du backend', () => {
      // jsdom bloque la vraie navigation : on capture l'affectation de href.
      const original = window.location;
      let assigned = '';
      Object.defineProperty(window, 'location', {
        configurable: true,
        value: {
          ...original,
          set href(value: string) {
            assigned = value;
          },
          get href() {
            return assigned;
          },
        },
      });

      try {
        authService.initiateGoogleLogin();
        expect(assigned).toContain('/api/auth/google');
        expect(assigned).toBe('http://localhost:5000/api/auth/google');
      } finally {
        Object.defineProperty(window, 'location', {
          configurable: true,
          value: original,
        });
      }
    });
  });
});
