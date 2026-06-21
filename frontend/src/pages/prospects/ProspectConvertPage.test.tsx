import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderWithProviders, screen, waitFor, userEvent } from '@/test/renderWithProviders';
import { Routes, Route } from 'react-router-dom';
import ProspectConvertPage from './ProspectConvertPage';
import { prospectService } from '@/services/prospect.service';
import type { ProspectCandidate } from '@/types';

// La page récupère le prospect via TanStack Query → on mocke le service.
vi.mock('@/services/prospect.service', () => ({
  prospectService: {
    getProspectById: vi.fn(),
    convertToCandidate: vi.fn(),
  },
}));

// InterviewEvaluationForm est un gros Stepper (lazy) hors-sujet pour cette page :
// on le remplace par un stub léger qui expose onSubmit / onCancel / isSubmitting.
vi.mock('@/components/InterviewEvaluationForm', () => ({
  default: ({
    onSubmit,
    onCancel,
    isSubmitting,
  }: {
    onSubmit: (v: unknown) => void;
    onCancel: () => void;
    isSubmitting: boolean;
  }) => (
    <div>
      <p>Formulaire d'évaluation (stub)</p>
      <p>{isSubmitting ? 'Envoi en cours' : 'Prêt'}</p>
      <button
        type="button"
        onClick={() =>
          onSubmit({ firstName: 'Jean', lastName: 'Tremblay', phone: '514-555-0000' })
        }
      >
        Soumettre stub
      </button>
      <button type="button" onClick={onCancel}>
        Annuler stub
      </button>
    </div>
  ),
}));

// On espionne la navigation (succès / retour) sans changer le reste du routeur.
const navigateSpy = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => navigateSpy };
});

const getProspectById = vi.mocked(prospectService.getProspectById);
const convertToCandidate = vi.mocked(prospectService.convertToCandidate);

function makeProspect(overrides: Partial<ProspectCandidate> = {}): ProspectCandidate {
  return {
    id: 'pr-1',
    firstName: 'Jean',
    lastName: 'Tremblay',
    email: 'jean@example.com',
    phone: '514-555-0000',
    city: 'Montréal',
    isContacted: true,
    isConverted: false,
    isDeleted: false,
    createdAt: '2026-06-19T00:00:00.000Z',
    updatedAt: '2026-06-19T00:00:00.000Z',
    ...overrides,
  };
}

// La page lit l'id via useParams → on monte sous une route paramétrée.
function renderPage(route = '/prospects/pr-1/convert') {
  return renderWithProviders(
    <Routes>
      <Route path="/prospects/:id/convert" element={<ProspectConvertPage />} />
    </Routes>,
    { route }
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('ProspectConvertPage', () => {
  it('affiche un squelette de chargement avant la réponse du service', () => {
    getProspectById.mockReturnValue(new Promise(() => {}));
    const { container } = renderPage();

    expect(container.querySelectorAll('.MuiSkeleton-root').length).toBeGreaterThan(0);
    expect(screen.queryByText(/conversion du prospect/i)).not.toBeInTheDocument();
  });

  it('rend le titre et le nom du prospect une fois les données chargées', async () => {
    getProspectById.mockResolvedValue({ data: makeProspect() });
    renderPage();

    expect(await screen.findByRole('heading', { name: /conversion du prospect/i })).toBeInTheDocument();
    expect(
      screen.getByText(/complétez l'évaluation d'entretien avant de convertir jean tremblay/i)
    ).toBeInTheDocument();
    // Le service a été interrogé avec l'id d'URL.
    expect(getProspectById).toHaveBeenCalledWith('pr-1');
  });

  it("affiche une alerte d'erreur quand le chargement échoue", async () => {
    getProspectById.mockRejectedValue(new Error('boom'));
    renderPage();

    expect(await screen.findByText(/erreur lors du chargement du prospect/i)).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /conversion du prospect/i })).not.toBeInTheDocument();
  });

  it('convertit le prospect et navigue vers la fiche candidat en cas de succès', async () => {
    getProspectById.mockResolvedValue({ data: makeProspect() });
    convertToCandidate.mockResolvedValue({ data: { id: 'cand-9' }, message: 'ok' });

    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: /soumettre stub/i }));

    await waitFor(() =>
      expect(convertToCandidate).toHaveBeenCalledWith('pr-1', expect.any(Object))
    );
    await waitFor(() => expect(navigateSpy).toHaveBeenCalledWith('/candidates/cand-9'));
  });

  it('ne convertit pas et reste sur la page si la mutation échoue', async () => {
    getProspectById.mockResolvedValue({ data: makeProspect() });
    convertToCandidate.mockRejectedValue({ response: { data: { error: 'Conversion impossible' } } });

    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: /soumettre stub/i }));

    await waitFor(() => expect(convertToCandidate).toHaveBeenCalledTimes(1));
    // L'échec ne déclenche aucune navigation.
    expect(navigateSpy).not.toHaveBeenCalledWith(expect.stringContaining('/candidates/'));
    expect(screen.getByRole('heading', { name: /conversion du prospect/i })).toBeInTheDocument();
  });

  it('le bouton « Retour » ramène à la fiche du prospect', async () => {
    getProspectById.mockResolvedValue({ data: makeProspect() });

    const user = userEvent.setup();
    renderPage();

    await screen.findByRole('heading', { name: /conversion du prospect/i });
    await user.click(screen.getByRole('button', { name: /retour/i }));

    expect(navigateSpy).toHaveBeenCalledWith('/prospects/pr-1');
  });
});
