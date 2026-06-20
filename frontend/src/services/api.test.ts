import { describe, it, expect, beforeEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '@/test/server';
import api from './api';

const API = 'http://localhost:5000';

beforeEach(() => {
  localStorage.clear();
});

describe('api.ts — intercepteurs axios', () => {
  it('ajoute le header Authorization depuis localStorage', async () => {
    localStorage.setItem('accessToken', 'tok-123');
    let received: string | null = null;
    server.use(
      http.get(`${API}/api/ping`, ({ request }) => {
        received = request.headers.get('authorization');
        return HttpResponse.json({ ok: true });
      })
    );

    await api.get('/api/ping');
    expect(received).toBe('Bearer tok-123');
  });

  it('n\'ajoute pas Authorization si aucun token en localStorage', async () => {
    let received: string | null = 'x';
    server.use(
      http.get(`${API}/api/ping`, ({ request }) => {
        received = request.headers.get('authorization');
        return HttpResponse.json({ ok: true });
      })
    );

    await api.get('/api/ping');
    expect(received).toBeNull();
  });

  it('401 → refresh → rejoue la requête avec le nouveau token', async () => {
    localStorage.setItem('accessToken', 'old');
    localStorage.setItem('refreshToken', 'refresh-1');
    let refreshCalls = 0;
    server.use(
      http.get(`${API}/api/secure`, ({ request }) => {
        if (request.headers.get('authorization') === 'Bearer new-token') {
          return HttpResponse.json({ ok: true, value: 42 });
        }
        return new HttpResponse(null, { status: 401 });
      }),
      http.post(`${API}/api/auth/refresh`, () => {
        refreshCalls += 1;
        return HttpResponse.json({ accessToken: 'new-token', refreshToken: 'refresh-2' });
      })
    );

    const res = await api.get('/api/secure');
    expect(res.data.value).toBe(42);
    expect(refreshCalls).toBe(1);
    expect(localStorage.getItem('accessToken')).toBe('new-token');
    expect(localStorage.getItem('refreshToken')).toBe('refresh-2');
  });

  it('anti-race : 3 requêtes 401 concurrentes ne déclenchent qu\'UN seul refresh', async () => {
    localStorage.setItem('accessToken', 'old');
    localStorage.setItem('refreshToken', 'refresh-1');
    let refreshCalls = 0;
    server.use(
      http.get(`${API}/api/secure`, ({ request }) => {
        if (request.headers.get('authorization') === 'Bearer new-token') {
          return HttpResponse.json({ ok: true });
        }
        return new HttpResponse(null, { status: 401 });
      }),
      http.post(`${API}/api/auth/refresh`, () => {
        refreshCalls += 1;
        return HttpResponse.json({ accessToken: 'new-token' });
      })
    );

    await Promise.all([
      api.get('/api/secure'),
      api.get('/api/secure'),
      api.get('/api/secure'),
    ]);
    expect(refreshCalls).toBe(1);
  });

  it('un 401 sur /auth/login ne déclenche PAS de refresh et propage l\'erreur', async () => {
    localStorage.setItem('refreshToken', 'refresh-1');
    let refreshCalls = 0;
    server.use(
      http.post(`${API}/api/auth/login`, () =>
        HttpResponse.json({ message: 'Identifiants invalides' }, { status: 401 })
      ),
      http.post(`${API}/api/auth/refresh`, () => {
        refreshCalls += 1;
        return HttpResponse.json({ accessToken: 'x' });
      })
    );

    await expect(api.post('/api/auth/login', { email: 'a@b.c', password: 'x' })).rejects.toMatchObject({
      response: { status: 401 },
    });
    expect(refreshCalls).toBe(0);
  });

  it('échec du refresh → vide localStorage (puis redirige vers /login)', async () => {
    localStorage.setItem('accessToken', 'old');
    localStorage.setItem('refreshToken', 'refresh-bad');

    server.use(
      http.get(`${API}/api/secure`, () => new HttpResponse(null, { status: 401 })),
      http.post(`${API}/api/auth/refresh`, () => new HttpResponse(null, { status: 401 }))
    );

    // handleRefreshFailure() vide localStorage puis fait window.location.href = '/login'
    // (jsdom logue « Not implemented: navigation » — inoffensif). Le vidage de
    // localStorage prouve que le chemin d'échec du refresh s'est bien exécuté.
    await expect(api.get('/api/secure')).rejects.toBeDefined();
    expect(localStorage.getItem('accessToken')).toBeNull();
    expect(localStorage.getItem('refreshToken')).toBeNull();
  });
});
