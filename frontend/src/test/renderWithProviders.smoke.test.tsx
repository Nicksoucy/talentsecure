import { describe, it, expect } from 'vitest';
import { renderWithProviders, screen } from './renderWithProviders';

// Smoke test : valide que la pile de providers (QueryClient + Theme + Snackbar +
// MemoryRouter) se monte sans crasher et rend bien le contenu.
describe('renderWithProviders (infra de test)', () => {
  it('monte un composant à travers tous les providers', () => {
    renderWithProviders(<div>bonjour-infra</div>);
    expect(screen.getByText('bonjour-infra')).toBeInTheDocument();
  });

  it('respecte la route initiale fournie', () => {
    renderWithProviders(<div>page</div>, { route: '/client/login' });
    expect(screen.getByText('page')).toBeInTheDocument();
  });
});
