import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderWithProviders, screen, within, userEvent } from '@/test/renderWithProviders';
import { useAuthStore } from '@/store/authStore';
import { resetStores } from '@/test/resetStores';
import { makeUser } from '@/test/factories';
import type { ProspectStats } from '@/hooks/useProspectStats';
import type { CandidateStats } from '@/hooks/useCandidateStats';
import type { DashboardOverview } from '@/services/dashboard.service';

// Les cartes Leaflet sont lourdes (DOM, tuiles) et hors-sujet pour la page :
// on les neutralise pour isoler le tableau de bord.
vi.mock('@/components/map/CandidatesMap', () => ({ default: () => null }));
vi.mock('@/components/map/ProspectsMapClustered', () => ({ default: () => null }));

// La couche données de la page = ces trois hooks (chacun adossé à un service +
// TanStack Query). On les mocke pour piloter chargement / données / erreur sans
// toucher au réseau, et garder le test centré sur le comportement de la page.
vi.mock('@/hooks/useProspectStats', () => ({ useProspectStats: vi.fn() }));
vi.mock('@/hooks/useCandidateStats', () => ({ useCandidateStats: vi.fn() }));
vi.mock('@/hooks/useDashboardOverview', () => ({ useDashboardOverview: vi.fn() }));

import { useProspectStats } from '@/hooks/useProspectStats';
import { useCandidateStats } from '@/hooks/useCandidateStats';
import { useDashboardOverview } from '@/hooks/useDashboardOverview';
import DashboardPage from './DashboardPage';

const mockProspect = useProspectStats as ReturnType<typeof vi.fn>;
const mockCandidate = useCandidateStats as ReturnType<typeof vi.fn>;
const mockOverview = useDashboardOverview as ReturnType<typeof vi.fn>;

// Recharts a besoin d'un conteneur dimensionné (ResponsiveContainer) ; jsdom
// renvoie 0×0 → on force des dimensions pour que le donut se monte sans warning.
beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(400);
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(280);
});

function makeProspectStats(over: Partial<ProspectStats> = {}): ProspectStats {
  return { total: 120, pending: 40, contacted: 50, converted: 30, conversionRate: '25.0', ...over };
}

function makeCandidateStats(over: Partial<CandidateStats> = {}): CandidateStats {
  return {
    total: 312,
    elite: 8,
    excellent: 20,
    veryGood: 35,
    good: 60,
    qualified: 90,
    toReview: 50,
    pending: 30,
    absent: 10,
    inactive: 9,
    ...over,
  };
}

function makeOverview(over: Partial<DashboardOverview> = {}): DashboardOverview {
  return {
    catalogues: { total: 14, createdThisWeek: 3 },
    conversions: { total: 30, convertedThisMonth: 5 },
    employees: { total: 25, active: 18 },
    recentActivity: [
      {
        id: 'a1',
        action: 'CREATE',
        resource: 'Candidate',
        resourceId: 'c1',
        details: null,
        createdAt: '2026-06-19T10:00:00.000Z',
        user: { name: 'Léa Bouchard' },
      },
    ],
    ...over,
  };
}

// Helpers pour produire la forme exacte retournée par chaque hook.
function prospectHook(over: Record<string, unknown> = {}) {
  return { stats: makeProspectStats(), isLoading: false, error: null, refetch: vi.fn(), ...over };
}
function candidateHook(over: Record<string, unknown> = {}) {
  return { stats: makeCandidateStats(), isLoading: false, error: null, refetch: vi.fn(), ...over };
}
function overviewHook(over: Record<string, unknown> = {}) {
  return { overview: makeOverview(), isLoading: false, error: null, refetch: vi.fn(), ...over };
}

beforeEach(() => {
  vi.clearAllMocks();
  // L'en-tête lit user.firstName depuis le store auth.
  useAuthStore.getState().setAuth(makeUser({ firstName: 'Camille' }), 'tok', 'refresh');
  // Valeurs par défaut « chargées » ; chaque test surcharge au besoin.
  mockProspect.mockReturnValue(prospectHook());
  mockCandidate.mockReturnValue(candidateHook());
  mockOverview.mockReturnValue(overviewHook());
});

afterEach(() => resetStores());

