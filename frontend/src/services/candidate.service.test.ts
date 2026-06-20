import { describe, it, expect, beforeEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '@/test/server';
import { candidateService } from './candidate.service';

const API = 'http://localhost:5000';

beforeEach(() => {
  localStorage.clear();
  // Token présent : la plupart des endpoints sont protégés côté app.
  localStorage.setItem('accessToken', 't');
});

// NB volontairement non testées sous jsdom :
//   - exportCandidatesCSV → responseType:'blob' (téléchargement de fichier)
//   - uploadFileToUrl → XMLHttpRequest brut + réécriture proxy R2 (pas axios/MSW)
//   - uploadVideo → POST multipart/form-data : le header forcé sans boundary +
//     FormData ne se sérialise/parse pas correctement sous jsdom/undici (MSW lève
//     "Content-Type was not multipart/form-data"). Le chemin "signed URL" (initiate
//     + complete, en JSON) est lui couvert ci-dessous.

describe('candidateService.getCandidates', () => {
  it('GET /api/candidates avec les params et mappe near → nearLat/nearLng/nearRadiusKm', async () => {
    let url: URL | null = null;
    server.use(
      http.get(`${API}/api/candidates`, ({ request }) => {
        url = new URL(request.url);
        return HttpResponse.json({
          data: [{ id: 'c1' }],
          pagination: { total: 1, page: 1, limit: 20, totalPages: 1 },
        });
      })
    );

    const res = await candidateService.getCandidates({
      search: 'jean',
      page: 2,
      limit: 20,
      near: { lat: 45.5, lng: -73.5, radiusKm: 10 },
    });

    expect(url!.pathname).toBe('/api/candidates');
    expect(url!.searchParams.get('search')).toBe('jean');
    expect(url!.searchParams.get('page')).toBe('2');
    expect(url!.searchParams.get('nearLat')).toBe('45.5');
    expect(url!.searchParams.get('nearLng')).toBe('-73.5');
    expect(url!.searchParams.get('nearRadiusKm')).toBe('10');
    // `near` lui-même n'est pas envoyé brut.
    expect(url!.searchParams.has('near')).toBe(false);
    expect(res.data).toEqual([{ id: 'c1' }]);
    expect(res.pagination.total).toBe(1);
  });

  it('fonctionne sans params', async () => {
    server.use(
      http.get(`${API}/api/candidates`, () =>
        HttpResponse.json({
          data: [],
          pagination: { total: 0, page: 1, limit: 20, totalPages: 0 },
        })
      )
    );
    const res = await candidateService.getCandidates();
    expect(res.data).toEqual([]);
  });

  it('propage une erreur 500', async () => {
    server.use(
      http.get(`${API}/api/candidates`, () => new HttpResponse(null, { status: 500 }))
    );
    await expect(candidateService.getCandidates()).rejects.toMatchObject({
      response: { status: 500 },
    });
  });
});

describe('candidateService.getCandidateById', () => {
  it('GET /api/candidates/:id et renvoie le candidat', async () => {
    let path: string | null = null;
    server.use(
      http.get(`${API}/api/candidates/c42`, ({ request }) => {
        path = new URL(request.url).pathname;
        return HttpResponse.json({ data: { id: 'c42', firstName: 'Léa' } });
      })
    );
    const res = await candidateService.getCandidateById('c42');
    expect(path).toBe('/api/candidates/c42');
    expect(res.data).toMatchObject({ id: 'c42', firstName: 'Léa' });
  });

  it('propage une erreur 404', async () => {
    server.use(
      http.get(`${API}/api/candidates/nope`, () => new HttpResponse(null, { status: 404 }))
    );
    await expect(candidateService.getCandidateById('nope')).rejects.toMatchObject({
      response: { status: 404 },
    });
  });
});

describe('candidateService.createCandidate', () => {
  it('POST /api/candidates avec le body', async () => {
    let body: any = null;
    server.use(
      http.post(`${API}/api/candidates`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ data: { id: 'new1' }, message: 'Créé' });
      })
    );
    const res = await candidateService.createCandidate({ firstName: 'Marc', email: 'm@x.c' });
    expect(body).toEqual({ firstName: 'Marc', email: 'm@x.c' });
    expect(res.data.id).toBe('new1');
    expect(res.message).toBe('Créé');
  });

  it('propage une erreur 400', async () => {
    server.use(
      http.post(`${API}/api/candidates`, () =>
        HttpResponse.json({ message: 'Validation' }, { status: 400 })
      )
    );
    await expect(candidateService.createCandidate({})).rejects.toMatchObject({
      response: { status: 400 },
    });
  });
});

