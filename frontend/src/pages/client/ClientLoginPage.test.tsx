import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Routes, Route } from 'react-router-dom';
import { renderWithProviders, screen, userEvent, waitFor } from '@/test/renderWithProviders';
import ClientLoginPage from './ClientLoginPage';
import { clientAuthService } from '@/services/client-auth.service';
import { useClientAuthStore } from '@/store/clientAuthStore';
import { resetStores } from '@/test/resetStores';

// La page appelle clientAuthService.login (instance axios dédiée, hors MSW) →
// on mocke directement le service.
vi.mock('@/services/client-auth.service', () => ({
  clientAuthService: {
    login: vi.fn(),
  },
}));

const login = vi.mocked(clientAuthService.login);

function renderClientLogin() {
  return renderWithProviders(
    <Routes>
      <Route path="/client/login" element={<ClientLoginPage />} />
      <Route path="/client/dashboard" element={<div>tableau de bord client</div>} />
      <Route path="/client/register" element={<div>page inscription</div>} />
    </Routes>,
    { route: '/client/login' }
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => resetStores());

describe('ClientLoginPage', () => {
  it('affiche l\'en-tête du portail client et le formulaire', () => {
    renderClientLogin();

    expect(screen.getByRole('heading', { name: /portail client/i })).toBeInTheDocument();
    expect(screen.getByText(/connectez-vous pour accéder à vos catalogues/i)).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toBeInTheDocument();
    expect(screen.getByLabelText('Mot de passe')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /se connecter/i })).toBeInTheDocument();
  });

  it('affiche les erreurs de validation si le formulaire est vide', async () => {
    const user = userEvent.setup();
    renderClientLogin();

    await user.click(screen.getByRole('button', { name: /se connecter/i }));

    expect(await screen.findByText(/email invalide/i)).toBeInTheDocument();
    expect(login).not.toHaveBeenCalled();
  });

  it('connexion réussie → authentifie le client et navigue vers le tableau de bord', async () => {
    login.mockResolvedValue({
      client: { id: 'cl1', name: 'Acme RH', companyName: 'Acme', email: 'rh@acme.com' },
      accessToken: 'access-123',
      refreshToken: 'refresh-456',
    });

    const user = userEvent.setup();
    renderClientLogin();

    await user.type(screen.getByLabelText('Email'), 'rh@acme.com');
    await user.type(screen.getByLabelText('Mot de passe'), 'motdepasse');
    await user.click(screen.getByRole('button', { name: /se connecter/i }));

    await waitFor(() =>
      expect(screen.getByText('tableau de bord client')).toBeInTheDocument()
    );
    expect(login).toHaveBeenCalledWith({ email: 'rh@acme.com', password: 'motdepasse' });

    const state = useClientAuthStore.getState();
    expect(state.isAuthenticated).toBe(true);
    expect(state.accessToken).toBe('access-123');
    expect(state.client?.email).toBe('rh@acme.com');
  });

  it('échec → affiche le message d\'erreur de l\'API et ne navigue pas', async () => {
    login.mockRejectedValue({ response: { data: { error: 'Identifiants invalides' } } });

    const user = userEvent.setup();
    renderClientLogin();

    await user.type(screen.getByLabelText('Email'), 'rh@acme.com');
    await user.type(screen.getByLabelText('Mot de passe'), 'mauvais');
    await user.click(screen.getByRole('button', { name: /se connecter/i }));

    // Le message s'affiche dans l'Alert ET la snackbar → au moins une occurrence.
    const messages = await screen.findAllByText('Identifiants invalides');
    expect(messages.length).toBeGreaterThan(0);
    expect(screen.queryByText('tableau de bord client')).not.toBeInTheDocument();
    expect(useClientAuthStore.getState().isAuthenticated).toBe(false);
  });

  it('propose un lien vers la page d\'inscription', () => {
    renderClientLogin();

    const lien = screen.getByRole('link', { name: /s'inscrire/i });
    expect(lien).toHaveAttribute('href', '/client/register');
  });
});
