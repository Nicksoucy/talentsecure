import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderWithProviders, screen, within, waitFor, userEvent } from '@/test/renderWithProviders';
import { useAuthStore } from '@/store/authStore';
import { resetStores } from '@/test/resetStores';
import { makeUser, makeCandidate } from '@/test/factories';
import type { Candidate } from '@/types';

// Enfants lourds chargés en lazy() : la carte Leaflet (tuiles, DOM) et le gros
// formulaire d'entrevue n'ont aucun intérêt pour cette page-liste → neutralisés
// pour isoler l'en-tête, le tableau et les états.
vi.mock('@/components/map/CandidatesMap', () => ({ default: () => null }));
vi.mock('@/components/InterviewEvaluationForm', () => ({ default: () => null }));

// La page lit ses données via TanStack Query sur ces services : on les mocke
// pour piloter chargement / données / vide / erreur sans toucher au réseau.
vi.mock('@/services/candidate.service', () => ({
  candidateService: {
    getCandidates: vi.fn(),
    advancedSearch: vi.fn(),
    getCitiesSuggestions: vi.fn(),
    getCandidatesSuggestions: vi.fn(),
    exportCandidatesCSV: vi.fn(),
  },
}));
vi.mock('@/services/client.service', () => ({
  clientService: { getClients: vi.fn() },
}));

import { candidateService } from '@/services/candidate.service';
import { clientService } from '@/services/client.service';
import CandidatesListPage from './CandidatesListPage';

const getCandidates = vi.mocked(candidateService.getCandidates);
const getClients = vi.mocked(clientService.getClients);

function makeResponse(candidates: Candidate[], total = candidates.length) {
  return {
    data: candidates,
    pagination: { total, page: 1, limit: 20, totalPages: Math.max(1, Math.ceil(total / 20)) },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  // Le bandeau d'actions groupées et l'échappatoire « inclure les supprimés »
  // dépendent du rôle ADMIN lu dans le store auth.
  useAuthStore.getState().setAuth(makeUser({ role: 'ADMIN' }), 'tok', 'refresh');
  // Valeurs par défaut « chargées » ; chaque test surcharge au besoin.
  getCandidates.mockResolvedValue(
    makeResponse([makeCandidate({ firstName: 'Jean', lastName: 'Tremblay' })], 1)
  );
  getClients.mockResolvedValue({ data: [], pagination: { total: 0, page: 1, limit: 1000, totalPages: 0 } } as never);
  (candidateService.getCitiesSuggestions as ReturnType<typeof vi.fn>).mockResolvedValue({ success: true, data: [] });
  (candidateService.getCandidatesSuggestions as ReturnType<typeof vi.fn>).mockResolvedValue({ success: true, data: [] });
});

afterEach(() => resetStores());

describe('CandidatesListPage', () => {
  it('affiche le squelette de chargement avant la réponse du service', () => {
    // Promesse jamais résolue → la page reste en isLoading.
    getCandidates.mockReturnValue(new Promise(() => {}));

    const { container } = renderWithProviders(<CandidatesListPage />);

    // TableSkeleton pendant le chargement : aucun en-tête réel encore.
    expect(container.querySelectorAll('.MuiSkeleton-root').length).toBeGreaterThan(0);
    expect(screen.queryByRole('heading', { name: /candidats \(/i })).not.toBeInTheDocument();
  });

  it("affiche l'en-tête avec le total et le candidat une fois les données chargées", async () => {
    getCandidates.mockResolvedValue(
      makeResponse([makeCandidate({ firstName: 'Jean', lastName: 'Tremblay' })], 312)
    );

    renderWithProviders(<CandidatesListPage />);

    // Le titre inclut le total renvoyé par la pagination.
    expect(await screen.findByRole('heading', { name: /candidats \(312\)/i })).toBeInTheDocument();
    // Le tableau (composant réel) rend le nom complet du candidat.
    expect(screen.getByText('Jean Tremblay')).toBeInTheDocument();
    // Action principale toujours disponible.
    expect(screen.getByRole('button', { name: /ajouter un candidat/i })).toBeInTheDocument();
  });

  it("affiche l'état vide du tableau quand aucun candidat n'est renvoyé", async () => {
    getCandidates.mockResolvedValue(makeResponse([], 0));

    renderWithProviders(<CandidatesListPage />);

    expect(await screen.findByText(/aucun candidat trouvé/i)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /candidats \(0\)/i })).toBeInTheDocument();
  });

  it("affiche une alerte d'erreur lorsque le chargement échoue", async () => {
    getCandidates.mockRejectedValue(new Error('boom'));

    renderWithProviders(<CandidatesListPage />);

    const alert = await screen.findByRole('alert');
    expect(within(alert).getByText(/impossible de charger la liste des candidats/i)).toBeInTheDocument();
  });

  it('pré-remplit la recherche depuis le paramètre `?q=` de l\'URL', async () => {
    getCandidates.mockResolvedValue(
      makeResponse([makeCandidate({ firstName: 'Marie', lastName: 'Gagnon' })], 1)
    );

    renderWithProviders(<CandidatesListPage />, { route: '/candidates?q=Gagnon' });

    await screen.findByText('Marie Gagnon');
    // Le champ de recherche reflète la valeur du lien profond.
    const searchInput = await screen.findByLabelText(/rechercher un candidat/i);
    expect(searchInput).toHaveValue('Gagnon');
  });

  it('déclenche un export CSV via le service quand on clique sur « Exporter CSV »', async () => {
    const exportCsv = candidateService.exportCandidatesCSV as ReturnType<typeof vi.fn>;
    exportCsv.mockResolvedValue(new Blob(['col1,col2'], { type: 'text/csv' }));
    // Évite que jsdom plante sur createObjectURL (non implémenté par défaut).
    const createObjURL = vi.fn(() => 'blob:mock');
    const revokeObjURL = vi.fn();
    vi.stubGlobal('URL', { ...URL, createObjectURL: createObjURL, revokeObjectURL: revokeObjURL });
    // Le téléchargement crée un <a> et appelle .click() → jsdom tenterait une vraie
    // navigation (non implémentée). On neutralise le clic du lien.
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    const user = userEvent.setup();
    renderWithProviders(<CandidatesListPage />);

    await screen.findByRole('heading', { name: /candidats \(/i });
    await user.click(screen.getByRole('button', { name: /exporter csv/i }));

    await waitFor(() => expect(exportCsv).toHaveBeenCalledTimes(1));

    clickSpy.mockRestore();
    vi.unstubAllGlobals();
  });
});
