import { describe, it, expect, beforeEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '@/test/server';
import { talentMarketplaceService } from './talent-marketplace.service';

const API = 'http://localhost:5000';

// clientApi (utilisé par le service) lit le token sous la clé `clientAccessToken`.
const TOKEN_KEY = 'clientAccessToken';

beforeEach(() => {
  localStorage.clear();
});

describe('talentMarketplaceService — recherche & catalogue', () => {
  it('searchByCity → GET /api/marketplace/talents avec les bons query params et données mappées', async () => {
    let received: URL | null = null;
    server.use(
      http.get(`${API}/api/marketplace/talents`, ({ request }) => {
        received = new URL(request.url);
        return HttpResponse.json({
          data: [
            { id: 't1', firstName: 'Jean', city: 'Montréal', province: 'QC', globalRating: 4.5, status: 'AVAILABLE' },
          ],
          total: 1,
          city: 'Montréal',
        });
      })
    );

    const res = await talentMarketplaceService.searchByCity({
      city: 'Montréal',
      mode: 'evaluated',
      minRating: 4,
      hasVehicle: true,
    });

    // (a) bon endpoint + params transmis
    expect(received).not.toBeNull();
    expect(received!.pathname).toBe('/api/marketplace/talents');
    expect(received!.searchParams.get('city')).toBe('Montréal');
    expect(received!.searchParams.get('mode')).toBe('evaluated');
    expect(received!.searchParams.get('minRating')).toBe('4');
    expect(received!.searchParams.get('hasVehicle')).toBe('true');

    // (b) donnée renvoyée correcte (réponse mappée)
    expect(res.total).toBe(1);
    expect(res.city).toBe('Montréal');
    expect(res.data).toHaveLength(1);
    expect(res.data[0]).toMatchObject({ id: 't1', firstName: 'Jean', city: 'Montréal' });
  });

  it('searchByCity → propage une erreur 500 (rejects)', async () => {
    server.use(
      http.get(`${API}/api/marketplace/talents`, () =>
        HttpResponse.json({ message: 'Erreur serveur' }, { status: 500 })
      )
    );

    await expect(talentMarketplaceService.searchByCity({ city: 'Laval' })).rejects.toMatchObject({
      response: { status: 500 },
    });
  });

  it('getAvailableCities → GET /api/marketplace/cities et renvoie la liste des villes', async () => {
    let called = false;
    server.use(
      http.get(`${API}/api/marketplace/cities`, () => {
        called = true;
        return HttpResponse.json({
          data: [
            { city: 'Montréal', province: 'QC', count: 12 },
            { city: 'Québec', province: 'QC', count: 5 },
          ],
        });
      })
    );

    const res = await talentMarketplaceService.getAvailableCities();

    expect(called).toBe(true);
    expect(res.data).toHaveLength(2);
    expect(res.data[0]).toMatchObject({ city: 'Montréal', province: 'QC', count: 12 });
  });
});

describe('talentMarketplaceService — détail & vidéo', () => {
  it('getTalentDetail → GET /api/marketplace/talents/:id avec le bon id', async () => {
    let path: string | null = null;
    server.use(
      http.get(`${API}/api/marketplace/talents/:id`, ({ request, params }) => {
        path = new URL(request.url).pathname;
        return HttpResponse.json({
          data: { id: params.id, firstName: 'Marie', city: 'Gatineau', province: 'QC', globalRating: 4.2, status: 'AVAILABLE', purchased: false },
        });
      })
    );

    const res = await talentMarketplaceService.getTalentDetail('abc-123');

    expect(path).toBe('/api/marketplace/talents/abc-123');
    expect(res.data).toMatchObject({ id: 'abc-123', firstName: 'Marie', purchased: false });
  });

  it('getTalentVideoUrl → GET /api/marketplace/talents/:id/video et renvoie l\'URL signée', async () => {
    let path: string | null = null;
    server.use(
      http.get(`${API}/api/marketplace/talents/:id/video`, ({ request }) => {
        path = new URL(request.url).pathname;
        return HttpResponse.json({ success: true, data: { videoUrl: 'https://signed.example/video.mp4' } });
      })
    );

    const res = await talentMarketplaceService.getTalentVideoUrl('vid-9');

    expect(path).toBe('/api/marketplace/talents/vid-9/video');
    expect(res.success).toBe(true);
    expect(res.data.videoUrl).toBe('https://signed.example/video.mp4');
  });

  it('getTalentVideoUrl → propage une erreur 404 (rejects)', async () => {
    server.use(
      http.get(`${API}/api/marketplace/talents/:id/video`, () =>
        HttpResponse.json({ message: 'Vidéo introuvable' }, { status: 404 })
      )
    );

    await expect(talentMarketplaceService.getTalentVideoUrl('missing')).rejects.toMatchObject({
      response: { status: 404 },
    });
  });
});

describe('talentMarketplaceService — achat (authentifié)', () => {
  it('checkout → POST /api/marketplace/talents/:id/checkout avec le header Authorization et renvoie l\'URL Stripe', async () => {
    localStorage.setItem(TOKEN_KEY, 't');
    let method: string | null = null;
    let path: string | null = null;
    let auth: string | null = null;
    server.use(
      http.post(`${API}/api/marketplace/talents/:id/checkout`, ({ request }) => {
        method = request.method;
        path = new URL(request.url).pathname;
        auth = request.headers.get('authorization');
        return HttpResponse.json({ url: 'https://checkout.stripe.com/pay/cs_test_123' });
      })
    );

    const res = await talentMarketplaceService.checkout('cand-7');

    expect(method).toBe('POST');
    expect(path).toBe('/api/marketplace/talents/cand-7/checkout');
    expect(auth).toBe('Bearer t');
    expect(res.url).toBe('https://checkout.stripe.com/pay/cs_test_123');
  });

  it('getPurchases → GET /api/marketplace/purchases et renvoie les candidats achetés avec coordonnées', async () => {
    localStorage.setItem(TOKEN_KEY, 't');
    let path: string | null = null;
    server.use(
      http.get(`${API}/api/marketplace/purchases`, ({ request }) => {
        path = new URL(request.url).pathname;
        return HttpResponse.json({
          data: [
            {
              id: 'p1',
              price: 4900,
              city: 'Montréal',
              purchasedAt: '2026-06-19T00:00:00.000Z',
              candidate: {
                id: 'c1',
                firstName: 'Jean',
                lastName: 'Tremblay',
                email: 'jean@example.com',
                phone: '514-555-0000',
                city: 'Montréal',
                province: 'QC',
                globalRating: 4.5,
                clientNote: null,
              },
            },
          ],
        });
      })
    );

    const res = await talentMarketplaceService.getPurchases();

    expect(path).toBe('/api/marketplace/purchases');
    expect(res.data).toHaveLength(1);
    expect(res.data[0]).toMatchObject({ id: 'p1', price: 4900 });
    expect(res.data[0].candidate).toMatchObject({
      lastName: 'Tremblay',
      email: 'jean@example.com',
      phone: '514-555-0000',
    });
  });

  it('checkout → propage une erreur 402 (paiement requis / rejects)', async () => {
    localStorage.setItem(TOKEN_KEY, 't');
    server.use(
      http.post(`${API}/api/marketplace/talents/:id/checkout`, () =>
        HttpResponse.json({ message: 'Paiement requis' }, { status: 402 })
      )
    );

    await expect(talentMarketplaceService.checkout('cand-7')).rejects.toMatchObject({
      response: { status: 402 },
    });
  });
});