describe('DashboardPage', () => {
  it("affiche l'en-tête de bienvenue avec le prénom de l'utilisateur", () => {
    renderWithProviders(<DashboardPage />);
    expect(screen.getByRole('heading', { name: /bienvenue, camille/i })).toBeInTheDocument();
    expect(
      screen.getByText(/tableau de bord — vue d'ensemble de vos candidats/i)
    ).toBeInTheDocument();
  });

  it('rend les KPI et l\'activité récente une fois les données chargées', () => {
    renderWithProviders(<DashboardPage />);

    // KPI candidats (total + élite) provenant du hook candidat.
    expect(screen.getByText('Total candidats qualifiés')).toBeInTheDocument();
    expect(screen.getByText('312')).toBeInTheDocument();
    expect(screen.getByText('Candidats Élite')).toBeInTheDocument();

    // KPI overview (catalogues / conversions) + tendances.
    expect(screen.getByText('Catalogues créés')).toBeInTheDocument();
    expect(screen.getByText('+3 cette semaine')).toBeInTheDocument();
    expect(screen.getByText('+5 ce mois')).toBeInTheDocument();

    // Bloc employés actifs.
    expect(screen.getByRole('heading', { name: /employés actifs/i })).toBeInTheDocument();
    expect(screen.getByText('sur 25 employés au total')).toBeInTheDocument();

    // Activité récente : phrase française construite depuis action + ressource.
    expect(screen.getByText('Léa Bouchard')).toBeInTheDocument();
    expect(screen.getByText(/a ajouté un candidat/i)).toBeInTheDocument();
  });

  it('affiche les squelettes de chargement quand les hooks sont en cours', () => {
    mockProspect.mockReturnValue(prospectHook({ isLoading: true, stats: undefined }));
    mockCandidate.mockReturnValue(candidateHook({ isLoading: true, stats: undefined }));
    mockOverview.mockReturnValue(overviewHook({ isLoading: true, overview: undefined }));

    const { container } = renderWithProviders(<DashboardPage />);

    // Les MuiSkeleton remplacent valeurs/donut/listes pendant le chargement.
    expect(container.querySelectorAll('.MuiSkeleton-root').length).toBeGreaterThan(0);
    // Aucune valeur réelle ne doit fuiter pendant le chargement.
    expect(screen.queryByText('312')).not.toBeInTheDocument();
  });

  it("affiche l'état vide quand il n'y a aucune donnée", () => {
    mockProspect.mockReturnValue(prospectHook({ stats: undefined }));
    mockCandidate.mockReturnValue(candidateHook({ stats: undefined }));
    mockOverview.mockReturnValue(overviewHook({ overview: { ...makeOverview(), recentActivity: [] } }));

    renderWithProviders(<DashboardPage />);

    // Plusieurs blocs (entonnoir prospects, donut candidats) basculent sur le
    // même message d'état vide quand leurs données manquent.
    expect(screen.getAllByText('Aucune donnée disponible').length).toBeGreaterThan(0);
    // Activité récente vide → message dédié.
    expect(screen.getByText(/aucune activité récente pour le moment/i)).toBeInTheDocument();
  });

  it("affiche une alerte d'erreur lorsqu'un hook échoue", () => {
    mockCandidate.mockReturnValue(
      candidateHook({ stats: undefined, error: new Error('Échec du chargement candidats') })
    );

    renderWithProviders(<DashboardPage />);

    const alert = screen.getByRole('alert');
    expect(within(alert).getByText(/erreur de chargement/i)).toBeInTheDocument();
    expect(within(alert).getByText(/échec du chargement candidats/i)).toBeInTheDocument();
    expect(within(alert).getByRole('button', { name: /réessayer/i })).toBeInTheDocument();
  });

  it('le bouton « Actualiser » relance les trois refetch', async () => {
    const refetchProspects = vi.fn();
    const refetchCandidates = vi.fn();
    const refetchOverview = vi.fn();
    mockProspect.mockReturnValue(prospectHook({ refetch: refetchProspects }));
    mockCandidate.mockReturnValue(candidateHook({ refetch: refetchCandidates }));
    mockOverview.mockReturnValue(overviewHook({ refetch: refetchOverview }));

    const user = userEvent.setup();
    renderWithProviders(<DashboardPage />);

    await user.click(screen.getByRole('button', { name: /actualiser/i }));

    expect(refetchProspects).toHaveBeenCalledTimes(1);
    expect(refetchCandidates).toHaveBeenCalledTimes(1);
    expect(refetchOverview).toHaveBeenCalledTimes(1);
  });
});
