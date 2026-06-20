import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderWithProviders, screen, within, waitFor, userEvent } from '@/test/renderWithProviders';

vi.mock('@/services/user.service', () => ({
  userService: {
    listUsers: vi.fn(),
    createUser: vi.fn(),
    updateUser: vi.fn(),
    resetPassword: vi.fn(),
  },
}));

import UsersAdminPage from './UsersAdminPage';
import { userService } from '@/services/user.service';
import { useAuthStore } from '@/store/authStore';
import { makeUser } from '@/test/factories';
import { resetStores } from '@/test/resetStores';

const svc = userService as unknown as Record<string, ReturnType<typeof vi.fn>>;

beforeEach(() => {
  vi.clearAllMocks();
  // La page lit `me` depuis le store auth pour marquer « (moi) » et désactiver
  // certains contrôles sur sa propre ligne.
  useAuthStore.getState().setAuth(
    makeUser({ id: 'me-1', firstName: 'Admin', lastName: 'Courant', role: 'ADMIN' }),
    'access',
    'refresh'
  );
});

afterEach(() => resetStores());

describe('UsersAdminPage', () => {
  it("affiche l'en-tête et le bouton de création", async () => {
    svc.listUsers.mockResolvedValue({ data: [] });
    renderWithProviders(<UsersAdminPage />);

    expect(screen.getByRole('heading', { name: /gestion des utilisateurs/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /créer un utilisateur/i })).toBeInTheDocument();
    await waitFor(() => expect(svc.listUsers).toHaveBeenCalled());
  });

  it('charge puis rend les utilisateurs mockés dans le tableau', async () => {
    svc.listUsers.mockResolvedValue({
      data: [
        makeUser({ id: 'u-a', firstName: 'Marie', lastName: 'Gagnon', email: 'marie@ex.com', role: 'RH_RECRUITER', isActive: true }),
        makeUser({ id: 'u-b', firstName: 'Luc', lastName: 'Roy', email: 'luc@ex.com', role: 'SALES', isActive: false }),
      ],
    });
    renderWithProviders(<UsersAdminPage />);

    expect(await screen.findByText('Marie Gagnon')).toBeInTheDocument();
    expect(screen.getByText('marie@ex.com')).toBeInTheDocument();
    expect(screen.getByText('Luc Roy')).toBeInTheDocument();
    // Le rôle est affiché via son libellé FR, pas son code brut.
    expect(screen.getByText('RH / Recruteur')).toBeInTheDocument();
    expect(screen.getByText('Ventes')).toBeInTheDocument();
  });

  it('affiche un état vide quand aucun utilisateur', async () => {
    svc.listUsers.mockResolvedValue({ data: [] });
    renderWithProviders(<UsersAdminPage />);

    expect(await screen.findByText(/aucun utilisateur/i)).toBeInTheDocument();
  });

  it("ouvre le dialogue de création au clic sur « Créer un utilisateur »", async () => {
    svc.listUsers.mockResolvedValue({ data: [] });
    const user = userEvent.setup();
    renderWithProviders(<UsersAdminPage />);

    await user.click(screen.getByRole('button', { name: /créer un utilisateur/i }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('heading', { name: /créer un utilisateur/i })).toBeInTheDocument();
    expect(within(dialog).getByLabelText(/prénom/i)).toBeInTheDocument();
    expect(within(dialog).getByLabelText('Email')).toBeInTheDocument();
    // Le bouton « Créer » du dialogue reste désactivé tant que le formulaire est vide.
    expect(within(dialog).getByRole('button', { name: /^créer$/i })).toBeDisabled();
  });

  it('filtre via la recherche → relance listUsers avec le terme saisi', async () => {
    svc.listUsers.mockResolvedValue({ data: [] });
    const user = userEvent.setup();
    renderWithProviders(<UsersAdminPage />);

    await waitFor(() => expect(svc.listUsers).toHaveBeenCalledWith(undefined));

    await user.type(screen.getByPlaceholderText(/chercher/i), 'marie');

    await waitFor(() => expect(svc.listUsers).toHaveBeenCalledWith('marie'));
  });
});