describe('candidateService.updateCandidate', () => {
  it('PUT /api/candidates/:id avec le body', async () => {
    let body: any = null;
    let path: string | null = null;
    server.use(
      http.put(`${API}/api/candidates/c7`, async ({ request }) => {
        path = new URL(request.url).pathname;
        body = await request.json();
        return HttpResponse.json({ data: { id: 'c7' }, message: 'MAJ' });
      })
    );
    const res = await candidateService.updateCandidate('c7', { rating: 5 });
    expect(path).toBe('/api/candidates/c7');
    expect(body).toEqual({ rating: 5 });
    expect(res.message).toBe('MAJ');
  });

  it('propage une erreur 403', async () => {
    server.use(
      http.put(`${API}/api/candidates/c7`, () => new HttpResponse(null, { status: 403 }))
    );
    await expect(candidateService.updateCandidate('c7', {})).rejects.toMatchObject({
      response: { status: 403 },
    });
  });
});

describe('candidateService.deleteCandidate', () => {
  it('DELETE /api/candidates/:id', async () => {
    let path: string | null = null;
    server.use(
      http.delete(`${API}/api/candidates/c9`, ({ request }) => {
        path = new URL(request.url).pathname;
        return HttpResponse.json({ message: 'Supprimé' });
      })
    );
    const res = await candidateService.deleteCandidate('c9');
    expect(path).toBe('/api/candidates/c9');
    expect(res.message).toBe('Supprimé');
  });

  it('propage une erreur 500', async () => {
    server.use(
      http.delete(`${API}/api/candidates/c9`, () => new HttpResponse(null, { status: 500 }))
    );
    await expect(candidateService.deleteCandidate('c9')).rejects.toMatchObject({
      response: { status: 500 },
    });
  });
});

describe('candidateService.archiveCandidate / unarchiveCandidate', () => {
  it('PATCH /api/candidates/:id/archive', async () => {
    let path: string | null = null;
    server.use(
      http.patch(`${API}/api/candidates/c1/archive`, ({ request }) => {
        path = new URL(request.url).pathname;
        return HttpResponse.json({ message: 'Archivé', data: { id: 'c1' } });
      })
    );
    const res = await candidateService.archiveCandidate('c1');
    expect(path).toBe('/api/candidates/c1/archive');
    expect(res.data.id).toBe('c1');
  });

  it('PATCH /api/candidates/:id/unarchive', async () => {
    let path: string | null = null;
    server.use(
      http.patch(`${API}/api/candidates/c1/unarchive`, ({ request }) => {
        path = new URL(request.url).pathname;
        return HttpResponse.json({ message: 'Restauré', data: { id: 'c1' } });
      })
    );
    const res = await candidateService.unarchiveCandidate('c1');
    expect(path).toBe('/api/candidates/c1/unarchive');
    expect(res.message).toBe('Restauré');
  });

  it('archive propage une erreur 404', async () => {
    server.use(
      http.patch(`${API}/api/candidates/c1/archive`, () => new HttpResponse(null, { status: 404 }))
    );
    await expect(candidateService.archiveCandidate('c1')).rejects.toMatchObject({
      response: { status: 404 },
    });
  });
});

