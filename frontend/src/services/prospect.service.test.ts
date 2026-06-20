import { describe, it, expect, beforeEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '@/test/server';
import { prospectService } from './prospect.service';

const API = 'http://localhost:5000';

beforeEach(() => {
  localStorage.clear();
  // La plupart des endpoints prospects sont protégés → on simule une session.
  localStorage.setItem('accessToken', 't');
});

describe('prospectService.getProspects', () => {
  it('GET /api/prospects et renvoie data + pagination', async () => {
    const payload = {
      data: [{ id: 'p1', firstName: 'Alice' }],
      pagination: { total: 1, page: 1, limit: 20, totalPages: 1 },
    };
    let calledPath: string | null = null;
    server.use(
      http.get(`${API}/api/prospects`, ({ request }) => {
        calledPath = new URL(request.url).pathname;
        return HttpResponse.json(payload);
      })
    );

    const res = await prospectService.getProspects();
    expect(calledPath).toBe('/api/prospects');
    expect(res).toEqual(payload);
    expect(res.data[0].id).toBe('p1');
  });

  it('transmet les filtres simples en query params', async () => {
    let url: URL | null = null;
    server.use(
      http.get(`${API}/api/prospects`, ({ request }) => {
        url = new URL(request.url);
        return HttpResponse.json({ data: [], pagination: { total: 0, page: 2, limit: 10, totalPages: 0 } });
      })
    );

    await prospectService.getProspects({
      search: 'soudeur',
      isContacted: true,
      page: 2,
      limit: 10,
    });

    expect(url!.searchParams.get('search')).toBe('soudeur');
    expect(url!.searchParams.get('isContacted')).toBe('true');
    expect(url!.searchParams.get('page')).toBe('2');
    expect(url!.searchParams.get('limit')).toBe('10');
  });

  it('aplatit `cities` (tableau) en CSV et `near` en nearLat/nearLng/nearRadiusKm', async () => {
    let url: URL | null = null;
    server.use(
      http.get(`${API}/api/prospects`, ({ request }) => {
        url = new URL(request.url);
        return HttpResponse.json({ data: [], pagination: { total: 0, page: 1, limit: 20, totalPages: 0 } });
      })
    );

    await prospectService.getProspects({
      cities: ['Montréal', 'Laval'],
      near: { lat: 45.5, lng: -73.6, radiusKm: 25 },
    });

    expect(url!.searchParams.get('cities')).toBe('Montréal,Laval');
    expect(url!.searchParams.get('nearLat')).toBe('45.5');
    expect(url!.searchParams.get('nearLng')).toBe('-73.6');
    expect(url!.searchParams.get('nearRadiusKm')).toBe('25');
    // `cities` et `near` bruts ne doivent pas fuiter tels quels
    expect(url!.searchParams.get('near')).toBeNull();
  });

  it('propage une erreur 500', async () => {
    server.use(
      http.get(`${API}/api/prospects`, () => new HttpResponse(null, { status: 500 }))
    );

    await expect(prospectService.getProspects()).rejects.toMatchObject({
      response: { status: 500 },
    });
  });
});

describe('prospectService.getProspectById', () => {
  it('GET /api/prospects/:id et renvoie le prospect', async () => {
    server.use(
      http.get(`${API}/api/prospects/abc`, () =>
        HttpResponse.json({ data: { id: 'abc', firstName: 'Bob' } })
      )
    );

    const res = await prospectService.getProspectById('abc');
    expect(res.data.id).toBe('abc');
  });

  it('propage une 404', async () => {
    server.use(
      http.get(`${API}/api/prospects/missing`, () => new HttpResponse(null, { status: 404 }))
    );

    await expect(prospectService.getProspectById('missing')).rejects.toMatchObject({
      response: { status: 404 },
    });
  });
});

describe('prospectService.createProspect', () => {
  it('POST /api/prospects avec le body transmis', async () => {
    let body: any = null;
    server.use(
      http.post(`${API}/api/prospects`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ data: { id: 'new1', firstName: 'Carl' }, message: 'créé' });
      })
    );

    const res = await prospectService.createProspect({ firstName: 'Carl', city: 'Québec' });
    expect(body).toEqual({ firstName: 'Carl', city: 'Québec' });
    expect(res.data.id).toBe('new1');
    expect(res.message).toBe('créé');
  });
});

describe('prospectService.updateProspect', () => {
  it('PUT /api/prospects/:id avec le body transmis', async () => {
    let body: any = null;
    server.use(
      http.put(`${API}/api/prospects/u1`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ data: { id: 'u1', city: 'Gatineau' }, message: 'maj' });
      })
    );

    const res = await prospectService.updateProspect('u1', { city: 'Gatineau' });
    expect(body).toEqual({ city: 'Gatineau' });
    expect(res.data.city).toBe('Gatineau');
    expect(res.message).toBe('maj');
  });
});

