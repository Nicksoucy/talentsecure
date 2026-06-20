import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Routes, Route } from 'react-router-dom';
import { renderWithProviders, screen, within, userEvent, waitFor } from '@/test/renderWithProviders';
import type { ProspectCandidate } from '@/types';

// --- Service réseau de la page entièrement mocké (MSW onUnhandledRequest:'error' → zéro appel réel). ---
vi.mock('@/services/prospect.service', () => ({
  prospectService: {
    getProspects: vi.fn(),
    getProspectsStats: vi.fn(),
    markAsContacted: vi.fn(),
    deleteProspect: vi.fn(),
    createProspect: vi.fn(),
    syncSurvey: vi.fn(),
    bulkAssignToClient: vi.fn(),
    exportZipWithCvs: vi.fn(),
  },
}));

// --- Enfants lourds neutralisés : on teste la PAGE, pas ces composants. ---
// Dialogs (montés en permanence) + bandeau inter-tables (fait son propre fetch).
vi.mock('./ProspectsDialogs', () => ({
  default: () => <div data-testid="prospects-dialogs-mock" />,
}));
vi.mock('@/components/CrossTableHint', () => ({
  default: () => <div data-testid="cross-table-hint-mock" />,
}));

import ProspectsPage from './ProspectsPage';
import { prospectService } from '@/services/prospect.service';

const svc = prospectService as unknown as {
  getProspects: ReturnType<typeof vi.fn>;
  getProspectsStats: ReturnType<typeof vi.fn>;
  markAsContacted: ReturnType<typeof vi.fn>;
};

const makeProspect = (overrides: Partial<ProspectCandidate> = {}): ProspectCandidate =>
  ({
    id: 'prospect-1',
    firstName: 'Marie',
    lastName: 'Gagnon',
    email: 'marie.gagnon@example.com',
    phone: '514-555-0142',
    city: 'Montréal',
    submissionDate: '2026-06-01T00:00:00.000Z',
    isContacted: false,
    isConverted: false,
    isDeleted: false,
    createdAt: '2026-06-01T00:00:00.000Z',
    updatedAt: '2026-06-01T00:00:00.000Z',
    ...overrides,
  }) as ProspectCandidate;

const makeProspectsResponse = (data: ProspectCandidate[], total = data.length) => ({
  data,
  pagination: { total, page: 1, limit: 20, totalPages: Math.max(1, Math.ceil(total / 20)) },
});

const STATS = {
  success: true,
  data: { total: 42, contacted: 10, pending: 32, converted: 5, conversionRate: '12' },
};

function renderProspects(route = '/prospects') {
  return renderWithProviders(
    <Routes>
      <Route path="/prospects" element={<ProspectsPage />} />
      <Route path="/prospects/:id" element={<div>détail prospect</div>} />
    </Routes>,
    { route },
  );
}

describe('ProspectsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    svc.getProspectsStats.mockResolvedValue(STATS);
    svc.getProspects.mockResolvedValue(makeProspectsResponse([makeProspect()]));
  });

  it('affiche l\'en-tête et les cartes de statistiques une fois chargées', async () => {
    renderProspects();

    expect(screen.getByRole('heading', { name: 'Candidats Potentiels', level: 1 })).toBeInTheDocument();

    // Stats récupérées via TanStack Query → attendre le rendu post-chargement.
    // (« À contacter » apparaît aussi sur la puce d'une ligne → on cible les chiffres.)
    expect(await screen.findByText('42')).toBeInTheDocument(); // total
    expect(screen.getByText('32')).toBeInTheDocument(); // pending
    expect(screen.getByText('Contactés')).toBeInTheDocument();
  });

  it('passe du squelette aux données des prospects mockés', async () => {
    renderProspects();

    // La ligne de données n'apparaît qu'après résolution de la query.
    const nameCell = await screen.findByText('Marie Gagnon');
    expect(nameCell).toBeInTheDocument();
    expect(screen.getByText('marie.gagnon@example.com')).toBeInTheDocument();
    expect(screen.getByText('514-555-0142')).toBeInTheDocument();
    expect(svc.getProspects).toHaveBeenCalled();
  });

  it('affiche l\'état vide quand aucun prospect n\'est retourné', async () => {
    svc.getProspects.mockResolvedValue(makeProspectsResponse([], 0));
    renderProspects();

    expect(await screen.findByText('Aucun prospect trouvé')).toBeInTheDocument();
  });

  it('affiche une alerte d\'erreur si le chargement échoue', async () => {
    svc.getProspects.mockRejectedValue(new Error('boom réseau'));
    renderProspects();

    expect(await screen.findByText(/Erreur lors du chargement des prospects/i)).toBeInTheDocument();
    expect(screen.getByText(/boom réseau/)).toBeInTheDocument();
  });

  it('pré-remplit la recherche depuis le paramètre d\'URL ?q=', async () => {
    renderProspects('/prospects?q=Marie');

    const searchInput = await screen.findByPlaceholderText(/Rechercher par nom, email/i);
    expect(searchInput).toHaveValue('Marie');
  });

  it('sélectionner une ligne ouvre la barre d\'actions groupées', async () => {
    const user = userEvent.setup();
    renderProspects();

    // Attendre la ligne de données avant d'interagir.
    await screen.findByText('Marie Gagnon');

    // La 2e case (index 0 = "tout sélectionner" dans l'en-tête) coche la ligne.
    const checkboxes = screen.getAllByRole('checkbox');
    await user.click(checkboxes[1]);

    const toolbar = await screen.findByText(/1 prospect sélectionné/i);
    expect(toolbar).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Marquer comme contactés/i })).toBeInTheDocument();
    // within() pour confirmer que la barre groupée contient bien l'export CSV.
    const paper = toolbar.closest('.MuiPaper-root') as HTMLElement;
    expect(within(paper).getByRole('button', { name: /Exporter CSV/i })).toBeInTheDocument();
  });

  it('navigue vers le détail au clic sur l\'action « Voir détails »', async () => {
    const user = userEvent.setup();
    renderProspects();

    await screen.findByText('Marie Gagnon');
    await user.click(screen.getByRole('button', { name: 'Voir détails' }));

    await waitFor(() => expect(screen.getByText('détail prospect')).toBeInTheDocument());
  });
});