describe('candidateService.getCitiesSuggestions', () => {
  it('GET /api/candidates/suggestions/cities avec ?q=', async () => {
    let url: URL | null = null;
    server.use(
      http.get(`${API}/api/candidates/suggestions/cities`, ({ request }) => {
        url = new URL(request.url);
        return HttpResponse.json({ success: true, data: ['Montréal', 'Laval'] });
      })
    );
    const res = await candidateService.getCitiesSuggestions('mon');
    expect(url!.searchParams.get('q')).toBe('mon');
    expect(res.data).toEqual(['Montréal', 'Laval']);
  });

  it('sans query → pas de paramètre q', async () => {
    let url: URL | null = null;
    server.use(
      http.get(`${API}/api/candidates/suggestions/cities`, ({ request }) => {
        url = new URL(request.url);
        return HttpResponse.json({ success: true, data: [] });
      })
    );
    await candidateService.getCitiesSuggestions();
    expect(url!.searchParams.has('q')).toBe(false);
  });
});

describe('candidateService.getCandidatesSuggestions', () => {
  it('GET /api/candidates/suggestions/names avec ?q=', async () => {
    let url: URL | null = null;
    server.use(
      http.get(`${API}/api/candidates/suggestions/names`, ({ request }) => {
        url = new URL(request.url);
        return HttpResponse.json({
          success: true,
          data: [{ id: 'c1', label: 'Léa T.', email: 'lea@x.c' }],
        });
      })
    );
    const res = await candidateService.getCandidatesSuggestions('lé');
    expect(url!.searchParams.get('q')).toBe('lé');
    expect(res.data[0]).toMatchObject({ id: 'c1', email: 'lea@x.c' });
  });

  it('propage une erreur 500', async () => {
    server.use(
      http.get(
        `${API}/api/candidates/suggestions/names`,
        () => new HttpResponse(null, { status: 500 })
      )
    );
    await expect(candidateService.getCandidatesSuggestions('x')).rejects.toMatchObject({
      response: { status: 500 },
    });
  });
});

describe('candidateService.initiateVideoUpload / completeVideoUpload', () => {
  it('POST /api/candidates/:id/video/initiate-upload avec filename+contentType', async () => {
    let body: any = null;
    server.use(
      http.post(`${API}/api/candidates/c1/video/initiate-upload`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({
          success: true,
          data: { signedUrl: 'https://s/u', key: 'k1', provider: 'r2', expiresIn: 3600 },
        });
      })
    );
    const res = await candidateService.initiateVideoUpload('c1', 'clip.mp4', 'video/mp4');
    expect(body).toEqual({ filename: 'clip.mp4', contentType: 'video/mp4' });
    expect(res.data.key).toBe('k1');
  });

  it('POST /api/candidates/:id/video/complete-upload avec la key', async () => {
    let body: any = null;
    server.use(
      http.post(`${API}/api/candidates/c1/video/complete-upload`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ success: true, message: 'Terminé', data: {} });
      })
    );
    const res = await candidateService.completeVideoUpload('c1', 'k1');
    expect(body).toEqual({ key: 'k1' });
    expect(res.message).toBe('Terminé');
  });
});

describe('candidateService.getVideoUrl / deleteVideo', () => {
  it('GET /api/candidates/:id/video', async () => {
    server.use(
      http.get(`${API}/api/candidates/c1/video`, () =>
        HttpResponse.json({
          success: true,
          data: { videoUrl: 'https://s/v', videoUploadedAt: '2026-01-01', candidateName: 'Léa' },
        })
      )
    );
    const res = await candidateService.getVideoUrl('c1');
    expect(res.data.videoUrl).toBe('https://s/v');
  });

  it('DELETE /api/candidates/:id/video', async () => {
    let path: string | null = null;
    server.use(
      http.delete(`${API}/api/candidates/c1/video`, ({ request }) => {
        path = new URL(request.url).pathname;
        return HttpResponse.json({ success: true, message: 'Vidéo supprimée' });
      })
    );
    const res = await candidateService.deleteVideo('c1');
    expect(path).toBe('/api/candidates/c1/video');
    expect(res.message).toBe('Vidéo supprimée');
  });

  it('getVideoUrl propage une erreur 404', async () => {
    server.use(
      http.get(`${API}/api/candidates/c1/video`, () => new HttpResponse(null, { status: 404 }))
    );
    await expect(candidateService.getVideoUrl('c1')).rejects.toMatchObject({
      response: { status: 404 },
    });
  });
});

