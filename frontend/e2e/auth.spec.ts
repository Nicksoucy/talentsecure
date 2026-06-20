import { test, expect } from '@playwright/test';
import { LoginPage } from './pages/LoginPage';

/**
 * Parcours d'authentification de bout en bout (vrai navigateur).
 * L'API est mockée via page.route → le test ne dépend pas du backend.
 */
test.describe('Connexion (E2E)', () => {
  test.beforeEach(async ({ page }) => {
    // Catch-all : toute requête API renvoie un défaut neutre, pour que le SPA
    // (et le tableau de bord après connexion) ne plante pas sur des appels réseau.
    await page.route('**/api/**', async (route) => {
      if (route.request().url().includes('/api/auth/login')) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            message: 'Connexion réussie',
            accessToken: 'e2e-access',
            refreshToken: 'e2e-refresh',
            user: { id: 'u1', email: 'test@example.com', firstName: 'Test', lastName: 'User', role: 'ADMIN' },
          }),
        });
      }
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: [], total: 0 }),
      });
    });
  });

  test('connexion réussie → quitte la page /login', async ({ page }) => {
    const login = new LoginPage(page);
    await login.goto();
    await login.login('test@example.com', 'password123');
    await expect(page).not.toHaveURL(/\/login$/);
  });

  test('identifiants invalides → reste sur /login avec message d\'erreur', async ({ page }) => {
    // Route spécifique (prioritaire) : login en échec.
    await page.route('**/api/auth/login', (route) =>
      route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Identifiants invalides' }),
      })
    );
    const login = new LoginPage(page);
    await login.goto();
    await login.login('test@example.com', 'mauvais');
    await expect(page.getByText('Identifiants invalides').first()).toBeVisible();
    await expect(page).toHaveURL(/\/login$/);
  });
});
