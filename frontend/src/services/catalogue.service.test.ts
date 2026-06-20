import { describe, it, expect, beforeEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '@/test/server';
import { catalogueService } from './catalogue.service';

const API = 'http://localhost:5000';

beforeEach(() => {
  localStorage.clear();
});

describe('catalogueService — endpoints catalogues', () => {
  describe('getCatalogues', () => {
    it('appelle GET /api/catalogues, transmet les params et renvoie data', async () => {
      let receivedUrl: URL | null = null;
      server.use(
        http.get(`${API}/api/catalogues`, ({ request }) => {
          receivedUrl = new URL(request.url);
          return HttpResponse.json({
            data: [{ id: 'cat-1', title: 'Mon catalogue' }],
            total: 1,
          });
        })
      );

      const result = await catalogueService.getCatalogues({
        page: 2,
        limit: 10,
        status: 'ENVOYE',
        clientId: 'cli-9',
        sortBy: 'createdAt',
        sortOrder: 'desc',
      });

      expect(receivedUrl).not.toBeNull();
      const params = receivedUrl!.searchParams;
      expect(params.get('page')).toBe('2');
      expect(params.get('limit')).toBe('10');
      expect(params.get('status')).toBe('ENVOYE');
      expect(params.get('clientId')).toBe('cli-9');
      expect(params.get('sortBy')).toBe('createdAt');
      expect(params.get('sortOrder')).toBe('desc');

      expect(result).toEqual({
        data: [{ id: 'cat-1', title: 'Mon catalogue' }],
        total: 1,
      });
    });

    it('propage une erreur 500', async () => {
      server.use(
        http.get(`${API}/api/catalogues`, () =>
          HttpResponse.json({ message: 'Erreur serveur' }, { status: 500 })
        )
      );

      await expect(catalogueService.getCatalogues()).rejects.toMatchObject({
        response: { status: 500 },
      });
    });
  });

  describe('getCatalogueById', () => {
    it('appelle GET /api/catalogues/:id et renvoie le catalogue', async () => {
      let receivedUrl: string | null = null;
      server.use(
        http.get(`${API}/api/catalogues/cat-42`, ({ request }) => {
          receivedUrl = request.url;
          return HttpResponse.json({ id: 'cat-42', title: 'Détail' });
        })
      );

      const result = await catalogueService.getCatalogueById('cat-42');

      expect(receivedUrl).toContain('/api/catalogues/cat-42');
      expect(result).toEqual({ id: 'cat-42', title: 'Détail' });
    });

    it('propage une erreur 404', async () => {
      server.use(
        http.get(`${API}/api/catalogues/inconnu`, () =>
          HttpResponse.json({ message: 'Introuvable' }, { status: 404 })
        )
      );

      await expect(catalogueService.getCatalogueById('inconnu')).rejects.toMatchObject({
        response: { status: 404 },
      });
    });
  });

  describe('createCatalogue', () => {
    it('appelle POST /api/catalogues, transmet le body et renvoie data', async () => {
      let receivedBody: any = null;
      server.use(
        http.post(`${API}/api/catalogues`, async ({ request }) => {
          receivedBody = await request.json();
          return HttpResponse.json({ id: 'cat-new', title: receivedBody.title }, { status: 201 });
        })
      );

      const payload = {
        clientId: 'cli-1',
        title: 'Nouveau catalogue',
        customMessage: 'Bonjour',
        candidateIds: ['can-1', 'can-2'],
        includeVideo: true,
      };

      const result = await catalogueService.createCatalogue(payload);

      expect(receivedBody).toEqual(payload);
      expect(result).toEqual({ id: 'cat-new', title: 'Nouveau catalogue' });
    });

    it('propage une erreur 400 (validation)', async () => {
      server.use(
        http.post(`${API}/api/catalogues`, () =>
          HttpResponse.json({ message: 'Données invalides' }, { status: 400 })
        )
      );

      await expect(
        catalogueService.createCatalogue({ clientId: '', title: '' })
      ).rejects.toMatchObject({ response: { status: 400 } });
    });
  });

  describe('updateCatalogue', () => {
    it('appelle PUT /api/catalogues/:id, transmet le body et renvoie data', async () => {
      let receivedBody: any = null;
      let receivedUrl: string | null = null;
      server.use(
        http.put(`${API}/api/catalogues/cat-7`, async ({ request }) => {
          receivedUrl = request.url;
          receivedBody = await request.json();
          return HttpResponse.json({ id: 'cat-7', status: 'ACCEPTE' });
        })
      );

      const result = await catalogueService.updateCatalogue('cat-7', {
        status: 'ACCEPTE',
        title: 'Titre modifié',
      });

      expect(receivedUrl).toContain('/api/catalogues/cat-7');
      expect(receivedBody).toEqual({ status: 'ACCEPTE', title: 'Titre modifié' });
      expect(result).toEqual({ id: 'cat-7', status: 'ACCEPTE' });
    });

    it('propage une erreur 403', async () => {
      server.use(
        http.put(`${API}/api/catalogues/cat-7`, () =>
          HttpResponse.json({ message: 'Interdit' }, { status: 403 })
        )
      );

      await expect(
        catalogueService.updateCatalogue('cat-7', { title: 'x' })
      ).rejects.toMatchObject({ response: { status: 403 } });
    });
  });

  describe('deleteCatalogue', () => {
    it('appelle DELETE /api/catalogues/:id et renvoie data', async () => {
      let receivedUrl: string | null = null;
      server.use(
        http.delete(`${API}/api/catalogues/cat-del`, ({ request }) => {
          receivedUrl = request.url;
          return HttpResponse.json({ message: 'Supprimé' });
        })
      );

      const result = await catalogueService.deleteCatalogue('cat-del');

      expect(receivedUrl).toContain('/api/catalogues/cat-del');
      expect(result).toEqual({ message: 'Supprimé' });
    });

    it('propage une erreur 404', async () => {
      server.use(
        http.delete(`${API}/api/catalogues/inconnu`, () =>
          HttpResponse.json({ message: 'Introuvable' }, { status: 404 })
        )
      );

      await expect(catalogueService.deleteCatalogue('inconnu')).rejects.toMatchObject({
        response: { status: 404 },
      });
    });
  });

  describe('generateShareLink', () => {
    it('appelle POST /api/catalogues/:id/share, transmet expirationDays et renvoie data', async () => {
      let receivedBody: any = null;
      let receivedUrl: string | null = null;
      server.use(
        http.post(`${API}/api/catalogues/cat-3/share`, async ({ request }) => {
          receivedUrl = request.url;
          receivedBody = await request.json();
          return HttpResponse.json({ url: 'https://example.com/s/abc', token: 'abc' });
        })
      );

      const result = await catalogueService.generateShareLink('cat-3', 7);

      expect(receivedUrl).toContain('/api/catalogues/cat-3/share');
      expect(receivedBody).toEqual({ expirationDays: 7 });
      expect(result).toEqual({ url: 'https://example.com/s/abc', token: 'abc' });
    });

    it('propage une erreur 500', async () => {
      server.use(
        http.post(`${API}/api/catalogues/cat-3/share`, () =>
          HttpResponse.json({ message: 'Erreur serveur' }, { status: 500 })
        )
      );

      await expect(catalogueService.generateShareLink('cat-3')).rejects.toMatchObject({
        response: { status: 500 },
      });
    });
  });

  describe('avec token (Authorization)', () => {
    it('transmet le header Authorization depuis localStorage sur getCatalogues', async () => {
      localStorage.setItem('accessToken', 't');
      let auth: string | null = null;
      server.use(
        http.get(`${API}/api/catalogues`, ({ request }) => {
          auth = request.headers.get('authorization');
          return HttpResponse.json({ data: [] });
        })
      );

      await catalogueService.getCatalogues();
      expect(auth).toBe('Bearer t');
    });
  });
});
