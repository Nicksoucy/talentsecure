import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderWithProviders, screen, userEvent } from '@/test/renderWithProviders';
import AdvancedFiltersPanel, { type AdvancedFiltersState } from './AdvancedFiltersPanel';

const makeFilters = (
  overrides: Partial<AdvancedFiltersState> = {}
): AdvancedFiltersState => ({
  cities: [],
  certifications: [],
  availability: {
    available24_7: false,
    availableDays: false,
    availableNights: false,
    availableWeekends: false,
    availableImmediately: false,
  },
  hasVehicle: null,
  hasDriverLicense: null,
  minRating: 0,
  languages: [],
  skills: [],
  ...overrides,
});

const renderPanel = (props: Partial<React.ComponentProps<typeof AdvancedFiltersPanel>> = {}) => {
  const onFilterChange = vi.fn();
  const onReset = vi.fn();
  const onSearch = vi.fn();
  const onCityInputChange = vi.fn();
  renderWithProviders(
    <AdvancedFiltersPanel
      filters={props.filters ?? makeFilters()}
      onFilterChange={props.onFilterChange ?? onFilterChange}
      onReset={props.onReset ?? onReset}
      onSearch={props.onSearch ?? onSearch}
      citySuggestions={props.citySuggestions ?? []}
      onCityInputChange={props.onCityInputChange ?? onCityInputChange}
    />
  );
  return { onFilterChange, onReset, onSearch, onCityInputChange };
};

describe('AdvancedFiltersPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('affiche les titres de section et les deux boutons d\'action', () => {
    renderPanel();

    expect(screen.getByText('DISPONIBILITÉ & TRANSPORT')).toBeInTheDocument();
    expect(screen.getByText('CERTIFICATIONS')).toBeInTheDocument();
    expect(screen.getByText('LOCALISATION')).toBeInTheDocument();
    expect(screen.getByText('NOTE MINIMALE')).toBeInTheDocument();

    expect(
      screen.getByRole('button', { name: /appliquer les filtres/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /réinitialiser/i })
    ).toBeInTheDocument();
  });

  it('cocher "Disponible 24/7" appelle onFilterChange avec la disponibilité mise à jour', async () => {
    const user = userEvent.setup();
    const { onFilterChange } = renderPanel();

    await user.click(screen.getByRole('checkbox', { name: 'Disponible 24/7' }));

    expect(onFilterChange).toHaveBeenCalledTimes(1);
    expect(onFilterChange).toHaveBeenCalledWith(
      expect.objectContaining({
        availability: expect.objectContaining({ available24_7: true }),
      })
    );
  });

  it('cocher "Possède un véhicule" passe hasVehicle de null à true', async () => {
    const user = userEvent.setup();
    const { onFilterChange } = renderPanel();

    await user.click(screen.getByRole('checkbox', { name: 'Possède un véhicule' }));

    expect(onFilterChange).toHaveBeenCalledWith(
      expect.objectContaining({ hasVehicle: true })
    );
  });

  it('décocher "Possède un véhicule" (déjà true) repasse hasVehicle à null', async () => {
    const user = userEvent.setup();
    const { onFilterChange } = renderPanel({ filters: makeFilters({ hasVehicle: true }) });

    const vehicleCheckbox = screen.getByRole('checkbox', { name: 'Possède un véhicule' });
    expect(vehicleCheckbox).toBeChecked();

    await user.click(vehicleCheckbox);

    expect(onFilterChange).toHaveBeenCalledWith(
      expect.objectContaining({ hasVehicle: null })
    );
  });

  it('le bouton Appliquer appelle onSearch et Réinitialiser appelle onReset', async () => {
    const user = userEvent.setup();
    const { onSearch, onReset } = renderPanel();

    await user.click(screen.getByRole('button', { name: /appliquer les filtres/i }));
    expect(onSearch).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: /réinitialiser/i }));
    expect(onReset).toHaveBeenCalledTimes(1);
  });

  it('affiche le libellé de note selon minRating', () => {
    const { unmount } = renderWithProviders(
      <AdvancedFiltersPanel
        filters={makeFilters({ minRating: 0 })}
        onFilterChange={vi.fn()}
        onReset={vi.fn()}
        onSearch={vi.fn()}
        citySuggestions={[]}
        onCityInputChange={vi.fn()}
      />
    );
    expect(screen.getByText('Toutes les notes')).toBeInTheDocument();
    unmount();

    renderWithProviders(
      <AdvancedFiltersPanel
        filters={makeFilters({ minRating: 7.5 })}
        onFilterChange={vi.fn()}
        onReset={vi.fn()}
        onSearch={vi.fn()}
        citySuggestions={[]}
        onCityInputChange={vi.fn()}
      />
    );
    expect(screen.getByText('7.5/10 et plus')).toBeInTheDocument();
  });

  it('sélectionner une certification appelle onFilterChange avec la valeur ajoutée', async () => {
    const user = userEvent.setup();
    const { onFilterChange } = renderPanel();

    const certInput = screen.getByLabelText('Certifications requises');
    await user.click(certInput);
    await user.click(await screen.findByRole('option', { name: 'RCR' }));

    expect(onFilterChange).toHaveBeenCalledWith(
      expect.objectContaining({ certifications: ['RCR'] })
    );
  });
});
