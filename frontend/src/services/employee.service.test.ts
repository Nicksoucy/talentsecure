import { describe, it, expect, beforeEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '@/test/server';
import { employeeService } from './employee.service';

const API = 'http://localhost:5000';

beforeEach(() => {
  localStorage.clear();
});

describe('employeeService — getEmployees', () => {
  it('GET /api/employees, transmet les query params et renvoie la réponse paginée', async () => {
    let receivedUrl: URL | null = null;
    server.use(
      http.get(`${API}/api/employees`, ({ request }) => {
        receivedUrl = new URL(request.url);
        return HttpResponse.json({
          data: [{ id: 'e1', firstName: 'Jean' }],
          pagination: { total: 1, page: 2, limit: 10, totalPages: 1 },
        });
      })
    );

    const res = await employeeService.getEmployees({
      search: 'jean',
      status: 'ACTIF',
      city: 'Montréal',
      page: 2,
      limit: 10,
      sortBy: 'lastName',
      sortOrder: 'asc',
    });

    // (a) params bien transmis dans l'URL
    const params = receivedUrl!.searchParams;
    expect(params.get('search')).toBe('jean');
    expect(params.get('status')).toBe('ACTIF');
    expect(params.get('city')).toBe('Montréal');
    expect(params.get('page')).toBe('2');
    expect(params.get('limit')).toBe('10');
    expect(params.get('sortBy')).toBe('lastName');
    expect(params.get('sortOrder')).toBe('asc');

    // (b) donnée renvoyée correcte
    expect(res.data).toHaveLength(1);
    expect(res.data[0]).toMatchObject({ id: 'e1', firstName: 'Jean' });
    expect(res.pagination).toMatchObject({ total: 1, page: 2, totalPages: 1 });
  });

  it('appelle GET /api/employees sans query string quand aucun param', async () => {
    let receivedUrl: URL | null = null;
    server.use(
      http.get(`${API}/api/employees`, ({ request }) => {
        receivedUrl = new URL(request.url);
        return HttpResponse.json({
          data: [],
          pagination: { total: 0, page: 1, limit: 20, totalPages: 0 },
        });
      })
    );

    const res = await employeeService.getEmployees();
    expect(receivedUrl!.search).toBe('');
    expect(res.data).toEqual([]);
  });

  it('(c) propage une erreur 500', async () => {
    server.use(
      http.get(`${API}/api/employees`, () =>
        HttpResponse.json({ message: 'Erreur serveur' }, { status: 500 })
      )
    );

    await expect(employeeService.getEmployees()).rejects.toMatchObject({
      response: { status: 500 },
    });
  });
});

describe('employeeService — getEmployeeById', () => {
  it('GET /api/employees/:id et renvoie l\'employé', async () => {
    let receivedUrl: URL | null = null;
    server.use(
      http.get(`${API}/api/employees/e42`, ({ request }) => {
        receivedUrl = new URL(request.url);
        return HttpResponse.json({ data: { id: 'e42', firstName: 'Marie' } });
      })
    );

    const res = await employeeService.getEmployeeById('e42');
    expect(receivedUrl!.pathname).toBe('/api/employees/e42');
    expect(res.data).toMatchObject({ id: 'e42', firstName: 'Marie' });
  });

  it('(c) propage un 404 pour un id inconnu', async () => {
    server.use(
      http.get(`${API}/api/employees/nope`, () =>
        HttpResponse.json({ message: 'Introuvable' }, { status: 404 })
      )
    );

    await expect(employeeService.getEmployeeById('nope')).rejects.toMatchObject({
      response: { status: 404 },
    });
  });
});

describe('employeeService — getEmployeesStats', () => {
  it('GET /api/employees/stats/summary et renvoie les compteurs', async () => {
    server.use(
      http.get(`${API}/api/employees/stats/summary`, () =>
        HttpResponse.json({ data: { total: 12, actifs: 9, inactifs: 3 } })
      )
    );

    const res = await employeeService.getEmployeesStats();
    expect(res.data).toEqual({ total: 12, actifs: 9, inactifs: 3 });
  });
});

describe('employeeService — createEmployee', () => {
  it('POST /api/employees avec le body, ajoute le token et renvoie l\'employé créé', async () => {
    localStorage.setItem('accessToken', 't');
    let receivedBody: unknown = null;
    let authHeader: string | null = null;
    server.use(
      http.post(`${API}/api/employees`, async ({ request }) => {
        receivedBody = await request.json();
        authHeader = request.headers.get('authorization');
        return HttpResponse.json(
          { data: { id: 'new1', firstName: 'Léa' }, message: 'Créé' },
          { status: 201 }
        );
      })
    );

    const res = await employeeService.createEmployee({ firstName: 'Léa' });
    expect(receivedBody).toEqual({ firstName: 'Léa' });
    expect(authHeader).toBe('Bearer t');
    expect(res.data).toMatchObject({ id: 'new1', firstName: 'Léa' });
    expect(res.message).toBe('Créé');
  });

  it('(c) propage un 400 de validation', async () => {
    server.use(
      http.post(`${API}/api/employees`, () =>
        HttpResponse.json({ message: 'Champs invalides' }, { status: 400 })
      )
    );

    await expect(employeeService.createEmployee({})).rejects.toMatchObject({
      response: { status: 400 },
    });
  });
});

describe('employeeService — updateEmployee', () => {
  it('PUT /api/employees/:id avec le body et renvoie l\'employé mis à jour', async () => {
    let receivedBody: unknown = null;
    let receivedUrl: URL | null = null;
    server.use(
      http.put(`${API}/api/employees/e7`, async ({ request }) => {
        receivedUrl = new URL(request.url);
        receivedBody = await request.json();
        return HttpResponse.json({
          data: { id: 'e7', status: 'INACTIF' },
          message: 'Mis à jour',
        });
      })
    );

    const res = await employeeService.updateEmployee('e7', { status: 'INACTIF' });
    expect(receivedUrl!.pathname).toBe('/api/employees/e7');
    expect(receivedBody).toEqual({ status: 'INACTIF' });
    expect(res.data).toMatchObject({ id: 'e7', status: 'INACTIF' });
    expect(res.message).toBe('Mis à jour');
  });
});

describe('employeeService — deleteEmployee', () => {
  it('DELETE /api/employees/:id et renvoie le message', async () => {
    let receivedUrl: URL | null = null;
    server.use(
      http.delete(`${API}/api/employees/e9`, ({ request }) => {
        receivedUrl = new URL(request.url);
        return HttpResponse.json({ message: 'Supprimé' });
      })
    );

    const res = await employeeService.deleteEmployee('e9');
    expect(receivedUrl!.pathname).toBe('/api/employees/e9');
    expect(res.message).toBe('Supprimé');
  });

  it('(c) propage un 403 non autorisé', async () => {
    server.use(
      http.delete(`${API}/api/employees/e9`, () =>
        HttpResponse.json({ message: 'Non autorisé' }, { status: 403 })
      )
    );

    await expect(employeeService.deleteEmployee('e9')).rejects.toMatchObject({
      response: { status: 403 },
    });
  });
});

describe('employeeService — promoteCandidate', () => {
  it('POST /api/employees/promote/:candidateId avec le body de promotion', async () => {
    let receivedBody: unknown = null;
    let receivedUrl: URL | null = null;
    server.use(
      http.post(`${API}/api/employees/promote/c1`, async ({ request }) => {
        receivedUrl = new URL(request.url);
        receivedBody = await request.json();
        return HttpResponse.json({
          data: { id: 'emp-from-c1' },
          message: 'Promu',
        });
      })
    );

    const res = await employeeService.promoteCandidate('c1', {
      hireDate: '2026-06-20',
      position: 'Agent',
      assignment: 'Site A',
      employeeNumber: 'EMP-001',
    });
    expect(receivedUrl!.pathname).toBe('/api/employees/promote/c1');
    expect(receivedBody).toEqual({
      hireDate: '2026-06-20',
      position: 'Agent',
      assignment: 'Site A',
      employeeNumber: 'EMP-001',
    });
    expect(res.data).toMatchObject({ id: 'emp-from-c1' });
    expect(res.message).toBe('Promu');
  });
});

describe('employeeService — promoteProspect', () => {
  it('POST /api/employees/promote-prospect/:prospectId avec body par défaut vide', async () => {
    let receivedBody: unknown = null;
    let receivedUrl: URL | null = null;
    server.use(
      http.post(`${API}/api/employees/promote-prospect/p1`, async ({ request }) => {
        receivedUrl = new URL(request.url);
        receivedBody = await request.json();
        return HttpResponse.json({
          data: { id: 'emp-from-p1' },
          message: 'Prospect promu',
        });
      })
    );

    const res = await employeeService.promoteProspect('p1');
    expect(receivedUrl!.pathname).toBe('/api/employees/promote-prospect/p1');
    expect(receivedBody).toEqual({});
    expect(res.data).toMatchObject({ id: 'emp-from-p1' });
    expect(res.message).toBe('Prospect promu');
  });

  it('(c) propage un 409 (conflit, déjà promu)', async () => {
    server.use(
      http.post(`${API}/api/employees/promote-prospect/p1`, () =>
        HttpResponse.json({ message: 'Déjà promu' }, { status: 409 })
      )
    );

    await expect(
      employeeService.promoteProspect('p1', { position: 'Agent' })
    ).rejects.toMatchObject({ response: { status: 409 } });
  });
});
