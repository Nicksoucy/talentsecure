import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Routes, Route } from 'react-router-dom';
import { renderWithProviders, screen, userEvent, waitFor } from '@/test/renderWithProviders';
import ClientRegisterPage from './ClientRegisterPage';
import { clientService } from '@/services/client.service';

// On mocke le service : la page appelle clientService.register au submit. On évite
// ainsi tout réseau réel (MSW onUnhandledRequest:'error') et on pilote succès/échec.
vi.mock('@/services/client.service', () => ({
  clientService: {
    register: vi.fn(),
  },
}));

const mockedRegister = vi.mocked(clientService.register);

function renderRegister() {
  return renderWithProviders(
    <Routes>
      <Route path="/client/register" element={<ClientRegisterPage />} />
      <Route path="/client/login" element={<div>page de connexion</div>} />
    </Routes>,
    { route: '/client/register' }
  );
}

// Remplit les champs obligatoires avec des valeurs valides et cohérentes.
async function fillValidForm(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByRole('textbox', { name: /nom complet/i }), 'Jean Tremblay');
  await user.type(screen.getByRole('textbox', { name: /email/i }), 'jean@exemple.com');
  await user.type(screen.getByLabelText(/^Mot de passe \*$/), 'secret123');
  await user.type(screen.getByLabelText(/^Confirmer le mot de passe \*$/), 'secret123');
}

describe('ClientRegisterPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("affiche l'en-tête et le formulaire d'inscription", () => {
    renderRegister();

    expect(screen.getByRole('heading', { name: /créer un compte/i })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /nom complet/i })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /email/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /s'inscrire/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /se connecter/i })).toBeInTheDocument();
  });

  it('affiche les erreurs de validation si le formulaire est vide', async () => {
    const user = userEvent.setup();
    renderRegister();

    await user.click(screen.getByRole('button', { name: /s'inscrire/i }));

    expect(
      await screen.findByText(/le nom doit contenir au moins 2 caractères/i)
    ).toBeInTheDocument();
    expect(screen.getByText(/email invalide/i)).toBeInTheDocument();
    expect(mockedRegister).not.toHaveBeenCalled();
  });

  it('refuse si les mots de passe ne correspondent pas', async () => {
    const user = userEvent.setup();
    renderRegister();

    await user.type(screen.getByRole('textbox', { name: /nom complet/i }), 'Jean Tremblay');
    await user.type(screen.getByRole('textbox', { name: /email/i }), 'jean@exemple.com');
    await user.type(screen.getByLabelText(/^Mot de passe \*$/), 'secret123');
    await user.type(screen.getByLabelText(/^Confirmer le mot de passe \*$/), 'different456');
    await user.click(screen.getByRole('button', { name: /s'inscrire/i }));

    expect(
      await screen.findByText(/les mots de passe ne correspondent pas/i)
    ).toBeInTheDocument();
    expect(mockedRegister).not.toHaveBeenCalled();
  });

  it('inscription réussie → appelle le service et navigue vers /client/login', async () => {
    mockedRegister.mockResolvedValue({
      data: {
        id: 'c-1',
        name: 'Jean Tremblay',
        email: 'jean@exemple.com',
        isActive: true,
        createdAt: '2026-06-20T00:00:00.000Z',
        updatedAt: '2026-06-20T00:00:00.000Z',
      },
      message: 'Compte créé',
    });

    const user = userEvent.setup();
    renderRegister();

    await fillValidForm(user);
    await user.click(screen.getByRole('button', { name: /s'inscrire/i }));

    await waitFor(() => expect(screen.getByText('page de connexion')).toBeInTheDocument());
    expect(mockedRegister).toHaveBeenCalledTimes(1);
    expect(mockedRegister).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Jean Tremblay',
        email: 'jean@exemple.com',
        password: 'secret123',
      })
    );
  });

  it("échec serveur → affiche le message d'erreur et ne navigue pas", async () => {
    mockedRegister.mockRejectedValue({
      response: { data: { error: 'Cet email est déjà utilisé' } },
    });

    const user = userEvent.setup();
    renderRegister();

    await fillValidForm(user);
    await user.click(screen.getByRole('button', { name: /s'inscrire/i }));

    // Le message apparaît dans l'Alert ET la snackbar → au moins une occurrence.
    const messages = await screen.findAllByText('Cet email est déjà utilisé');
    expect(messages.length).toBeGreaterThan(0);
    expect(screen.queryByText('page de connexion')).not.toBeInTheDocument();
  });
});
