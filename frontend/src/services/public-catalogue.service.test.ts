import { describe, it, expect } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '@/test/server';
import { publicCatalogueService, type PublicCatalogue } from './public-catalogue.service';

const API = 'http://localhost:5000';

// Fixture minimale conforme à l'interface PublicCatalogue.
const catalogue: PublicCatalogue = {
  id: 'cat-1',
  title: 'Catalogue de test',
  status: 'PUBLISHED',
  isContentRestricted: false,
  requiresPayment: false,
  isPaid: true,
  client: { id: 'cli-1', name: 'Acme' },
  items: [
    {
      id: 'item-1',
      order: 1,
      candidate: {
        id: 'can-1',
        firstName: 'Jean',
        lastName: 'Tremblay',
        city: 'Montréal',
        province: 'QC',
        status: 'ACTIVE',
      },
    },
  ],
};

describe('publicCatalogueService.getCatalogueByToken', () => {
  it('fait un GET sur /api/catalogues/view/:token avec le bon token', async () => {
    let receivedUrl: string | null = null;
    server.use(
      http.get(`${API}/api/catalogues/view/:token`, ({ request }) => {
        receivedUrl = request.url;
        return HttpResponse.json(catalogue);
      })
    );

    await publicCatalogueService.getCatalogueByToken('share-token-abc');

    expect(receivedUrl).toBe(`${API}/api/catalogues/view/share-token-abc`);
  });

  it('renvoie les données du catalogue (response.data)', async () => {
    server.use(
      http.get(`${API}/api/catalogues/view/:token`, () => HttpResponse.json(catalogue))
    );

    const result = await publicCatalogueService.getCatalogueByToken('tok');

    expect(result).toEqual(catalogue);
    expect(result.items[0].candidate.firstName).toBe('Jean');
  });

  it('n\'envoie PAS de header Authorization (instance publique, même si un token existe)', async () => {
    localStorage.setItem('accessToken', 't');
    let auth: string | null = 'sentinel';
    server.use(
      http.get(`${API}/api/catalogues/view/:token`, ({ request }) => {
        auth = request.headers.get('authorization');
        return HttpResponse.json(catalogue);
      })
    );

    await publicCatalogueService.getCatalogueByToken('tok');

    expect(auth).toBeNull();
  });

  it('propage l\'erreur en cas de 404 (token invalide / catalogue introuvable)', async () => {
    server.use(
      http.get(`${API}/api/catalogues/view/:token`, () =>
        HttpResponse.json({ message: 'Catalogue introuvable' }, { status: 404 })
      )
    );

    await expect(
      publicCatalogueService.getCatalogueByToken('mauvais-token')
    ).rejects.toMatchObject({ response: { status: 404 } });
  });

  it('propage l\'erreur en cas de 402 (paiement requis)', async () => {
    server.use(
      http.get(`${API}/api/catalogues/view/:token`, () =>
        HttpResponse.json({ message: 'Paiement requis' }, { status: 402 })
      )
    );

    await expect(
      publicCatalogueService.getCatalogueByToken('tok')
    ).rejects.toMatchObject({ response: { status: 402 } });
  });
});
