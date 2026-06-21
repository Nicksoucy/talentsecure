import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Routes, Route } from 'react-router-dom';
import { renderWithProviders, screen, waitFor, userEvent } from '@/test/renderWithProviders';
import { clientService, type Client } from '@/services/client.service';
import ClientDetailPage from './ClientDetailPage';

// La page lit l'id d'URL puis charge le client via TanStack Query → on mocke
// le seul service appelé pour piloter chargement / données / erreur sans réseau.
vi.mock('@/services/client.service', () => ({
  clientService: {
    getClientById: vi.fn(),
  },
}));

// Les onglets Contacts/Interactions sont des sous-composants lourds (leurs
// propres requêtes, tableaux, dialogs) hors-sujet ici : on les neutralise pour
// isoler le comportement de la page détail et éviter tout hang/réseau.
vi.mock('./tabs/ClientContactsTab', () => ({ default: () => <div>Onglet contacts</div> }));
vi.mock('./tabs/ClientInteractionsTab', () => ({ default: () => <div>Onglet interactions</div> }));

const getClientById = vi.mocked(clientService.getClientById);

function makeClient(overrides: Partial<Client> = {}): Client {
  return {
    id: 'client-1',
    name: 'Jean Dupont',
    companyName: 'Acme Sécurité',
    email: 'contact@acme.ca',
    phone: '514-555-0123',
    address: '123 rue Principale',
    city: 'Montréal',
    province: 'QC',
    postalCode: 'H2X 1Y2',
    isActive: true,
    notes: 'Client prioritaire',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

// La page lit useParams → on la monte derrière une route paramétrée pour que
// l'id soit réellement résolu depuis l'URL.
function renderAt(id: string) {
  return renderWithProviders(
    <Routes>
      <Route path="/clients/:id" element={<ClientDetailPage />} />
      <Route path="/clients" element={<div>Liste des clients</div>} />
    </Routes>,
    { route: `/clients/${id}` }
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('ClientDetailPage', () => {
  it('affiche un indicateur de chargement avant la réponse', () => {
    // Promesse jamais résolue → la page reste en chargement.
    getClientById.mockReturnValue(new Promise(() => {}));
    renderAt('client-1');

    expect(screen.getByRole('progressbar')).toBeInTheDocument();
  });

  it("rend l'en-tête et les détails du client une fois chargé", async () => {
    getClientById.mockResolvedValue({ data: makeClient() });
    renderAt('client-1');

    // L'en-tête affiche la raison sociale et le statut actif.
    expect(await screen.findByRole('heading', { name: /acme sécurité/i })).toBeInTheDocument();
    expect(screen.getByText('Actif')).toBeInTheDocument();

    // L'onglet « Informations » est actif par défaut → détails visibles.
    expect(screen.getByText('contact@acme.ca')).toBeInTheDocument();
    expect(screen.getByText('514-555-0123')).toBeInTheDocument();
    expect(screen.getByText('Client prioritaire')).toBeInTheDocument();

    // L'id résolu depuis l'URL est bien passé au service.
    expect(getClientById).toHaveBeenCalledWith('client-1');
  });

  it('affiche le statut « Inactif » pour un client désactivé', async () => {
    getClientById.mockResolvedValue({ data: makeClient({ isActive: false }) });
    renderAt('client-1');

    expect(await screen.findByText('Inactif')).toBeInTheDocument();
  });

  it("affiche une alerte d'erreur quand le chargement échoue", async () => {
    getClientById.mockRejectedValue(new Error('boom'));
    renderAt('client-1');

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/client introuvable ou erreur de chargement/i);
    expect(screen.getByRole('button', { name: /retour/i })).toBeInTheDocument();
  });

  it("bascule sur l'onglet Contacts au clic", async () => {
    getClientById.mockResolvedValue({ data: makeClient() });
    const user = userEvent.setup();
    renderAt('client-1');

    await screen.findByRole('heading', { name: /acme sécurité/i });

    await user.click(screen.getByRole('tab', { name: /contacts/i }));

    expect(await screen.findByText('Onglet contacts')).toBeInTheDocument();
  });

  it('utilise le nom legacy comme titre quand companyName est absent', async () => {
    getClientById.mockResolvedValue({
      data: makeClient({ companyName: undefined }),
    });
    renderAt('client-1');

    expect(await screen.findByRole('heading', { name: /jean dupont/i })).toBeInTheDocument();
  });

  it('navigue vers la liste depuis le bouton retour de l\'alerte d\'erreur', async () => {
    getClientById.mockRejectedValue(new Error('boom'));
    const user = userEvent.setup();
    renderAt('client-1');

    await user.click(await screen.findByRole('button', { name: /retour/i }));

    await waitFor(() => {
      expect(screen.getByText('Liste des clients')).toBeInTheDocument();
    });
  });
});
