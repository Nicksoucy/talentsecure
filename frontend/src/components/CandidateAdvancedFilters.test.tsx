import { describe, it, expect, vi } from 'vitest';
import { renderWithProviders, screen, userEvent, waitFor } from '@/test/renderWithProviders';
import CandidateAdvancedFilters from './CandidateAdvancedFilters';

describe('CandidateAdvancedFilters', () => {
  it('affiche les sections, le champ recherche et les actions', () => {
    renderWithProviders(
      <CandidateAdvancedFilters onFiltersChange={vi.fn()} onSearch={vi.fn()} />
    );

    // Titre du panneau de filtres
    expect(
      screen.getByText(/filtres de recherche avancés/i)
    ).toBeInTheDocument();

    // Champ texte principal
    expect(
      screen.getByLabelText(/recherche par nom, ville, etc\./i)
    ).toBeInTheDocument();

    // Chips de statut et de langue rendus
    expect(screen.getByText('ELITE')).toBeInTheDocument();
    expect(screen.getByText('Français')).toBeInTheDocument();

    // Boutons d'action
    expect(screen.getByRole('button', { name: /rechercher/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /réinitialiser/i })).toBeInTheDocument();
  });

  it('affiche le nombre de résultats au pluriel quand resultCount est fourni', () => {
    renderWithProviders(
      <CandidateAdvancedFilters
        onFiltersChange={vi.fn()}
        onSearch={vi.fn()}
        resultCount={3}
      />
    );

    expect(screen.getByText(/3 candidats trouvés/i)).toBeInTheDocument();
  });

  it('affiche le singulier pour un seul résultat', () => {
    renderWithProviders(
      <CandidateAdvancedFilters
        onFiltersChange={vi.fn()}
        onSearch={vi.fn()}
        resultCount={1}
      />
    );

    expect(screen.getByText('1 candidat trouvé')).toBeInTheDocument();
  });

  it("n'affiche pas le compteur de résultats quand resultCount est absent", () => {
    renderWithProviders(
      <CandidateAdvancedFilters onFiltersChange={vi.fn()} onSearch={vi.fn()} />
    );

    expect(screen.queryByText(/candidat.*trouvé/i)).not.toBeInTheDocument();
  });

  it('saisir dans le champ recherche déclenche onFiltersChange avec la valeur', async () => {
    const onFiltersChange = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(
      <CandidateAdvancedFilters onFiltersChange={onFiltersChange} onSearch={vi.fn()} />
    );

    await user.type(screen.getByLabelText(/recherche par nom, ville, etc\./i), 'Jean');

    await waitFor(() =>
      expect(onFiltersChange).toHaveBeenLastCalledWith(
        expect.objectContaining({ search: 'Jean' })
      )
    );
  });

  it('cliquer un chip de statut ajoute le statut aux filtres', async () => {
    const onFiltersChange = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(
      <CandidateAdvancedFilters onFiltersChange={onFiltersChange} onSearch={vi.fn()} />
    );

    await user.click(screen.getByText('ELITE'));

    expect(onFiltersChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: ['ELITE'] })
    );
  });

  it('le bouton Rechercher appelle onSearch', async () => {
    const onSearch = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(
      <CandidateAdvancedFilters onFiltersChange={vi.fn()} onSearch={onSearch} />
    );

    await user.click(screen.getByRole('button', { name: /rechercher/i }));

    expect(onSearch).toHaveBeenCalledTimes(1);
  });
});
