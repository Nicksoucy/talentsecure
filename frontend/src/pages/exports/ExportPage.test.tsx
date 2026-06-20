import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderWithProviders, screen, waitFor, userEvent } from '@/test/renderWithProviders';
import ExportPage from './ExportPage';
import { skillsService } from '@/services/skills.service';
import { useAuthStore } from '@/store/authStore';
import { resetStores } from '@/test/resetStores';
import { makeUser } from '@/test/factories';

// La page charge l'aperçu via skillsService.searchSkills (TanStack/effet + debounce)
// et exporte via skillsService.exportSkills → on mocke le service appelé pour
// piloter données / vide / erreur sans toucher au réseau.
vi.mock('@/services/skills.service', () => ({
  skillsService: {
    searchSkills: vi.fn(),
    exportSkills: vi.fn(),
  },
}));

const searchSkills = vi.mocked(skillsService.searchSkills);
const exportSkills = vi.mocked(skillsService.exportSkills);

// Forme réaliste renvoyée par searchSkills : tableau de compétences, chacune avec
// ses candidats (la page aplatit skill × candidats pour le tableau d'aperçu).
function makeSearchResults() {
  return {
    results: [
      {
        skillName: 'Cariste',
        category: 'TECHNICAL',
        candidates: [
          {
            confidence: 0.92,
            level: 'EXPERT',
            yearsExperience: 6,
            candidate: { firstName: 'Jean', lastName: 'Tremblay', city: 'Montréal', province: 'QC' },
          },
        ],
      },
    ],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  // La plupart des actions exigent un token ; on connecte l'utilisateur par défaut.
  useAuthStore.getState().setAuth(makeUser(), 'tok-123', 'refresh-123');
  // Défaut « chargé » ; chaque test surcharge au besoin.
  searchSkills.mockResolvedValue(makeSearchResults());
});

afterEach(() => resetStores());

describe('ExportPage', () => {
  it('affiche l\'en-tête et l\'état vide sans filtre actif', () => {
    renderWithProviders(<ExportPage />);

    expect(screen.getByRole('heading', { name: /exports de compétences/i })).toBeInTheDocument();
    expect(screen.getByText(/ajustez les filtres pour voir un aperçu avant export/i)).toBeInTheDocument();
    // Sans filtre seedé, aucun appel d'aperçu ne doit partir.
    expect(searchSkills).not.toHaveBeenCalled();
  });

  it('charge et rend l\'aperçu quand un filtre est présent dans l\'URL', async () => {
    renderWithProviders(<ExportPage />, { route: '/exports?q=cariste' });

    // Le tableau d'aperçu apparaît après le chargement (debounce + service mocké).
    expect(await screen.findByText('Cariste')).toBeInTheDocument();
    expect(screen.getByText('Jean Tremblay')).toBeInTheDocument();
    expect(screen.getByText(/Montréal, QC/)).toBeInTheDocument();
    // Confiance formatée en pourcentage (0.92 → « 92 % »).
    expect(screen.getByText('92 %')).toBeInTheDocument();
    expect(searchSkills).toHaveBeenCalledWith('cariste', undefined, undefined, undefined, 'tok-123');
  });

  it('n\'affiche pas le tableau si l\'aperçu échoue, mais garde la page rendue', async () => {
    searchSkills.mockRejectedValue(new Error('boom'));

    renderWithProviders(<ExportPage />, { route: '/exports?q=cariste' });

    // L'erreur déclenche une snackbar ; le tableau ne se monte pas.
    await waitFor(() => expect(searchSkills).toHaveBeenCalled());
    expect(screen.queryByText('Cariste')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /exports de compétences/i })).toBeInTheDocument();
  });

  it('le bouton « Export CSV » appelle le service avec le format et les filtres', async () => {
    exportSkills.mockResolvedValue({
      data: new Blob(['col1,col2']),
      headers: { 'content-type': 'text/csv' },
    } as never);

    const user = userEvent.setup();
    renderWithProviders(<ExportPage />, { route: '/exports?q=cariste' });

    await user.click(screen.getByRole('button', { name: /export csv/i }));

    await waitFor(() => expect(exportSkills).toHaveBeenCalledTimes(1));
    expect(exportSkills).toHaveBeenCalledWith(
      'csv',
      expect.objectContaining({ query: 'cariste', limit: 250 }),
      'tok-123'
    );
  });

  it('refuse l\'export sans token et n\'appelle pas le service', async () => {
    // Déconnexion : la garde « Vous devez être connecté » doit court-circuiter.
    useAuthStore.getState().logout();

    const user = userEvent.setup();
    renderWithProviders(<ExportPage />);

    await user.click(screen.getByRole('button', { name: /export pdf/i }));

    expect(exportSkills).not.toHaveBeenCalled();
  });
});