describe('prospectService.deleteProspect', () => {
  it('DELETE /api/prospects/:id et renvoie le message', async () => {
    server.use(
      http.delete(`${API}/api/prospects/d1`, () => HttpResponse.json({ message: 'supprimé' }))
    );

    const res = await prospectService.deleteProspect('d1');
    expect(res.message).toBe('supprimé');
  });
});

describe('prospectService.markAsContacted', () => {
  it('POST /api/prospects/:id/contact avec les notes', async () => {
    let body: any = null;
    server.use(
      http.post(`${API}/api/prospects/c1/contact`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ data: { id: 'c1', isContacted: true }, message: 'ok' });
      })
    );

    const res = await prospectService.markAsContacted('c1', 'appelé le 20 juin');
    expect(body).toEqual({ notes: 'appelé le 20 juin' });
    expect(res.data.isContacted).toBe(true);
  });
});

describe('prospectService.convertToCandidate', () => {
  it('POST /api/prospects/:id/convert avec les données candidat', async () => {
    let body: any = null;
    server.use(
      http.post(`${API}/api/prospects/cv1/convert`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ data: { id: 'cand1' }, message: 'converti' });
      })
    );

    const res = await prospectService.convertToCandidate('cv1', { score: 8 });
    expect(body).toEqual({ score: 8 });
    expect(res.data.id).toBe('cand1');
    expect(res.message).toBe('converti');
  });
});

describe('prospectService.getCitiesSuggestions', () => {
  it('GET /api/prospects/suggestions/cities avec q quand une query est fournie', async () => {
    let url: URL | null = null;
    server.use(
      http.get(`${API}/api/prospects/suggestions/cities`, ({ request }) => {
        url = new URL(request.url);
        return HttpResponse.json({ success: true, data: ['Montréal', 'Mont-Tremblant'] });
      })
    );

    const res = await prospectService.getCitiesSuggestions('Mont');
    expect(url!.searchParams.get('q')).toBe('Mont');
    expect(res.data).toEqual(['Montréal', 'Mont-Tremblant']);
  });

  it('GET /api/prospects/suggestions/cities sans q quand aucune query', async () => {
    let url: URL | null = null;
    server.use(
      http.get(`${API}/api/prospects/suggestions/cities`, ({ request }) => {
        url = new URL(request.url);
        return HttpResponse.json({ success: true, data: [] });
      })
    );

    await prospectService.getCitiesSuggestions();
    expect(url!.searchParams.has('q')).toBe(false);
  });
});

describe('prospectService.getProspectsSuggestions', () => {
  it('GET /api/prospects/suggestions/names avec q', async () => {
    let url: URL | null = null;
    server.use(
      http.get(`${API}/api/prospects/suggestions/names`, ({ request }) => {
        url = new URL(request.url);
        return HttpResponse.json({
          success: true,
          data: [{ id: 'n1', label: 'Alice T.', email: 'a@b.c' }],
        });
      })
    );

    const res = await prospectService.getProspectsSuggestions('Ali');
    expect(url!.searchParams.get('q')).toBe('Ali');
    expect(res.data[0].label).toBe('Alice T.');
  });
});

describe('prospectService.getCvUrl', () => {
  it('GET /api/prospects/:id/cv-url et renvoie l’URL signée', async () => {
    server.use(
      http.get(`${API}/api/prospects/p9/cv-url`, () =>
        HttpResponse.json({ success: true, data: { url: 'https://r2/cv.pdf', expiresIn: 3600 } })
      )
    );

    const res = await prospectService.getCvUrl('p9');
    expect(res.data.url).toBe('https://r2/cv.pdf');
    expect(res.data.expiresIn).toBe(3600);
  });
});

describe('prospectService.getVideoUrl', () => {
  it('GET /api/prospects/:id/video-url et renvoie videoUrl', async () => {
    server.use(
      http.get(`${API}/api/prospects/p9/video-url`, () =>
        HttpResponse.json({ success: true, data: { videoUrl: 'https://r2/video.mp4' } })
      )
    );

    const res = await prospectService.getVideoUrl('p9');
    expect(res.data.videoUrl).toBe('https://r2/video.mp4');
  });
});

