import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Routes, Route } from 'react-router-dom';
import { renderWithProviders, screen, within, userEvent, waitFor } from '@/test/renderWithProviders';
import { useClientAuthStore } from '@/store/clientAuthStore';
import { resetStores } from '@/test/resetStores';
import type { Catalogue } from '@/services/client-auth.service';
import { clientAuthService } from '@/services/client-auth.service';
import ClientDashboardPage from './ClientDashboardPage';

// Service réseau mocké : la page récupère les catalogues via clientAuthService,
// pas via TanStack Query. Zéro appel HTTP réel (MSW onUnhandledRequest:'error').
vi.mock('@/services/client-auth.service', () => ({
  clientAuthService: { getCatalogues: vi.fn() },
}));

// Enfants lourds (carte des prospects, panier, notifications, dialogs/modals)
// remplacés par des stubs neutres pour isoler le comportement de la page.
vi.mock('@/components/client/UnifiedProspectsMap', () => ({ default: () => null }));
vi.mock('@/components/client/Cart/CartBadge', () => ({ default: () => null }));
vi.mock('@/components/client/Cart/CartDrawer', () => ({ default: () => null }));
vi.mock('@/components/client/Cart/CitySelectDialog', () => ({ default: () => null }));
vi.mock('@/components/client/ClientHelpDialog', () => ({ default: () => null }));
vi.mock('@/components/client/NotificationCenter', () => ({ default: () => null }));
vi.mock('@/components/client/CityTalentsModal', () => ({ default: () => null }));

const getCatalogues = vi.mocked(clientAuthService.getCatalogues);

function makeCatalogue(overrides: Partial<Catalogue> = {}): Catalogue {
  return {
    id: 'cat-1',
    title: 'Catalogue Soudeurs Montréal',
    status: 'SENT',
    requiresPayment: false,
    isPaid: false,
    isContentRestricted: false,
    createdAt: '2026-06-01T00:00:00.000Z',
    items: [],
    ...overrides,
  };
}

function loginClient() {
  useClientAuthStore.getState().setAuth(
    { id: 'client-1', name: 'Marie Dubois', companyName: 'ACME Construction', email: 'marie@acme.test' },
    'token-abc',
    'refresh-abc'
  );
}

describe('ClientDashboardPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetStores();
    loginClient();
  });

  it('affiche l\'en-tête du portail avec le nom de l\'entreprise du client', async () => {
    getCatalogues.mockResolvedValue([]);
    renderWithProviders(<ClientDashboardPage />, { route: '/client/dashboard' });

    expect(screen.getByText(/Portail Client - ACME Construction/i)).toBeInTheDocument();
    expect(screen.getByText(/Bienvenue, Marie Dubois/i)).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Parcourir/i })).toBeInTheDocument();
  });

  it('charge les catalogues au montage et les affiche dans l\'onglet Mes Demandes', async () => {
    getCatalogues.mockResolvedValue([
      makeCatalogue({ id: 'cat-1', title: 'Catalogue Soudeurs Montréal' }),
      makeCatalogue({ id: 'cat-2', title: 'Catalogue Électriciens Laval' }),
    ]);
    const user = userEvent.setup();
    renderWithProviders(<ClientDashboardPage />, { route: '/client/dashboard' });

    await waitFor(() => expect(getCatalogues).toHaveBeenCalledWith('token-abc'));

    await user.click(screen.getByRole('tab', { name: /Mes Demandes/i }));

    expect(await screen.findByText('Catalogue Soudeurs Montréal')).toBeInTheDocument();
    expect(screen.getByText('Catalogue Électriciens Laval')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /Voir le catalogue/i })).toHaveLength(2);
  });

  it('affiche un état vide quand aucun catalogue n\'est disponible', async () => {
    getCatalogues.mockResolvedValue([]);
    const user = userEvent.setup();
    renderWithProviders(<ClientDashboardPage />, { route: '/client/dashboard' });

    await waitFor(() => expect(getCatalogues).toHaveBeenCalled());

    await user.click(screen.getByRole('tab', { name: /Mes Demandes/i }));

    expect(await screen.findByText(/Aucun catalogue disponible pour le moment/i)).toBeInTheDocument();
  });

  it('affiche un message d\'erreur quand le chargement des catalogues échoue', async () => {
    getCatalogues.mockRejectedValue({
      response: { data: { message: 'Accès refusé au portail' } },
    });
    const user = userEvent.setup();
    renderWithProviders(<ClientDashboardPage />, { route: '/client/dashboard' });

    await waitFor(() => expect(getCatalogues).toHaveBeenCalled());

    await user.click(screen.getByRole('tab', { name: /Mes Demandes/i }));

    // Le message s'affiche dans l'Alert ET la snackbar → au moins une occurrence.
    const messages = await screen.findAllByText('Accès refusé au portail');
    expect(messages.length).toBeGreaterThan(0);
  });

  it('navigue vers le détail quand on clique sur « Voir le catalogue »', async () => {
    getCatalogues.mockResolvedValue([makeCatalogue({ id: 'cat-42', title: 'Catalogue Manœuvres' })]);
    const user = userEvent.setup();
    renderWithProviders(
      <Routes>
        <Route path="/client/dashboard" element={<ClientDashboardPage />} />
        <Route path="/client/catalogue/:id" element={<div>page détail catalogue</div>} />
      </Routes>,
      { route: '/client/dashboard' }
    );

    await waitFor(() => expect(getCatalogues).toHaveBeenCalled());
    await user.click(screen.getByRole('tab', { name: /Mes Demandes/i }));

    const card = (await screen.findByText('Catalogue Manœuvres')).closest('.MuiCard-root') as HTMLElement;
    await user.click(within(card).getByRole('button', { name: /Voir le catalogue/i }));

    expect(await screen.findByText('page détail catalogue')).toBeInTheDocument();
  });

  it('ne tente pas de charger les catalogues sans jeton d\'accès', async () => {
    resetStores(); // déconnecté : pas de token
    renderWithProviders(<ClientDashboardPage />, { route: '/client/dashboard' });

    await waitFor(() => expect(screen.getByRole('tab', { name: /Parcourir/i })).toBeInTheDocument());
    expect(getCatalogues).not.toHaveBeenCalled();
  });
});
