import { http, HttpResponse } from 'msw';

/**
 * Handlers MSW par défaut (chemin heureux). Les tests surchargent au besoin via
 * `server.use(...)`. Tout endpoint non déclaré déclenche une erreur
 * (onUnhandledRequest: 'error' dans setup.ts) → on attrape les appels oubliés.
 *
 * Le `*` en tête matche n'importe quelle origine (l'axios de l'app cible
 * VITE_API_URL || http://localhost:5000).
 */
export const handlers = [
  http.post('*/api/auth/login', () =>
    HttpResponse.json({
      message: 'Connexion réussie',
      accessToken: 'test-access-token',
      refreshToken: 'test-refresh-token',
      user: {
        id: 'u1',
        email: 'test@example.com',
        firstName: 'Test',
        lastName: 'User',
        role: 'ADMIN',
      },
    })
  ),

  http.post('*/api/auth/refresh', () =>
    HttpResponse.json({ accessToken: 'test-access-token-2', refreshToken: 'test-refresh-token-2' })
  ),

  http.get('*/api/candidates', () =>
    HttpResponse.json({ data: [], total: 0, page: 1, limit: 20 })
  ),

  http.get('*/api/candidates/stats/summary', () =>
    HttpResponse.json({ data: { total: 0 } })
  ),
];
