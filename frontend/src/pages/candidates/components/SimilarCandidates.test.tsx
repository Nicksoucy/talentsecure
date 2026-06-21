import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderWithProviders, screen, within, userEvent, waitFor } from '@/test/renderWithProviders';
import { makeCandidate } from '@/test/factories';

const navigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => navigate };
});

vi.mock('@/services/candidate.service', () => ({
  candidateService: { getSimilarCandidates: vi.fn() },
}));

import SimilarCandidates from './SimilarCandidates';
import { candidateService } from '@/services/candidate.service';

const svc = candidateService as unknown as {
  getSimilarCandidates: ReturnType<typeof vi.fn>;
};

describe('SimilarCandidates', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("interroge le service avec l'id du candidat courant", async () => {
    svc.getSimilarCandidates.mockResolvedValue({ success: true, data: [] });

    renderWithProviders(<SimilarCandidates currentCandidateId="cand-42" />);

    await waitFor(() => expect(svc.getSimilarCandidates).toHaveBeenCalledTimes(1));
    expect(svc.getSimilarCandidates).toHaveBeenCalledWith('cand-42');
  });

  it("affiche l'en-tête et les candidats similaires une fois chargés", async () => {
    svc.getSimilarCandidates.mockResolvedValue({
      success: true,
      data: [
        makeCandidate({ id: 'c-a', firstName: 'Marie', lastName: 'Dubois', globalRating: 8 }),
        makeCandidate({ id: 'c-b', firstName: 'Luc', lastName: 'Gagnon', globalRating: 6 }),
      ],
    });

    renderWithProviders(<SimilarCandidates currentCandidateId="cand-1" />);

    expect(await screen.findByText('Marie Dubois')).toBeInTheDocument();
    expect(screen.getByText('Luc Gagnon')).toBeInTheDocument();
    // En-tête + badge IA.
    expect(screen.getByText(/Candidats similaires/)).toBeInTheDocument();
    expect(screen.getByText('Suggéré par IA')).toBeInTheDocument();
    // La note globale est rendue sur 10.
    expect(screen.getByText('8/10')).toBeInTheDocument();
  });

  it('affiche N/A pour la note quand globalRating est absent et les chips conditionnels', async () => {
    svc.getSimilarCandidates.mockResolvedValue({
      success: true,
      data: [
        makeCandidate({
          id: 'c-c',
          firstName: 'Paul',
          lastName: 'Roy',
          globalRating: undefined,
          city: 'Laval',
          hasBSP: true,
          hasVehicle: false,
        }),
      ],
    });

    renderWithProviders(<SimilarCandidates currentCandidateId="cand-1" />);

    expect(await screen.findByText('Paul Roy')).toBeInTheDocument();
    expect(screen.getByText('N/A/10')).toBeInTheDocument();
    // city + hasBSP affichés ; hasVehicle (false) absent.
    expect(screen.getByText('Laval')).toBeInTheDocument();
    expect(screen.getByText('BSP')).toBeInTheDocument();
    expect(screen.queryByText('Véhicule')).not.toBeInTheDocument();
  });

  it('navigue vers la fiche du candidat au clic sur sa carte', async () => {
    svc.getSimilarCandidates.mockResolvedValue({
      success: true,
      data: [makeCandidate({ id: 'c-xyz', firstName: 'Sophie', lastName: 'Lavoie' })],
    });

    renderWithProviders(<SimilarCandidates currentCandidateId="cand-1" />);

    const name = await screen.findByText('Sophie Lavoie');
    await userEvent.click(name);

    expect(navigate).toHaveBeenCalledWith('/candidates/c-xyz');
  });

  it('ne rend rien quand la liste de candidats similaires est vide', async () => {
    svc.getSimilarCandidates.mockResolvedValue({ success: true, data: [] });

    const { container } = renderWithProviders(<SimilarCandidates currentCandidateId="cand-1" />);

    // On attend la résolution de la requête, puis le composant retourne null.
    await waitFor(() => expect(svc.getSimilarCandidates).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByText(/Candidats similaires/)).not.toBeInTheDocument());
    expect(container).toBeEmptyDOMElement();
  });

  it("affiche un état de chargement (squelettes) avant l'arrivée des données", () => {
    // Promesse jamais résolue → l'UI reste en chargement.
    svc.getSimilarCandidates.mockReturnValue(new Promise(() => {}));

    renderWithProviders(<SimilarCandidates currentCandidateId="cand-1" />);

    // Le titre de chargement est présent ; pas encore le badge IA.
    expect(screen.getByText('Candidats similaires')).toBeInTheDocument();
    expect(screen.queryByText('Suggéré par IA')).not.toBeInTheDocument();
  });
});