describe('candidateService — vidéos typées (table candidate_videos)', () => {
  it('getVideosList → GET /api/candidates/:id/videos', async () => {
    server.use(
      http.get(`${API}/api/candidates/c1/videos`, () =>
        HttpResponse.json({
          success: true,
          data: [{ id: 'v1', type: 'presentation', videoUploadedAt: null, hasVideo: false }],
        })
      )
    );
    const res = await candidateService.getVideosList('c1');
    expect(res.data[0].type).toBe('presentation');
  });

  it('getVideoUrlByType → GET .../videos/:type/url (type en minuscule)', async () => {
    let path: string | null = null;
    server.use(
      http.get(`${API}/api/candidates/c1/videos/presentation/url`, ({ request }) => {
        path = new URL(request.url).pathname;
        return HttpResponse.json({ success: true, data: { videoUrl: 'https://s/v', expiresIn: 3600 } });
      })
    );
    // On passe le type en MAJUSCULE pour vérifier la normalisation toLowerCase().
    const res = await candidateService.getVideoUrlByType('c1', 'PRESENTATION');
    expect(path).toBe('/api/candidates/c1/videos/presentation/url');
    expect(res.data.videoUrl).toBe('https://s/v');
  });

  it('initiateVideoUploadByType → POST .../videos/:type/initiate-upload', async () => {
    let body: any = null;
    let path: string | null = null;
    server.use(
      http.post(`${API}/api/candidates/c1/videos/entrevue/initiate-upload`, async ({ request }) => {
        path = new URL(request.url).pathname;
        body = await request.json();
        return HttpResponse.json({
          success: true,
          data: { signedUrl: 'https://s/u', key: 'k1', provider: 'r2', expiresIn: 3600 },
        });
      })
    );
    const res = await candidateService.initiateVideoUploadByType('c1', 'Entrevue', 'c.mp4', 'video/mp4');
    expect(path).toBe('/api/candidates/c1/videos/entrevue/initiate-upload');
    expect(body).toEqual({ filename: 'c.mp4', contentType: 'video/mp4' });
    expect(res.data.key).toBe('k1');
  });

  it('completeVideoUploadByType → POST .../videos/:type/complete-upload', async () => {
    let body: any = null;
    server.use(
      http.post(`${API}/api/candidates/c1/videos/presentation/complete-upload`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ success: true, message: 'OK', data: {} });
      })
    );
    const res = await candidateService.completeVideoUploadByType('c1', 'presentation', 'k1');
    expect(body).toEqual({ key: 'k1' });
    expect(res.success).toBe(true);
  });

  it('deleteVideoByType → DELETE .../videos/:type', async () => {
    let path: string | null = null;
    server.use(
      http.delete(`${API}/api/candidates/c1/videos/entrevue`, ({ request }) => {
        path = new URL(request.url).pathname;
        return HttpResponse.json({ success: true, message: 'Supprimée' });
      })
    );
    const res = await candidateService.deleteVideoByType('c1', 'Entrevue');
    expect(path).toBe('/api/candidates/c1/videos/entrevue');
    expect(res.message).toBe('Supprimée');
  });
});

describe('candidateService.getCandidatesStats', () => {
  it('GET /api/candidates/stats/summary', async () => {
    server.use(
      http.get(`${API}/api/candidates/stats/summary`, () =>
        HttpResponse.json({
          success: true,
          data: {
            total: 5,
            byStatus: { ACTIVE: 5 },
            elite: 1,
            excellent: 1,
            veryGood: 1,
            good: 1,
            qualified: 1,
            toReview: 0,
            pending: 0,
            absent: 0,
            inactive: 0,
          },
        })
      )
    );
    const res = await candidateService.getCandidatesStats();
    expect(res.data.total).toBe(5);
    expect(res.data.byStatus.ACTIVE).toBe(5);
  });

  it('propage une erreur 500', async () => {
    server.use(
      http.get(`${API}/api/candidates/stats/summary`, () => new HttpResponse(null, { status: 500 }))
    );
    await expect(candidateService.getCandidatesStats()).rejects.toMatchObject({
      response: { status: 500 },
    });
  });
});

