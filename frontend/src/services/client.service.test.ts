import { describe, it, expect, beforeEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '@/test/server';
import { clientService, type Client } from './client.service';

const API = 'http://localhost:5000';

const fakeClient: Client = {
  id: 'c-1',
  name: 'Acme inc.',
  email: 'contact@acme.test',
  isActive: true,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

beforeEach(() => {
  localStorage.clear();
});

describe('clientService', () => {
  describe('getClients', () => {
    it('appelle GET /api/clients et transmet les paramètres de requête', async () => {
      let receivedUrl = '';
      let method = '';
      server.use(
        http.get(`${API}/api/clients`, ({ request }) => {
          receivedUrl = request.url;
          method = request.method;
          return HttpResponse.json({
            data: [fakeClient],
            pagination: { total: 1, page: 2, limit: 10, totalPages: 1 },
          });
        })
      );

      const res = await clientService.getClients({
        search: 'acme',
        isActive: true,
        page: 2,
        limit: 10,
      });

      const url = new URL(receivedUrl);
      expect(method).toBe('GET');
      expect(url.pathname).toBe('/api/clients');
      expect(url.searchParams.get('search')).toBe('acme');
      expect(url.searchParams.get('isActive')).toBe('true');
      expect(url.searchParams.get('page')).toBe('2');
      expect(url.searchParams.get('limit')).toBe('10');
    });

    it('renvoie la réponse paginée mappée', async () => {
      server.use(
        http.get(`${API}/api/clients`, () =>
          HttpResponse.json({
            data: [fakeClient],
            pagination: { total: 1, page: 1, limit: 20, totalPages: 1 },
          })
        )
      );

      const res = await clientService.getClients();
      expect(res.data).toHaveLength(1);
      expect(res.data[0].id).toBe('c-1');
      expect(res.pagination.total).toBe(1);
    });

    it('propage une erreur 500', async () => {
      server.use(
        http.get(`${API}/api/clients`, () => new HttpResponse(null, { status: 500 }))
      );

      await expect(clientService.getClients()).rejects.toMatchObject({
        response: { status: 500 },
      });
    });
  });

  describe('getClientById', () => {
    it('appelle GET /api/clients/:id et renvoie le client', async () => {
      let method = '';
      server.use(
        http.get(`${API}/api/clients/c-1`, ({ request }) => {
          method = request.method;
          return HttpResponse.json({ data: fakeClient });
        })
      );

      const res = await clientService.getClientById('c-1');
      expect(method).toBe('GET');
      expect(res.data.id).toBe('c-1');
      expect(res.data.name).toBe('Acme inc.');
    });

    it('propage une erreur 404 si le client est introuvable', async () => {
      server.use(
        http.get(`${API}/api/clients/missing`, () =>
          HttpResponse.json({ message: 'Introuvable' }, { status: 404 })
        )
      );

      await expect(clientService.getClientById('missing')).rejects.toMatchObject({
        response: { status: 404 },
      });
    });
  });

  describe('createClient', () => {
    it('appelle POST /api/clients avec le corps transmis', async () => {
      let body: unknown;
      let method = '';
      server.use(
        http.post(`${API}/api/clients`, async ({ request }) => {
          method = request.method;
          body = await request.json();
          return HttpResponse.json(
            { data: fakeClient, message: 'Créé' },
            { status: 201 }
          );
        })
      );

      const payload = { name: 'Acme inc.', email: 'contact@acme.test' };
      const res = await clientService.createClient(payload);

      expect(method).toBe('POST');
      expect(body).toMatchObject(payload);
      expect(res.data.id).toBe('c-1');
      expect(res.message).toBe('Créé');
    });

    it('propage une erreur 400 (validation)', async () => {
      server.use(
        http.post(`${API}/api/clients`, () =>
          HttpResponse.json({ message: 'Email requis' }, { status: 400 })
        )
      );

      await expect(clientService.createClient({})).rejects.toMatchObject({
        response: { status: 400 },
      });
    });
  });

  describe('updateClient', () => {
    it('appelle PUT /api/clients/:id avec le corps transmis', async () => {
      let body: unknown;
      let method = '';
      server.use(
        http.put(`${API}/api/clients/c-1`, async ({ request }) => {
          method = request.method;
          body = await request.json();
          return HttpResponse.json({
            data: { ...fakeClient, name: 'Acme Renamed' },
            message: 'Mis à jour',
          });
        })
      );

      const res = await clientService.updateClient('c-1', { name: 'Acme Renamed' });

      expect(method).toBe('PUT');
      expect(body).toMatchObject({ name: 'Acme Renamed' });
      expect(res.data.name).toBe('Acme Renamed');
      expect(res.message).toBe('Mis à jour');
    });

    it('propage une erreur 403', async () => {
      server.use(
        http.put(`${API}/api/clients/c-1`, () => new HttpResponse(null, { status: 403 }))
      );

      await expect(
        clientService.updateClient('c-1', { name: 'X' })
      ).rejects.toMatchObject({ response: { status: 403 } });
    });
  });

  describe('deleteClient', () => {
    it('appelle DELETE /api/clients/:id avec le token et renvoie le message', async () => {
      localStorage.setItem('accessToken', 't');
      let method = '';
      let auth: string | null = null;
      server.use(
        http.delete(`${API}/api/clients/c-1`, ({ request }) => {
          method = request.method;
          auth = request.headers.get('authorization');
          return HttpResponse.json({ message: 'Désactivé' });
        })
      );

      const res = await clientService.deleteClient('c-1');

      expect(method).toBe('DELETE');
      expect(auth).toBe('Bearer t');
      expect(res.message).toBe('Désactivé');
    });

    it('propage une erreur 404', async () => {
      server.use(
        http.delete(`${API}/api/clients/missing`, () =>
          new HttpResponse(null, { status: 404 })
        )
      );

      await expect(clientService.deleteClient('missing')).rejects.toMatchObject({
        response: { status: 404 },
      });
    });
  });

  describe('reactivateClient', () => {
    it('appelle POST /api/clients/:id/reactivate', async () => {
      let method = '';
      server.use(
        http.post(`${API}/api/clients/c-1/reactivate`, ({ request }) => {
          method = request.method;
          return HttpResponse.json({
            data: { ...fakeClient, isActive: true },
            message: 'Réactivé',
          });
        })
      );

      const res = await clientService.reactivateClient('c-1');

      expect(method).toBe('POST');
      expect(res.data.isActive).toBe(true);
      expect(res.message).toBe('Réactivé');
    });
  });

  describe('register', () => {
    it('appelle POST /api/clients/register avec le corps transmis', async () => {
      let body: unknown;
      let method = '';
      server.use(
        http.post(`${API}/api/clients/register`, async ({ request }) => {
          method = request.method;
          body = await request.json();
          return HttpResponse.json(
            { data: fakeClient, message: 'Inscrit' },
            { status: 201 }
          );
        })
      );

      const payload = {
        name: 'Acme inc.',
        email: 'contact@acme.test',
        password: 'secret123',
      };
      const res = await clientService.register(payload);

      expect(method).toBe('POST');
      expect(body).toMatchObject(payload);
      expect(res.data.id).toBe('c-1');
      expect(res.message).toBe('Inscrit');
    });

    it('propage une erreur 409 (email déjà utilisé)', async () => {
      server.use(
        http.post(`${API}/api/clients/register`, () =>
          HttpResponse.json({ message: 'Email déjà utilisé' }, { status: 409 })
        )
      );

      await expect(
        clientService.register({
          name: 'Dup',
          email: 'dup@acme.test',
          password: 'secret123',
        })
      ).rejects.toMatchObject({ response: { status: 409 } });
    });
  });
});
