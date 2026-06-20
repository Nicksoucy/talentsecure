import { describe, it, expect, afterEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { Routes, Route } from 'react-router-dom';
import { renderWithProviders, screen, userEvent, waitFor } from '@/test/renderWithProviders';
import LoginPage from './LoginPage';
import { server } from '@/test/server';
import { useAuthStore } from '@/store/authStore';
import { resetStores } from '@/test/resetStores';

const API = 'http://localhost:5000';

function renderLogin() {
  return renderWithProviders(
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/dashboard" element={<div>tableau de bord</div>} />
    </Routes>,
    { route: '/login' }
  );
}

afterEach(() => resetStores());

describe('LoginPage', () => {
  it('affiche les erreurs de validation si le formulaire est vide', async () => {
    const user = userEvent.setup();
    renderLogin();
    await user.click(screen.getByRole('button', { name: /se connecter/i }));
    expect(await screen.findByText(/email invalide/i)).toBeInTheDocument();
  });

  it('connexion réussie → authentifie et navigue vers /dashboard', async () => {
    const user = userEvent.setup();
    renderLogin();
    await user.type(screen.getByLabelText('Email'), 'test@example.com');
    await user.type(screen.getByLabelText('Mot de passe'), 'password123');
    await user.click(screen.getByRole('button', { name: /se connecter/i }));

    await waitFor(() => expect(screen.getByText('tableau de bord')).toBeInTheDocument());
    expect(useAuthStore.getState().isAuthenticated).toBe(true);
  });

  it('échec → affiche le message d\'erreur et ne navigue pas', async () => {
    server.use(
      http.post(`${API}/api/auth/login`, () =>
        HttpResponse.json({ error: 'Identifiants invalides' }, { status: 401 })
      )
    );
    const user = userEvent.setup();
    renderLogin();
    await user.type(screen.getByLabelText('Email'), 'test@example.com');
    await user.type(screen.getByLabelText('Mot de passe'), 'mauvais');
    await user.click(screen.getByRole('button', { name: /se connecter/i }));

    // Le message s'affiche dans l'Alert ET la snackbar → au moins une occurrence.
    const messages = await screen.findAllByText('Identifiants invalides');
    expect(messages.length).toBeGreaterThan(0);
    expect(screen.queryByText('tableau de bord')).not.toBeInTheDocument();
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
  });
});
