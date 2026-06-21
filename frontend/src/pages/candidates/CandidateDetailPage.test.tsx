import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Routes, Route } from 'react-router-dom';
import { renderWithProviders, screen, waitFor, userEvent } from '@/test/renderWithProviders';
import { resetStores } from '@/test/resetStores';
import { useAuthStore } from '@/store/authStore';
import { makeUser } from '@/test/factories';
import { candidateService } from '@/services/candidate.service';

// Couche données de la page = ces deux services (via TanStack Query). On les
// mocke pour piloter chargement / données / erreur sans toucher au réseau.
vi.mock('@/services/candidate.service', () => ({
  candidateService: {
    getCandidateById: vi.fn(),
    getVideosList: vi.fn(),
    updateCandidate: vi.fn(),
  },
}));
vi.mock('@/services/employee.service', () => ({
  employeeService: { promoteCandidate: vi.fn() },
}));

// Enfants lourds (uploads, lecteurs vidéo, panneaux IA, gros formulaire) : on les
// neutralise pour isoler le comportement de la page et éviter tout hang réseau.
vi.mock('@/components/CVUpload', () => ({ default: () => null }));
vi.mock('@/components/video/VideoUpload', () => ({ default: () => null }));
vi.mock('@/components/video/VideoPlayer', () => ({ default: () => null }));
vi.mock('@/components/candidates/SkillsExtractionPanel', () => ({ default: () => null }));
vi.mock('@/components/candidates/QuickOverview', () => ({
  default: () => <div data-testid="quick-overview" />,
}));
vi.mock('@/components/candidates/CandidateBadges', () => ({ default: () => null }));
vi.mock('../../components/InterviewEvaluationForm', () => ({
  default: () => <div data-testid="interview-form" />,
}));

import CandidateDetailPage from './CandidateDetailPage';

const getCandidateById = vi.mocked(candidateService.getCandidateById);
const getVideosList = vi.mocked(candidateService.getVideosList);

function makeCandidateDetail(over: Record<string, unknown> = {}) {
  return {
    id: 'c1',
    firstName: 'Jean',
    lastName: 'Tremblay',
    email: 'jean.tremblay@example.com',
    phone: '514-555-0100',
    city: 'Montréal',
    province: 'QC',
    status: 'EXCELLENT',
    hasBSP: true,
    hasVehicle: false,
    globalRating: 8,
    hrNotes: 'Très bon contact lors de l’entrevue.',
    interviewDate: '2026-06-10T00:00:00.000Z',
    createdAt: '2026-01-01T00:00:00.000Z',
    experiences: [],
    languages: [],
    certifications: [],
    situationTests: [],
    availabilities: [],
    ...over,
  };
}

function makeVideosResp() {
  return { success: true, data: [] };
}

// La page lit l'id via useParams → on la monte derrière une Route paramétrée.
function renderPage(route = '/candidates/c1') {
  return renderWithProviders(
    <Routes>
      <Route path="/candidates/:id" element={<CandidateDetailPage />} />
    </Routes>,
    { route }
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  useAuthStore.getState().setAuth(makeUser({ role: 'ADMIN' }), 'tok', 'refresh');
  getCandidateById.mockResolvedValue({ data: makeCandidateDetail() as never });
  getVideosList.mockResolvedValue(makeVideosResp() as never);
});

afterEach(() => resetStores());

describe('CandidateDetailPage', () => {
  it('affiche le squelette de chargement avant la réponse du service', () => {
    getCandidateById.mockReturnValue(new Promise(() => {}) as never);
    const { container } = renderPage();

    expect(container.querySelectorAll('.MuiSkeleton-root').length).toBeGreaterThan(0);
    expect(screen.queryByRole('heading', { name: /jean tremblay/i })).not.toBeInTheDocument();
  });

  it('rend l’en-tête et les informations du candidat une fois chargé', async () => {
    renderPage();

    expect(await screen.findByRole('heading', { name: /jean tremblay/i })).toBeInTheDocument();
    // Statut traduit en libellé français.
    expect(screen.getByText('Excellent')).toBeInTheDocument();
    // Onglet « Vue d'ensemble » : coordonnées et notes RH.
    expect(screen.getByText('jean.tremblay@example.com')).toBeInTheDocument();
    expect(screen.getByText('514-555-0100')).toBeInTheDocument();
    expect(screen.getByText('Très bon contact lors de l’entrevue.')).toBeInTheDocument();
    // Le service id de l'URL est bien utilisé.
    expect(getCandidateById).toHaveBeenCalledWith('c1');
  });

  it('affiche une alerte d’erreur quand le candidat est introuvable', async () => {
    getCandidateById.mockRejectedValue(new Error('not found'));
    renderPage();

    expect(
      await screen.findByText(/erreur lors du chargement du candidat/i)
    ).toBeInTheDocument();
    // Pas d'en-tête candidat quand le chargement échoue.
    expect(screen.queryByRole('heading', { name: /jean tremblay/i })).not.toBeInTheDocument();
  });

  it('change d’onglet vers « Évaluation » et affiche la note globale', async () => {
    const user = userEvent.setup();
    renderPage();

    await screen.findByRole('heading', { name: /jean tremblay/i });
    await user.click(screen.getByRole('tab', { name: /évaluation/i }));

    expect(await screen.findByRole('heading', { name: /^évaluation$/i })).toBeInTheDocument();
    expect(screen.getByText('Note globale')).toBeInTheDocument();
    expect(screen.getByText('8')).toBeInTheDocument();
  });

  it('ouvre le dialog « Promouvoir en employé » au clic', async () => {
    const user = userEvent.setup();
    renderPage();

    await screen.findByRole('heading', { name: /jean tremblay/i });
    await user.click(screen.getByRole('button', { name: /promouvoir en employé/i }));

    const dialog = await screen.findByRole('dialog');
    expect(dialog).toBeInTheDocument();
    expect(screen.getByLabelText(/date d'embauche/i)).toBeInTheDocument();
  });

  it('affiche l’état vide des expériences dans l’onglet compétences', async () => {
    const user = userEvent.setup();
    renderPage();

    await screen.findByRole('heading', { name: /jean tremblay/i });
    await user.click(screen.getByRole('tab', { name: /expérience & compétences/i }));

    await waitFor(() =>
      expect(screen.getByText(/aucune expérience renseignée/i)).toBeInTheDocument()
    );
    expect(screen.getByText(/aucune langue renseignée/i)).toBeInTheDocument();
  });
});
