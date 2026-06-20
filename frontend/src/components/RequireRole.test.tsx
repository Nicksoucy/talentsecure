import { describe, it, expect, afterEach } from 'vitest';
import { Routes, Route } from 'react-router-dom';
import { renderWithProviders, screen } from '@/test/renderWithProviders';
import RequireRole from './RequireRole';
import { useAuthStore } from '@/store/authStore';
import { resetStores } from '@/test/resetStores';
import { makeUser } from '@/test/factories';

function renderGuarded(route = '/secret') {
  return renderWithProviders(
    <Routes>
      <Route path="/" element={<div>accueil</div>} />
      <Route
        path="/secret"
        element={
          <RequireRole roles={['ADMIN', 'RH_RECRUITER'] as never}>
            <div>secret</div>
          </RequireRole>
        }
      />
    </Routes>,
    { route }
  );
}

afterEach(() => resetStores());

describe('RequireRole', () => {
  it('rend les enfants pour un rôle autorisé', () => {
    useAuthStore.setState({ user: makeUser({ role: 'ADMIN' as never }), isAuthenticated: true });
    renderGuarded();
    expect(screen.getByText('secret')).toBeInTheDocument();
  });

  it('redirige vers / pour un rôle non autorisé', () => {
    useAuthStore.setState({ user: makeUser({ role: 'SALES' as never }), isAuthenticated: true });
    renderGuarded();
    expect(screen.getByText('accueil')).toBeInTheDocument();
    expect(screen.queryByText('secret')).not.toBeInTheDocument();
  });

  it('redirige vers / si non connecté', () => {
    useAuthStore.setState({ user: null, isAuthenticated: false });
    renderGuarded();
    expect(screen.getByText('accueil')).toBeInTheDocument();
    expect(screen.queryByText('secret')).not.toBeInTheDocument();
  });
});