describe('prospectService.syncSurvey', () => {
  it('POST /api/prospects/sync-survey et renvoie le résumé', async () => {
    server.use(
      http.post(`${API}/api/prospects/sync-survey`, () =>
        HttpResponse.json({
          message: 'sync ok',
          data: { scanned: 10, created: 2, updated: 1, linkedExisting: 0, skippedNoContact: 0, errors: 0 },
        })
      )
    );

    const res = await prospectService.syncSurvey();
    expect(res.data.scanned).toBe(10);
    expect(res.data.created).toBe(2);
  });
});

describe('prospectService.refreshVideoFromGhl', () => {
  it('POST /api/prospects/:id/refresh-video-from-ghl', async () => {
    server.use(
      http.post(`${API}/api/prospects/rv1/refresh-video-from-ghl`, () =>
        HttpResponse.json({ success: true, videoStoragePath: 'prospects/rv1/video.mp4' })
      )
    );

    const res = await prospectService.refreshVideoFromGhl('rv1');
    expect(res.success).toBe(true);
    expect(res.videoStoragePath).toBe('prospects/rv1/video.mp4');
  });
});

describe('prospectService.bulkAssignToClient', () => {
  it('POST /api/prospects/bulk-assign-to-client avec prospectIds + clientId', async () => {
    let body: any = null;
    server.use(
      http.post(`${API}/api/prospects/bulk-assign-to-client`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({
          message: 'assignés',
          assigned: 2,
          alreadyAssigned: 0,
          errors: 0,
          clientName: 'ACME',
        });
      })
    );

    const res = await prospectService.bulkAssignToClient(['a', 'b'], 'client-1');
    expect(body).toEqual({ prospectIds: ['a', 'b'], clientId: 'client-1' });
    expect(res.assigned).toBe(2);
    expect(res.clientName).toBe('ACME');
  });
});

describe('prospectService.exportZipWithCvs', () => {
  it('POST /api/prospects/export-zip et renvoie un Blob', async () => {
    let body: any = null;
    server.use(
      http.post(`${API}/api/prospects/export-zip`, async ({ request }) => {
        body = await request.json();
        return new HttpResponse(new Blob(['zip-bytes'], { type: 'application/zip' }), {
          headers: { 'Content-Type': 'application/zip' },
        });
      })
    );

    const res = await prospectService.exportZipWithCvs(['a', 'b']);
    expect(body).toEqual({ prospectIds: ['a', 'b'] });
    expect(res).toBeInstanceOf(Blob);
  });
});

describe('prospectService.getProspectsStats', () => {
  it('GET /api/prospects/stats/summary', async () => {
    server.use(
      http.get(`${API}/api/prospects/stats/summary`, () =>
        HttpResponse.json({
          success: true,
          data: { total: 100, contacted: 40, pending: 60, converted: 10, conversionRate: '10%' },
        })
      )
    );

    const res = await prospectService.getProspectsStats();
    expect(res.data.total).toBe(100);
    expect(res.data.conversionRate).toBe('10%');
  });
});

describe('prospectService.getProspectsByCity', () => {
  it('GET /api/prospects/stats/by-city', async () => {
    server.use(
      http.get(`${API}/api/prospects/stats/by-city`, () =>
        HttpResponse.json({ success: true, data: [{ city: 'Montréal', count: 12 }] })
      )
    );

    const res = await prospectService.getProspectsByCity();
    expect(res.data[0]).toEqual({ city: 'Montréal', count: 12 });
  });
});

describe('prospectService.getProspectsExtractionStats', () => {
  it('GET /api/prospects/stats/extraction', async () => {
    server.use(
      http.get(`${API}/api/prospects/stats/extraction`, () =>
        HttpResponse.json({ total: 50, withSkills: 30, withoutSkills: 20 })
      )
    );

    const res = await prospectService.getProspectsExtractionStats();
    expect(res.total).toBe(50);
    expect(res.withSkills).toBe(30);
  });
});

describe('prospectService.getProspectExtractionHistory', () => {
  it('GET /api/prospects/:id/extraction-history', async () => {
    server.use(
      http.get(`${API}/api/prospects/eh1/extraction-history`, () =>
        HttpResponse.json({
          prospect: { id: 'eh1', name: 'Alice' },
          currentSkillsCount: 5,
          logs: [
            {
              id: 'log1',
              date: '2026-06-20',
              method: 'llm',
              model: 'opus',
              skillsFound: 5,
              processingTimeMs: 1200,
              promptTokens: 100,
              completionTokens: 50,
              totalCost: 0.01,
              success: true,
              errorMessage: null,
            },
          ],
        })
      )
    );

    const res = await prospectService.getProspectExtractionHistory('eh1');
    expect(res.prospect.id).toBe('eh1');
    expect(res.currentSkillsCount).toBe(5);
    expect(res.logs[0].skillsFound).toBe(5);
  });
});
