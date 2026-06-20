import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderWithProviders, screen, userEvent } from '@/test/renderWithProviders';
import CandidatesPage from './CandidatesPage';

// Page-placeholder statique (aucun service / hook / store) : on teste le
// comportement visible — en-tête, action principale et message d'attente.
beforeEach(() => {
  vi.clearAllMocks();
});

describe('CandidatesPage', () => {
  it("affiche l'en-tête « Candidats »", () => {
    renderWithProviders(<CandidatesPage />);
    expect(screen.getByRole('heading', { name: 'Candidats' })).toBeInTheDocument();
  });

  it('expose le bouton d\'action « Ajouter un candidat »', () => {
    renderWithProviders(<CandidatesPage />);
    expect(
      screen.getByRole('button', { name: /ajouter un candidat/i })
    ).toBeInTheDocument();
  });

  it("affiche le message d'attente de la fonctionnalité", () => {
    renderWithProviders(<CandidatesPage />);
    expect(
      screen.getByText(/la liste des candidats sera affichée ici/i)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/cette fonctionnalité sera développée dans les prochaines semaines/i)
    ).toBeInTheDocument();
  });

  it('le bouton « Ajouter un candidat » est cliquable sans planter', async () => {
    const user = userEvent.setup();
    renderWithProviders(<CandidatesPage />);

    const addButton = screen.getByRole('button', { name: /ajouter un candidat/i });
    await user.click(addButton);

    // Aucune navigation/dialog n'est encore branchée : la page reste affichée.
    expect(addButton).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Candidats' })).toBeInTheDocument();
  });
});
