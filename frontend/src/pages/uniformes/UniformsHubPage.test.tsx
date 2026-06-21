import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderWithProviders, screen, userEvent } from '@/test/renderWithProviders';
import { useAuthStore } from '@/store/authStore';
import { resetStores } from '@/test/resetStores';
import { makeUser } from '@/test/factories';
import type { UserRole } from '@/types';
import UniformsHubPage from './UniformsHubPage';

// Le hub dérive ses onglets de `usePerms`, qui lit le rôle depuis le store auth.
// On seed donc le store avec un rôle donné plutôt que de mocker le hook : ça
// teste le vrai branchement perms → onglets visibles.
function seedRole(role: UserRole): void {
  useAuthStore.getState().setAuth(makeUser({ role }), 'tok', 'refresh');
}

describe('UniformsHubPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => resetStores());

  it('affiche les onglets du module pour un rôle en écriture (ADMIN)', () => {
    seedRole('ADMIN');
    renderWithProviders(<UniformsHubPage />, { route: '/uniformes' });

    // Onglets de lecture, toujours visibles.
    expect(screen.getByRole('tab', { name: 'Catalogue' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Inventaire' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Planifiées' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Lots de lavage' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Rapports' })).toBeInTheDocument();

    // Onglets d'écriture, présents pour un rôle qui peut écrire.
    expect(screen.getByRole('tab', { name: 'Remise' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Retour' })).toBeInTheDocument();
  });

  it("masque les onglets d'écriture pour un rôle en lecture seule (MAGASIN)", () => {
    seedRole('MAGASIN');
    renderWithProviders(<UniformsHubPage />, { route: '/uniformes' });

    // Les onglets d'écriture (write: true) disparaissent.
    expect(screen.queryByRole('tab', { name: 'Remise' })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Retour' })).not.toBeInTheDocument();

    // Les onglets de lecture restent, dont « Planifiées » (ouvert à toute l'équipe).
    expect(screen.getByRole('tab', { name: 'Catalogue' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Inventaire' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Planifiées' })).toBeInTheDocument();
  });

  it("sélectionne l'onglet correspondant à l'URL courante", () => {
    seedRole('ADMIN');
    renderWithProviders(<UniformsHubPage />, { route: '/uniformes/inventaire' });

    // Sur /uniformes/inventaire, c'est « Inventaire » qui est actif.
    expect(screen.getByRole('tab', { name: 'Inventaire' })).toHaveAttribute(
      'aria-selected',
      'true'
    );
    expect(screen.getByRole('tab', { name: 'Catalogue' })).toHaveAttribute(
      'aria-selected',
      'false'
    );
  });

  it("retombe sur le premier onglet quand l'URL ne correspond à aucun onglet", () => {
    seedRole('ADMIN');
    renderWithProviders(<UniformsHubPage />, { route: '/uniformes/inconnu' });

    // Aucun match → active = 0 → « Catalogue » sélectionné par défaut.
    expect(screen.getByRole('tab', { name: 'Catalogue' })).toHaveAttribute(
      'aria-selected',
      'true'
    );
  });

  it("met à jour l'onglet actif quand on clique sur un autre onglet", async () => {
    seedRole('ADMIN');
    const user = userEvent.setup();
    renderWithProviders(<UniformsHubPage />, { route: '/uniformes' });

    // Au départ « Catalogue » est actif.
    expect(screen.getByRole('tab', { name: 'Catalogue' })).toHaveAttribute(
      'aria-selected',
      'true'
    );

    // Le clic déclenche navigate() : l'URL change, le hub recalcule l'onglet actif.
    await user.click(screen.getByRole('tab', { name: 'Rapports' }));

    expect(screen.getByRole('tab', { name: 'Rapports' })).toHaveAttribute(
      'aria-selected',
      'true'
    );
    expect(screen.getByRole('tab', { name: 'Catalogue' })).toHaveAttribute(
      'aria-selected',
      'false'
    );
  });
});
