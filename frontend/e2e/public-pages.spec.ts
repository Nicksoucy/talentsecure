import { test, expect } from '@playwright/test';

/**
 * Les candidats reçoivent des liens publics. Ils ne doivent JAMAIS atterrir
 * sur la page de connexion de TalentSecure — ni sur le lien général /video,
 * ni sur un lien mal copié.
 */
test.describe('Pages publiques — jamais la page de connexion (E2E)', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/api/**', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
    );
  });

  test('/video : le formulaire du candidat, pas la connexion', async ({ page }) => {
    await page.goto('/video');
    await expect(page.getByText('Montrez-nous qui vous êtes en 30 secondes')).toBeVisible();
    await expect(page).toHaveURL(/\/video$/);
  });

  test('adresse inconnue : message neutre, pas la connexion', async ({ page }) => {
    await page.goto('/vide');
    await expect(page.getByText("Cette page n'existe pas")).toBeVisible();
    await expect(page).not.toHaveURL(/\/login/);
    await expect(page.getByRole('button', { name: /connecter/i })).toHaveCount(0);
  });

  test("l'accueil du personnel (/) mène toujours à la connexion", async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/login$/);
  });
});
