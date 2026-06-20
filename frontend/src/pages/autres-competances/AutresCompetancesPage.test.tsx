import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderWithProviders, screen, waitFor, userEvent } from '@/test/renderWithProviders';
import { useAuthStore } from '@/store/authStore';
import { resetStores } from '@/test/resetStores';
import { makeUser } from '@/test/factories';
import { prospectService } from '@/services/prospect.service';
import { skillsService } from '@/services/skills.service';
import type { ProspectCandidate } from '@/types';

// Couche données de la page = ces deux services (adossés à TanStack Query / axios).
// On les mocke pour piloter chargement / données / vide sans toucher au réseau.
vi.mock('@/services/prospect.service', () => ({
  prospectService: {
    getProspects: vi.fn(),
    getProspectsExtractionStats: vi.fn(),
  },
}));

vi.mock('@/services/skills.service', () => ({
  skillsService: {
    searchSkills: vi.fn(),
  },
}));

// Dialogs lourds (extraction, batch, historique, confirmations) : hors-sujet pour
// le comportement de la page → neutralisés pour isoler en-tête / tableau / onglets.
vi.mock('./components/ExtractionResultsDialog', () => ({ default: () => null }));
vi.mock('./components/BatchResultsDialog', () => ({ default: () => null }));
vi.mock('./components/ExtractionHistoryDialog', () => ({ default: () => null }));
vi.mock('./components/ReExtractionConfirmDialog', () => ({ default: () => null }));
vi.mock('./components/BatchExtractionConfirmDialog', () => ({ default: () => null }));

import AutresCompetancesPage from './AutresCompetancesPage';

const getProspects = vi.mocked(prospectService.getProspects);
const getExtractionStats = vi.mocked(prospectService.getProspectsExtractionStats);
const searchSkills = vi.mocked(skillsService.searchSkills);

function makeProspect(overrides: Partial<ProspectCandidate> = {}): ProspectCandidate {
  return {
    id: 'pr-1',
    firstName: 'Jean',
    lastName: 'Tremblay',
    email: 'jean@example.com',
    phone: '514-555-0100',
    city: 'Montréal',
    province: 'QC',
    cvStoragePath: 'cv/jean.pdf',
    isContacted: false,
    isConverted: false,
    isDeleted: false,
    createdAt: '2026-06-01T00:00:00.000Z',
    updatedAt: '2026-06-01T00:00:00.000Z',
    ...overrides,
  } as ProspectCandidate;
}

function prospectsResponse(data: ProspectCandidate[]) {
  return {
    data,
    pagination: { total: data.length, page: 1, limit: 1000, totalPages: 1 },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  // La page lit accessToken depuis le store auth (mutations + recherche skills).
  useAuthStore.getState().setAuth(makeUser(), 'tok', 'refresh');
  // Valeurs par défaut « chargées » ; chaque test surcharge au besoin.
  getProspects.mockResolvedValue(prospectsResponse([makeProspect()]));
  getExtractionStats.mockResolvedValue({ total: 10, withSkills: 4, withoutSkills: 6 });
  searchSkills.mockResolvedValue({ results: [] });
});

afterEach(() => resetStores());

describe('AutresCompetancesPage', () => {
  it("affiche l'en-tête et le sous-titre", async () => {
    renderWithProviders(<AutresCompetancesPage />);

    expect(screen.getByRole('heading', { name: /autre compétence/i })).toBeInTheDocument();
    expect(
      screen.getByText(/candidats avec des compétences hors du secteur de la sécurité/i)
    ).toBeInTheDocument();
    // Onglets principaux présents.
    expect(screen.getByRole('tab', { name: /extraction de cvs/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /recherche de compétences/i })).toBeInTheDocument();
  });

  it('rend le prospect chargé et les stats d\'extraction', async () => {
    getProspects.mockResolvedValue(
      prospectsResponse([
        makeProspect({ id: 'pr-1', firstName: 'Marie', lastName: 'Gagnon' }),
      ])
    );
    getExtractionStats.mockResolvedValue({ total: 42, withSkills: 12, withoutSkills: 30 });

    renderWithProviders(<AutresCompetancesPage />);

    // Le prospect apparaît une fois la requête TanStack Query résolue.
    expect(await screen.findByText('Marie Gagnon')).toBeInTheDocument();
    // Les chips de stats reflètent la réponse mockée.
    expect(screen.getByText('30 Non traités')).toBeInTheDocument();
    expect(screen.getByText('12 Traités')).toBeInTheDocument();
    expect(screen.getByText('42 Total')).toBeInTheDocument();
  });

  it("affiche l'état vide quand aucun prospect n'est retourné", async () => {
    getProspects.mockResolvedValue(prospectsResponse([]));

    renderWithProviders(<AutresCompetancesPage />);

    expect(
      await screen.findByText(/aucun candidat potentiel trouvé/i)
    ).toBeInTheDocument();
  });

  it('avertit quand on lance une extraction batch sans CV disponible', async () => {
    // Prospect sans CV → handleBatchExtract court-circuite avec une snackbar warning.
    getProspects.mockResolvedValue(
      prospectsResponse([makeProspect({ cvUrl: undefined, cvStoragePath: undefined })])
    );

    const user = userEvent.setup();
    renderWithProviders(<AutresCompetancesPage />);

    // Attendre le rendu post-chargement avant de cliquer.
    await screen.findByText('Jean Tremblay');
    // Le bouton d'en-tête « Extraire les compétences » lance le batch (le 1er :
    // le tableau expose aussi une icône d'extraction au même nom accessible).
    const [batchButton] = screen.getAllByRole('button', { name: /^extraire les compétences$/i });
    await user.click(batchButton);

    expect(
      await screen.findByText(/aucun candidat avec cv disponible/i)
    ).toBeInTheDocument();
  });

  it("bascule sur l'onglet Recherche et charge automatiquement les compétences", async () => {
    searchSkills.mockResolvedValue({
      results: [
        {
          skillId: 's1',
          skillName: 'Soudure',
          category: 'Métiers',
          totalCandidates: 2,
          candidates: [
            { candidateId: 'c1', confidence: 0.9, level: 'EXPERT', candidate: { firstName: 'Léo', lastName: 'Roy' } },
            { candidateId: 'c2', confidence: 0.7, level: 'ADVANCED', candidate: { firstName: 'Ana', lastName: 'Côté' } },
          ],
        },
      ],
    });

    const user = userEvent.setup();
    renderWithProviders(<AutresCompetancesPage />);

    await screen.findByText('Jean Tremblay');
    await user.click(screen.getByRole('tab', { name: /recherche de compétences/i }));

    // useEffect → loadAllSkills() appelle le service à l'arrivée sur l'onglet.
    await waitFor(() => expect(searchSkills).toHaveBeenCalled());
    // La compétence trouvée s'affiche (titre de carte + tableau → au moins une fois).
    expect((await screen.findAllByText('Soudure')).length).toBeGreaterThan(0);
    // Le filtre de l'onglet recherche est présent.
    expect(screen.getByText(/filtrer les compétences/i)).toBeInTheDocument();
  });
});
