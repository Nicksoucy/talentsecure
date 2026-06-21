import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderWithProviders, screen, within, userEvent } from '@/test/renderWithProviders';
import CandidateFiltersBar from './CandidateFiltersBar';

type Props = React.ComponentProps<typeof CandidateFiltersBar>;

const baseFilters: Props['filters'] = {
  status: '',
  minRating: '',
  city: '',
  hasVideo: '',
  interviewDateStart: '',
  interviewDateEnd: '',
  certification: '',
};

/**
 * Sous jsdom, le <Select> MUI n'expose pas de nom accessible (pas de aria-labelledby
 * reliant la combobox à son InputLabel). On retrouve donc la combobox via le
 * FormControl qui contient le texte du label.
 */
function getSelectByLabel(label: string): HTMLElement {
  // L'InputLabel visible (le texte est aussi dupliqué dans le <legend> du notch).
  const labelEl = screen
    .getAllByText(label)
    .find((el) => el.classList.contains('MuiInputLabel-root'));
  if (!labelEl) throw new Error(`InputLabel introuvable pour le label "${label}"`);
  const formControl = labelEl.closest('.MuiFormControl-root');
  if (!formControl) throw new Error(`FormControl introuvable pour le label "${label}"`);
  const combobox = formControl.querySelector('[role="combobox"]');
  if (!combobox) throw new Error(`combobox introuvable pour le label "${label}"`);
  return combobox as HTMLElement;
}

function makeProps(overrides: Partial<Props> = {}): Props {
  return {
    search: '',
    onSearchChange: vi.fn(),
    filters: baseFilters,
    onFilterChange: vi.fn(),
    includeArchived: false,
    onIncludeArchivedChange: vi.fn(),
    showFilters: false,
    onToggleFilters: vi.fn(),
    candidateSuggestions: [],
    loadingCandidates: false,
    onFetchCandidateSuggestions: vi.fn(),
    citySuggestions: [],
    cityInput: '',
    onCityInputChange: vi.fn(),
    ...overrides,
  };
}

describe('CandidateFiltersBar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rend la barre de recherche et le bouton Filtres (sans suffixe "Avancés" par défaut)', () => {
    renderWithProviders(<CandidateFiltersBar {...makeProps()} />);

    expect(screen.getByLabelText('Rechercher un candidat')).toBeInTheDocument();
    const filterButton = screen.getByRole('button', { name: 'Filtres' });
    expect(filterButton).toBeInTheDocument();
    expect(
      screen.getByRole('checkbox', { name: 'Voir archivés' })
    ).toBeInTheDocument();
  });

  it('saisir dans la recherche déclenche onSearchChange et, à partir de 2 caractères, onFetchCandidateSuggestions', async () => {
    const onSearchChange = vi.fn();
    const onFetchCandidateSuggestions = vi.fn();
    renderWithProviders(
      <CandidateFiltersBar
        {...makeProps({ onSearchChange, onFetchCandidateSuggestions })}
      />
    );

    await userEvent.type(screen.getByLabelText('Rechercher un candidat'), 'Je');

    expect(onSearchChange).toHaveBeenCalled();
    expect(onSearchChange).toHaveBeenLastCalledWith('Je');
    // Le fetch de suggestions ne part qu'à partir de 2 caractères.
    expect(onFetchCandidateSuggestions).toHaveBeenCalledWith('Je');
  });

  it('bascule le switch "Voir archivés" appelle onIncludeArchivedChange(true)', async () => {
    const onIncludeArchivedChange = vi.fn();
    renderWithProviders(
      <CandidateFiltersBar {...makeProps({ onIncludeArchivedChange })} />
    );

    await userEvent.click(screen.getByRole('checkbox', { name: 'Voir archivés' }));

    expect(onIncludeArchivedChange).toHaveBeenCalledTimes(1);
    expect(onIncludeArchivedChange).toHaveBeenCalledWith(true);
  });

  it('cliquer sur le bouton Filtres appelle onToggleFilters', async () => {
    const onToggleFilters = vi.fn();
    renderWithProviders(
      <CandidateFiltersBar {...makeProps({ onToggleFilters })} />
    );

    await userEvent.click(screen.getByRole('button', { name: 'Filtres' }));

    expect(onToggleFilters).toHaveBeenCalledTimes(1);
  });

  it('affiche les filtres par défaut (Statut, Note minimale, certifications) quand showFilters est vrai', () => {
    renderWithProviders(
      <CandidateFiltersBar {...makeProps({ showFilters: true })} />
    );

    expect(getSelectByLabel('Statut')).toBeInTheDocument();
    expect(getSelectByLabel('Note minimale')).toBeInTheDocument();
    expect(getSelectByLabel("Vidéo d'entretien")).toBeInTheDocument();
    expect(getSelectByLabel('Certification / Formation')).toBeInTheDocument();
    // Champ date d'entretien (TextField natif) accessible par son label.
    expect(screen.getByLabelText("Date d'entretien (début)")).toBeInTheDocument();
  });

  it('changer le filtre Statut déclenche onFilterChange("status", valeur)', async () => {
    const onFilterChange = vi.fn();
    renderWithProviders(
      <CandidateFiltersBar {...makeProps({ showFilters: true, onFilterChange })} />
    );

    // Ouvre le Select MUI puis sélectionne une option.
    await userEvent.click(getSelectByLabel('Statut'));
    const listbox = await screen.findByRole('listbox');
    await userEvent.click(within(listbox).getByRole('option', { name: 'Élite' }));

    expect(onFilterChange).toHaveBeenCalledWith('status', 'ELITE');
  });

  it('quand advancedFiltersComponent est fourni: suffixe "Avancés" et rendu du composant à la place des filtres par défaut', () => {
    renderWithProviders(
      <CandidateFiltersBar
        {...makeProps({
          showFilters: true,
          advancedFiltersComponent: <div>Filtres maison</div>,
        })}
      />
    );

    expect(screen.getByRole('button', { name: 'Filtres Avancés' })).toBeInTheDocument();
    expect(screen.getByText('Filtres maison')).toBeInTheDocument();
    // Les filtres par défaut sont remplacés par le composant fourni (plus de label "Statut").
    expect(screen.queryByText('Statut')).not.toBeInTheDocument();
  });
});
