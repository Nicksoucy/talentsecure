import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderWithProviders, screen, within, waitFor, userEvent } from '@/test/renderWithProviders';
import ClientsPage from './ClientsPage';
import { clientService, type Client } from '@/services/client.service';

// La page charge les clients via TanStack Query → on mocke le service appelé.
vi.mock('@/services/client.service', () => ({
  clientService: {
    getClients: vi.fn(),
    createClient: vi.fn(),
    updateClient: vi.fn(),
    deleteClient: vi.fn(),
    reactivateClient: vi.fn(),
  },
}));

const getClients = vi.mocked(clientService.getClients);

function makeClient(overrides: Partial<Client> = {}): Client {
  return {
    id: 'cl1',
    name: 'Jean Tremblay',
    companyName: 'Acme Inc.',
    email: 'jean@acme.example',
    phone: '514-555-0000',
    city: 'Montréal',
    province: 'QC',
    isActive: true,
    createdAt: '2026-06-19T00:00:00.000Z',
    updatedAt: '2026-06-19T00:00:00.000Z',
    _count: { catalogues: 2, placements: 0 },
    ...overrides,
  };
}

function makeResponse(clients: Client[]) {
  return {
    data: clients,
    pagination: {
      total: clients.length,
      page: 1,
      limit: 20,
      totalPages: clients.length === 0 ? 0 : 1,
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('ClientsPage', () => {
  it('affiche le squelette de chargement avant la réponse du service', () => {
    // Promesse jamais résolue → la page reste en chargement.
    getClients.mockReturnValue(new Promise(() => {}));
    const { container } = renderWithProviders(<ClientsPage />);

    // Le TableSkeleton remplace l'en-tête et le tableau pendant le chargement.
    expect(container.querySelectorAll('.MuiSkeleton-root').length).toBeGreaterThan(0);
    // Aucun en-tête réel ne doit fuiter pendant le chargement.
    expect(screen.queryByRole('heading', { name: /clients \(/i })).not.toBeInTheDocument();
  });

  it("rend l'en-tête avec le total et la liste des clients une fois chargés", async () => {
    getClients.mockResolvedValue(
      makeResponse([
        makeClient(),
        makeClient({
          id: 'cl2',
          name: 'Marie Gagnon',
          companyName: 'Globex',
          email: 'marie@globex.example',
          city: 'Laval',
        }),
      ])
    );

    renderWithProviders(<ClientsPage />);

    // En-tête avec le total provenant de la pagination.
    expect(await screen.findByRole('heading', { name: /clients \(2\)/i })).toBeInTheDocument();

    // Lignes du tableau.
    expect(screen.getByText('Jean Tremblay')).toBeInTheDocument();
    expect(screen.getByText('jean@acme.example')).toBeInTheDocument();
    expect(screen.getByText('Marie Gagnon')).toBeInTheDocument();
    expect(screen.getByText('marie@globex.example')).toBeInTheDocument();
  });

  it("affiche l'état vide quand aucun client n'est retourné", async () => {
    getClients.mockResolvedValue(makeResponse([]));

    renderWithProviders(<ClientsPage />);

    expect(await screen.findByText(/aucun client trouvé/i)).toBeInTheDocument();
    expect(
      screen.getByText(/commencez par ajouter votre premier client/i)
    ).toBeInTheDocument();
  });

  it("affiche une alerte d'erreur lorsque le service échoue", async () => {
    getClients.mockRejectedValue(new Error('boom'));

    renderWithProviders(<ClientsPage />);

    const alert = await screen.findByRole('alert');
    expect(within(alert).getByText(/erreur lors du chargement des clients/i)).toBeInTheDocument();
  });

  it('ouvre le dialogue de création au clic sur « Ajouter un client »', async () => {
    getClients.mockResolvedValue(makeResponse([makeClient()]));
    const user = userEvent.setup();

    renderWithProviders(<ClientsPage />);

    await screen.findByText('Jean Tremblay');
    // Bouton d'en-tête (le premier ; l'état vide en a un second, absent ici).
    await user.click(screen.getByRole('button', { name: /ajouter un client/i }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/ajouter un nouveau client/i)).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: /créer/i })).toBeInTheDocument();
  });

  it('relance la requête avec le filtre de statut quand on choisit « Inactifs »', async () => {
    getClients.mockResolvedValue(makeResponse([makeClient()]));
    const user = userEvent.setup();

    renderWithProviders(<ClientsPage />);

    await screen.findByText('Jean Tremblay');
    // Au montage, le filtre par défaut demande les clients actifs.
    expect(getClients).toHaveBeenCalledWith(expect.objectContaining({ isActive: true }));

    // Ouvre le Select MUI « Statut » (un seul combobox sur la page) puis « Inactifs ».
    await user.click(screen.getByRole('combobox'));
    await user.click(await screen.findByRole('option', { name: /inactifs/i }));

    await waitFor(() =>
      expect(getClients).toHaveBeenCalledWith(expect.objectContaining({ isActive: false }))
    );
  });
});
