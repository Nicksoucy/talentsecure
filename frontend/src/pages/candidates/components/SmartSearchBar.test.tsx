import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderWithProviders, screen, userEvent, waitFor } from '@/test/renderWithProviders';

vi.mock('@/services/candidate.service', () => ({
  candidateService: { parseNaturalLanguageQuery: vi.fn() },
}));

import SmartSearchBar from './SmartSearchBar';
import { candidateService } from '@/services/candidate.service';

const svc = candidateService as unknown as {
  parseNaturalLanguageQuery: ReturnType<typeof vi.fn>;
};

describe('SmartSearchBar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rend la barre de recherche avec le champ accessible et n'affiche aucun filtre au départ", () => {
    renderWithProviders(<SmartSearchBar onSearch={vi.fn()} onClear={vi.fn()} />);

    expect(screen.getByRole('textbox', { name: /smart search/i })).toBeInTheDocument();
    // Pas de bloc de filtres détectés tant qu'aucune recherche n'a abouti.
    expect(screen.queryByText('Filtres détectés:')).not.toBeInTheDocument();
  });

  it("ne lance pas de recherche quand la requête est vide (bouton cliqué sans saisie)", async () => {
    renderWithProviders(<SmartSearchBar onSearch={vi.fn()} onClear={vi.fn()} />);

    await userEvent.click(screen.getByRole('button', { name: 'search' }));

    expect(svc.parseNaturalLanguageQuery).not.toHaveBeenCalled();
  });

  it('parse la requête, appelle onSearch et affiche les filtres détectés au clic sur recherche', async () => {
    svc.parseNaturalLanguageQuery.mockResolvedValue({
      success: true,
      data: { cities: ['Montréal'], hasVehicle: true, minRating: 8 },
    });
    const onSearch = vi.fn();

    renderWithProviders(<SmartSearchBar onSearch={onSearch} onClear={vi.fn()} />);

    await userEvent.type(
      screen.getByRole('textbox', { name: /smart search/i }),
      'Agent à Montréal avec véhicule'
    );
    await userEvent.click(screen.getByRole('button', { name: 'search' }));

    await waitFor(() =>
      expect(svc.parseNaturalLanguageQuery).toHaveBeenCalledWith('Agent à Montréal avec véhicule')
    );
    expect(onSearch).toHaveBeenCalledWith({ cities: ['Montréal'], hasVehicle: true, minRating: 8 });

    // Les chips de filtres détectés apparaissent.
    expect(await screen.findByText('Filtres détectés:')).toBeInTheDocument();
    expect(screen.getByText('Villes: Montréal')).toBeInTheDocument();
    expect(screen.getByText('Avec véhicule')).toBeInTheDocument();
    expect(screen.getByText('Note min: 8/10')).toBeInTheDocument();
  });

  it('lance la recherche en appuyant sur Entrée dans le champ', async () => {
    svc.parseNaturalLanguageQuery.mockResolvedValue({
      success: true,
      data: { skills: ['BSP'] },
    });
    const onSearch = vi.fn();

    renderWithProviders(<SmartSearchBar onSearch={onSearch} onClear={vi.fn()} />);

    await userEvent.type(
      screen.getByRole('textbox', { name: /smart search/i }),
      'BSP{Enter}'
    );

    await waitFor(() => expect(svc.parseNaturalLanguageQuery).toHaveBeenCalledWith('BSP'));
    expect(onSearch).toHaveBeenCalledWith({ skills: ['BSP'] });
    expect(await screen.findByText('Compétences: BSP')).toBeInTheDocument();
  });

  it('affiche une erreur (snackbar) et ne déclenche pas onSearch si le parsing échoue', async () => {
    svc.parseNaturalLanguageQuery.mockRejectedValue(new Error('boom'));
    const onSearch = vi.fn();

    renderWithProviders(<SmartSearchBar onSearch={onSearch} onClear={vi.fn()} />);

    await userEvent.type(screen.getByRole('textbox', { name: /smart search/i }), 'requête bizarre');
    await userEvent.click(screen.getByRole('button', { name: 'search' }));

    expect(
      await screen.findByText(/Impossible de comprendre la recherche/i)
    ).toBeInTheDocument();
    expect(onSearch).not.toHaveBeenCalled();
  });

  it('vide le champ et appelle onClear via le bouton effacer', async () => {
    const onClear = vi.fn();
    renderWithProviders(<SmartSearchBar onSearch={vi.fn()} onClear={onClear} />);

    const input = screen.getByRole('textbox', { name: /smart search/i });
    await userEvent.type(input, 'du texte');
    expect(input).toHaveValue('du texte');

    // Le bouton effacer n'apparaît que lorsqu'il y a du texte.
    await userEvent.click(screen.getByRole('button', { name: 'clear' }));

    expect(onClear).toHaveBeenCalledTimes(1);
    expect(input).toHaveValue('');
  });
});
