import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Routes, Route } from 'react-router-dom';
import { renderWithProviders, screen, waitFor, userEvent } from '@/test/renderWithProviders';
import type { ProspectCandidate } from '@/types';

// La page lit ses données via TanStack Query → on mocke le service appelé.
// updateProspect / getCvUrl / refreshVideoFromGhl sont aussi exposés par le
// service ; on les stubbe pour couvrir l'édition et les sous-cartes.
vi.mock('@/services/prospect.service', () => ({
  prospectService: {
    getProspectById: vi.fn(),
    updateProspect: vi.fn(),
    getCvUrl: vi.fn(),
    refreshVideoFromGhl: vi.fn(),
  },
}));

// Enfants lourds (lecteur vidéo signé R2, aperçu CV iframe, squelette détaillé) :
// neutralisés pour isoler le comportement de la page et éviter tout hang réseau.
vi.mock('@/components/CVPreview', () => ({ default: () => <div>cv-preview</div> }));
vi.mock('@/components/video/ProspectVideoPlayer', () => ({ default: () => <div>video-player</div> }));
vi.mock('@/components/skeletons', () => ({
  DetailPageSkeleton: () => <div data-testid="detail-skeleton">chargement…</div>,
}));

import { prospectService } from '@/services/prospect.service';
import ProspectDetailPage from './ProspectDetailPage';

const getProspectById = vi.mocked(prospectService.getProspectById);
const updateProspect = vi.mocked(prospectService.updateProspect);
const getCvUrl = vi.mocked(prospectService.getCvUrl);

function makeProspect(overrides: Partial<ProspectCandidate> = {}): ProspectCandidate {
  return {
    id: 'pr-1',
    firstName: 'Sophie',
    lastName: 'Lavoie',
    email: 'sophie.lavoie@example.com',
    phone: '514-555-0199',
    city: 'Montréal',
    province: 'QC',
    postalCode: 'H2X 1Y4',
    country: 'Canada',
    fullAddress: '123 rue Sainte-Catherine, Montréal',
    submissionDate: '2026-06-10T00:00:00.000Z',
    isContacted: false,
    isConverted: false,
    isDeleted: false,
    createdAt: '2026-06-10T00:00:00.000Z',
    updatedAt: '2026-06-10T00:00:00.000Z',
    ...overrides,
  } as ProspectCandidate;
}

// La page utilise useParams → on la monte derrière une route /prospects/:id.
function renderPage(route = '/prospects/pr-1') {
  return renderWithProviders(
    <Routes>
      <Route path="/prospects/:id" element={<ProspectDetailPage />} />
      <Route path="/prospects" element={<div>liste prospects</div>} />
    </Routes>,
    { route }
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  getCvUrl.mockResolvedValue({ data: { url: '' } } as never);
});

describe('ProspectDetailPage', () => {
  it('affiche le squelette pendant le chargement', () => {
    // Promesse jamais résolue → reste en chargement.
    getProspectById.mockReturnValue(new Promise(() => {}) as never);

    renderPage();

    expect(screen.getByTestId('detail-skeleton')).toBeInTheDocument();
  });

  it('rend le nom et les informations personnelles une fois chargé', async () => {
    getProspectById.mockResolvedValue({ data: makeProspect() });

    renderPage();

    expect(
      await screen.findByRole('heading', { name: /sophie lavoie/i })
    ).toBeInTheDocument();
    expect(screen.getByText('sophie.lavoie@example.com')).toBeInTheDocument();
    expect(screen.getByText('514-555-0199')).toBeInTheDocument();
    expect(screen.getByText('123 rue Sainte-Catherine, Montréal')).toBeInTheDocument();
    // Section statut : prospect non contacté / non converti → puces « Non ».
    expect(screen.getByRole('heading', { name: /statut et suivi/i })).toBeInTheDocument();
  });

  it('affiche le bouton « Convertir en candidat » quand le prospect ne l\'est pas', async () => {
    getProspectById.mockResolvedValue({ data: makeProspect({ isConverted: false }) });

    renderPage();

    await screen.findByRole('heading', { name: /sophie lavoie/i });
    expect(screen.getByRole('button', { name: /convertir en candidat/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /marquer contacté/i })).toBeInTheDocument();
  });

  it('masque les boutons d\'action quand le prospect est déjà converti et contacté', async () => {
    getProspectById.mockResolvedValue({
      data: makeProspect({ isContacted: true, isConverted: true }),
    });

    renderPage();

    await screen.findByRole('heading', { name: /sophie lavoie/i });
    expect(screen.queryByRole('button', { name: /convertir en candidat/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /marquer contacté/i })).not.toBeInTheDocument();
  });

  it('affiche une alerte d\'erreur lorsque le chargement échoue', async () => {
    getProspectById.mockRejectedValue(new Error('boom'));

    renderPage();

    expect(
      await screen.findByText(/erreur lors du chargement du prospect/i)
    ).toBeInTheDocument();
  });

  it('ouvre le dialogue d\'édition pré-rempli et enregistre les modifications', async () => {
    getProspectById.mockResolvedValue({ data: makeProspect() });
    updateProspect.mockResolvedValue({ data: makeProspect(), message: 'ok' } as never);

    const user = userEvent.setup();
    renderPage();

    await screen.findByRole('heading', { name: /sophie lavoie/i });
    await user.click(screen.getByRole('button', { name: /modifier/i }));

    // Le dialogue s'ouvre, pré-rempli depuis le prospect.
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /modifier la fiche/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/prénom/i)).toHaveValue('Sophie');

    await user.click(screen.getByRole('button', { name: /^enregistrer$/i }));

    await waitFor(() => expect(updateProspect).toHaveBeenCalledTimes(1));
    expect(updateProspect).toHaveBeenCalledWith('pr-1', expect.objectContaining({ firstName: 'Sophie' }));
  });
});