describe('candidateService.extractSkills', () => {
  it('POST /api/extraction/candidates/:id/extract avec le modèle par défaut', async () => {
    let body: any = null;
    let path: string | null = null;
    server.use(
      http.post(`${API}/api/extraction/candidates/c1/extract`, async ({ request }) => {
        path = new URL(request.url).pathname;
        body = await request.json();
        return HttpResponse.json({ success: true });
      })
    );
    await candidateService.extractSkills('c1');
    expect(path).toBe('/api/extraction/candidates/c1/extract');
    expect(body).toEqual({ model: 'gpt-3.5-turbo' });
  });

  it('transmet le modèle fourni', async () => {
    let body: any = null;
    server.use(
      http.post(`${API}/api/extraction/candidates/c1/extract`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ success: true });
      })
    );
    await candidateService.extractSkills('c1', 'gpt-4');
    expect(body).toEqual({ model: 'gpt-4' });
  });
});

describe('candidateService.advancedSearch', () => {
  it('POST /api/candidates/advanced-search avec le body', async () => {
    let body: any = null;
    server.use(
      http.post(`${API}/api/candidates/advanced-search`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({
          data: [{ id: 'c1' }],
          pagination: { total: 1, page: 1, limit: 20, totalPages: 1 },
        });
      })
    );
    const res = await candidateService.advancedSearch({ cities: ['Montréal'], minRating: 4 });
    expect(body).toEqual({ cities: ['Montréal'], minRating: 4 });
    expect(res.data).toEqual([{ id: 'c1' }]);
  });

  it('propage une erreur 400', async () => {
    server.use(
      http.post(`${API}/api/candidates/advanced-search`, () => new HttpResponse(null, { status: 400 }))
    );
    await expect(candidateService.advancedSearch({})).rejects.toMatchObject({
      response: { status: 400 },
    });
  });
});

describe('candidateService.parseNaturalLanguageQuery', () => {
  it('POST /api/candidates/ai-search avec { query }', async () => {
    let body: any = null;
    server.use(
      http.post(`${API}/api/candidates/ai-search`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ success: true, data: { cities: ['Laval'] } });
      })
    );
    const res = await candidateService.parseNaturalLanguageQuery('agents à Laval');
    expect(body).toEqual({ query: 'agents à Laval' });
    expect(res.data.cities).toEqual(['Laval']);
  });
});

describe('candidateService.getSimilarCandidates', () => {
  it('GET /api/candidates/:id/similar avec ?limit=', async () => {
    let url: URL | null = null;
    server.use(
      http.get(`${API}/api/candidates/c1/similar`, ({ request }) => {
        url = new URL(request.url);
        return HttpResponse.json({ success: true, data: [{ id: 'c2' }] });
      })
    );
    const res = await candidateService.getSimilarCandidates('c1', 5);
    expect(url!.pathname).toBe('/api/candidates/c1/similar');
    expect(url!.searchParams.get('limit')).toBe('5');
    expect(res.data).toEqual([{ id: 'c2' }]);
  });

  it('utilise limit=3 par défaut', async () => {
    let url: URL | null = null;
    server.use(
      http.get(`${API}/api/candidates/c1/similar`, ({ request }) => {
        url = new URL(request.url);
        return HttpResponse.json({ success: true, data: [] });
      })
    );
    await candidateService.getSimilarCandidates('c1');
    expect(url!.searchParams.get('limit')).toBe('3');
  });

  it('propage une erreur 500', async () => {
    server.use(
      http.get(`${API}/api/candidates/c1/similar`, () => new HttpResponse(null, { status: 500 }))
    );
    await expect(candidateService.getSimilarCandidates('c1')).rejects.toMatchObject({
      response: { status: 500 },
    });
  });
});
