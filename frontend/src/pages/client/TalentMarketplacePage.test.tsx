import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderWithProviders, screen, within, userEvent, waitFor } from '@/test/renderWithProviders';
import {
  talentMarketplaceService,
  type TalentPreview,
  type CityOption,
} from '@/services/talent-marketplace.service';

// La page charge villes + talents via TanStack Query → on mocke le service.
vi.mock('@/services/talent-marketplace.service', () => ({
  talentMarketplaceService: {
    getAvailableCities: vi.fn(),
    searchByCity: vi.fn(),
  },
}));

// Le dialog de détail est lourd (vidéo, requête propre) et hors-sujet ici :
// on le neutralise pour isoler le comportement de la marketplace.
vi.mock('./components/TalentDetailDialog', () => ({ default: () => null }));

const getAvailableCities = vi.mocked(talentMarketplaceService.getAvailableCities);
const searchByCity = vi.mocked(talentMarketplaceService.searchByCity);

function makeCity(overrides: Partial<CityOption> = {}): CityOption {
  return { city: 'Montréal', province: 'QC', count: 12, ...overrides };
}

function makeTalent(overrides: Partial<TalentPreview> = {}): TalentPreview {
  return {
    id: 't1',
    firstName: 'Jean',
    city: 'Montréal',
    province: 'QC',
    globalRating: 8.5,
    status: 'QUALIFIED',
    available24_7: false,
    availableDays: true,
    availableNights: false,
    availableWeekends: false,
    availableImmediately: false,
    hasBSP: true,
    bspExpiryDate: null,
    hasDriverLicense: true,
    hasVehicle: true,
    vehicleType: 'Voiture',
    hasRCR: false,
    experiences: [],
    languages: [],
    skills: [],
    ...overrides,
  };
}

/** Sélectionne une ville dans l'Autocomplete (déclenche la recherche). */
async function pickCity(user: ReturnType<typeof userEvent.setup>, label: RegExp) {
  const input = screen.getByLabelText('Rechercher une ville');
  await user.click(input);
  const option = await screen.findByRole('option', { name: label });
  await user.click(option);
}

beforeEach(() => {
  vi.clearAllMocks();
  getAvailableCities.mockResolvedValue({ data: [makeCity()] });
  searchByCity.mockResolvedValue({ data: [], total: 0, city: 'Montréal' });
});

describe('TalentMarketplacePage', () => {
  it("affiche l'en-tête et l'invite tant qu'aucune ville n'est choisie", async () => {
    const { default: Page } = await import('./TalentMarketplacePage');
    renderWithProviders(<Page />);

    expect(
      screen.getByRole('heading', { name: /banque de talents disponibles/i })
    ).toBeInTheDocument();
    expect(
      screen.getByText(/sélectionnez une ville pour voir les candidats disponibles/i)
    ).toBeInTheDocument();
    // Aucune ville sélectionnée → la recherche n'est pas déclenchée.
    expect(searchByCity).not.toHaveBeenCalled();
  });

  it('rend les candidats une fois une ville sélectionnée', async () => {
    searchByCity.mockResolvedValue({
      data: [makeTalent(), makeTalent({ id: 't2', firstName: 'Marie' })],
      total: 2,
      city: 'Montréal',
    });
    const user = userEvent.setup();
    const { default: Page } = await import('./TalentMarketplacePage');
    renderWithProviders(<Page />);

    await pickCity(user, /Montréal, QC \(12\)/);

    expect(await screen.findByText(/2 candidat\(s\) disponible\(s\) à Montréal/i)).toBeInTheDocument();
    // Les prénoms sont masqués partiellement par la carte (« Jean •••• »).
    expect(screen.getByText(/Jean/)).toBeInTheDocument();
    expect(screen.getByText(/Marie/)).toBeInTheDocument();
    expect(searchByCity).toHaveBeenCalledWith(
      expect.objectContaining({ city: 'Montréal' })
    );
  });

  it("affiche l'état vide quand aucun candidat ne correspond", async () => {
    searchByCity.mockResolvedValue({ data: [], total: 0, city: 'Montréal' });
    const user = userEvent.setup();
    const { default: Page } = await import('./TalentMarketplacePage');
    renderWithProviders(<Page />);

    await pickCity(user, /Montréal, QC \(12\)/);

    expect(
      await screen.findByText(/aucun candidat trouvé pour Montréal avec ces filtres/i)
    ).toBeInTheDocument();
  });

  it('affiche une alerte en cas d\'erreur du service de recherche', async () => {
    searchByCity.mockRejectedValue(new Error('boom'));
    const user = userEvent.setup();
    const { default: Page } = await import('./TalentMarketplacePage');
    renderWithProviders(<Page />);

    await pickCity(user, /Montréal, QC \(12\)/);

    expect(
      await screen.findByText(/erreur lors du chargement des candidats/i)
    ).toBeInTheDocument();
  });

  it('sélectionner un candidat affiche le compteur et le bouton de panier', async () => {
    searchByCity.mockResolvedValue({ data: [makeTalent()], total: 1, city: 'Montréal' });
    const user = userEvent.setup();
    const { default: Page } = await import('./TalentMarketplacePage');
    renderWithProviders(<Page />);

    await pickCity(user, /Montréal, QC \(12\)/);
    await screen.findByText(/1 candidat\(s\) disponible\(s\) à Montréal/i);

    // La case « favori » de la carte (cochée → ajoute à la sélection).
    const cards = screen.getAllByRole('checkbox');
    await user.click(cards[cards.length - 1]);

    const counter = await screen.findByText(/1 candidat\(s\) sélectionné\(s\)/i);
    expect(counter).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /voir ma sélection/i })).toBeInTheDocument();
  });

  it('cliquer un filtre relance la recherche avec le bon paramètre', async () => {
    searchByCity.mockResolvedValue({ data: [makeTalent()], total: 1, city: 'Montréal' });
    const user = userEvent.setup();
    const { default: Page } = await import('./TalentMarketplacePage');
    renderWithProviders(<Page />);

    await pickCity(user, /Montréal, QC \(12\)/);
    await screen.findByText(/1 candidat\(s\) disponible\(s\) à Montréal/i);

    await user.click(screen.getByRole('checkbox', { name: /BSP/i }));

    await waitFor(() =>
      expect(searchByCity).toHaveBeenCalledWith(expect.objectContaining({ hasBSP: true }))
    );
  });
});
