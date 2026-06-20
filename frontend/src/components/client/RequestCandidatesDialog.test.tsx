import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderWithProviders, screen, within, userEvent, act } from '@/test/renderWithProviders';
import RequestCandidatesDialog from './RequestCandidatesDialog';

const defaultProps = {
  open: true,
  onClose: vi.fn(),
  city: 'Montréal',
  count: 3,
  catalogueTitle: 'Talents disponibles - Été 2026',
  onSubmit: vi.fn(),
};

describe('RequestCandidatesDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('ne rend rien quand open est false', () => {
    renderWithProviders(<RequestCandidatesDialog {...defaultProps} open={false} />);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByText(/Demande de candidats/)).not.toBeInTheDocument();
  });

  it('affiche le titre avec la ville, le catalogue, le compte de candidats et le champ message', () => {
    renderWithProviders(<RequestCandidatesDialog {...defaultProps} />);

    const dialog = screen.getByRole('dialog');
    // Titre avec la ville.
    expect(within(dialog).getByText('Demande de candidats - Montréal')).toBeInTheDocument();
    // Le titre du catalogue est rendu.
    expect(within(dialog).getByText('Talents disponibles - Été 2026')).toBeInTheDocument();
    // Le chip de comptage est au pluriel pour count > 1.
    expect(within(dialog).getByText('3 candidats disponibles')).toBeInTheDocument();
    // Champ message présent et vide au départ.
    expect(within(dialog).getByLabelText(/Message/)).toHaveValue('');
    // Les deux actions sont disponibles.
    expect(within(dialog).getByRole('button', { name: 'Annuler' })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Envoyer la demande' })).toBeInTheDocument();
  });

  it('accorde le libellé du compte au singulier quand count vaut 1', () => {
    renderWithProviders(<RequestCandidatesDialog {...defaultProps} count={1} />);

    expect(screen.getByText('1 candidat disponible')).toBeInTheDocument();
    expect(screen.queryByText('1 candidats disponibles')).not.toBeInTheDocument();
  });

  it('appelle onClose au clic sur Annuler', async () => {
    const onClose = vi.fn();
    renderWithProviders(<RequestCandidatesDialog {...defaultProps} onClose={onClose} />);

    await userEvent.click(screen.getByRole('button', { name: 'Annuler' }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('transmet le message saisi à onSubmit puis affiche l\'avis de succès', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    renderWithProviders(<RequestCandidatesDialog {...defaultProps} onSubmit={onSubmit} />);

    await user.type(screen.getByLabelText(/Message/), 'Besoin de chauffeurs classe 1');
    await user.click(screen.getByRole('button', { name: 'Envoyer la demande' }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith('Besoin de chauffeurs classe 1');
    // Après soumission : avis de succès et masquage des actions/formulaire.
    expect(screen.getByText(/Votre demande a été envoyée avec succès/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Envoyer la demande' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Message/)).not.toBeInTheDocument();
  });

  it('ferme automatiquement le dialogue après le délai post-soumission', async () => {
    vi.useFakeTimers();
    try {
      const onClose = vi.fn();
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      renderWithProviders(<RequestCandidatesDialog {...defaultProps} onClose={onClose} />);

      await user.click(screen.getByRole('button', { name: 'Envoyer la demande' }));

      // Le timer de 2s n'a pas encore expiré : pas de fermeture.
      expect(onClose).not.toHaveBeenCalled();

      act(() => {
        vi.advanceTimersByTime(2000);
      });

      expect(onClose).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('ne déclenche pas onClose via le bouton Annuler pendant l\'état soumis', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    renderWithProviders(<RequestCandidatesDialog {...defaultProps} onClose={onClose} />);

    await user.click(screen.getByRole('button', { name: 'Envoyer la demande' }));

    // Le footer (et donc Annuler) est masqué une fois soumis : aucune fermeture manuelle possible.
    expect(screen.queryByRole('button', { name: 'Annuler' })).not.toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });
});

afterEach(() => {
  vi.useRealTimers();
});
