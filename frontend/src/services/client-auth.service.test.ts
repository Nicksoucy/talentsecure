import { describe, it, expect, beforeEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '@/test/server';
import { clientAuthService } from './client-auth.service';

const API = 'http://localhost:5000';

beforeEach(() => {
  localStorage.clear();
});

// NB : clientAuthService utilise une instance axios dédiée (clientApi) SANS
// intercepteurs ; le token est toujours passé explicitement en argument, jamais
// lu depuis localStorage. Aucune méthode ne déclenche de téléchargement
// (Blob/URL.createObjectURL) — rien à sauter.

describe('clientAuthService.login', () => {
  it('POST /api/client-auth/login avec le bon body et renvoie client + tokens', async () => {
    let receivedBody: unknown = null;
    server.use(
      http.post(`${API}/api/client-auth/login`, async ({ request }) => {
        receivedBody = await request.json();
        return HttpResponse.json({
          client: { id: 'c1', name: 'Acme', email: 'a@b.c' },
          accessToken: 'access-1',
          refreshToken: 'refresh-1',
        });
      })
    );

    const res = await clientAuthService.login({ email: 'a@b.c', password: 'secret' });

    expect(receivedBody).toEqual({ email: 'a@b.c', password: 'secret' });
    expect(res.client).toEqual({ id: 'c1', name: 'Acme', email: 'a@b.c' });
    expect(res.accessToken).toBe('access-1');
    expect(res.refreshToken).toBe('refresh-1');
  });

  it('propage l\'erreur en cas d\'identifiants invalides (401)', async () => {
    server.use(
      http.post(`${API}/api/client-auth/login`, () =>
        HttpResponse.json({ message: 'Identifiants invalides' }, { status: 401 })
      )
    );

    await expect(
      clientAuthService.login({ email: 'a@b.c', password: 'wrong' })
    ).rejects.toMatchObject({ response: { status: 401 } });
  });
});

describe('clientAuthService.getProfile', () => {
  it('GET /api/client-auth/profile avec le header Authorization et renvoie le client', async () => {
    let received: string | null = null;
    server.use(
      http.get(`${API}/api/client-auth/profile`, ({ request }) => {
        received = request.headers.get('authorization');
        return HttpResponse.json({ client: { id: 'c1', name: 'Acme', email: 'a@b.c' } });
      })
    );

    const res = await clientAuthService.getProfile('tok-abc');

    expect(received).toBe('Bearer tok-abc');
    expect(res.client).toEqual({ id: 'c1', name: 'Acme', email: 'a@b.c' });
  });

  it('propage l\'erreur si le token est invalide (401)', async () => {
    server.use(
      http.get(`${API}/api/client-auth/profile`, () => new HttpResponse(null, { status: 401 }))
    );

    await expect(clientAuthService.getProfile('bad')).rejects.toMatchObject({
      response: { status: 401 },
    });
  });
});

describe('clientAuthService.refreshToken', () => {
  it('POST /api/client-auth/refresh avec le refreshToken et renvoie un nouvel accessToken', async () => {
    let receivedBody: unknown = null;
    server.use(
      http.post(`${API}/api/client-auth/refresh`, async ({ request }) => {
        receivedBody = await request.json();
        return HttpResponse.json({ accessToken: 'new-access' });
      })
    );

    const res = await clientAuthService.refreshToken('refresh-1');

    expect(receivedBody).toEqual({ refreshToken: 'refresh-1' });
    expect(res.accessToken).toBe('new-access');
  });

  it('propage l\'erreur si le refreshToken est expiré (401)', async () => {
    server.use(
      http.post(`${API}/api/client-auth/refresh`, () => new HttpResponse(null, { status: 401 }))
    );

    await expect(clientAuthService.refreshToken('expired')).rejects.toMatchObject({
      response: { status: 401 },
    });
  });
});

describe('clientAuthService.getCatalogues', () => {
  it('GET /api/client-auth/catalogues avec le header Authorization et renvoie la liste', async () => {
    let received: string | null = null;
    const catalogues = [
      {
        id: 'cat1',
        title: 'Sélection A',
        status: 'SENT',
        requiresPayment: false,
        isPaid: false,
        isContentRestricted: false,
        createdAt: '2026-06-20T00:00:00.000Z',
        items: [],
      },
    ];
    server.use(
      http.get(`${API}/api/client-auth/catalogues`, ({ request }) => {
        received = request.headers.get('authorization');
        return HttpResponse.json(catalogues);
      })
    );

    const res = await clientAuthService.getCatalogues('tok-xyz');

    expect(received).toBe('Bearer tok-xyz');
    expect(res).toEqual(catalogues);
    expect(res).toHaveLength(1);
  });

  it('propage l\'erreur serveur (500)', async () => {
    server.use(
      http.get(`${API}/api/client-auth/catalogues`, () => new HttpResponse(null, { status: 500 }))
    );

    await expect(clientAuthService.getCatalogues('tok')).rejects.toMatchObject({
      response: { status: 500 },
    });
  });
});

describe('clientAuthService.getCatalogueById', () => {
  it('GET /api/client-auth/catalogues/:id (bon id + header) et renvoie le détail', async () => {
    let received: string | null = null;
    const detail = {
      id: 'cat42',
      title: 'Détail',
      status: 'SENT',
      requiresPayment: true,
      isPaid: true,
      isContentRestricted: false,
      createdAt: '2026-06-20T00:00:00.000Z',
      items: [],
    };
    server.use(
      http.get(`${API}/api/client-auth/catalogues/cat42`, ({ request }) => {
        received = request.headers.get('authorization');
        return HttpResponse.json(detail);
      })
    );

    const res = await clientAuthService.getCatalogueById('cat42', 'tok-detail');

    expect(received).toBe('Bearer tok-detail');
    expect(res).toEqual(detail);
  });

  it('propage l\'erreur si le catalogue est introuvable (404)', async () => {
    server.use(
      http.get(`${API}/api/client-auth/catalogues/missing`, () => new HttpResponse(null, { status: 404 }))
    );

    await expect(clientAuthService.getCatalogueById('missing', 'tok')).rejects.toMatchObject({
      response: { status: 404 },
    });
  });
});
