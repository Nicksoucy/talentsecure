import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderWithProviders, screen, within, userEvent, waitFor } from '@/test/renderWithProviders';

// Service réseau mocké : zéro appel HTTP réel (MSW onUnhandledRequest:'error').
vi.mock('@/services/talent-marketplace.service', () => ({
  talentMarketplaceService: { searchByCity: vi.fn() },
}));

// Enfants lourds remplacés par des stubs minimaux qui exposent le nom du talent
// et un bouton de sélection, pour tester l'interaction sans leur logique propre.
vi.mock('@/pages/client/components/TalentCard', () => ({
  default: ({
    talent,
    selected,
    onToggleSelect,
  }: {
    talent: { id: string; firstName: string };
    selected: boolean;
    onToggleSelect: (id: string) => void;
  }) => (
    <button type="button" data-selected={selected} onClick={() => onToggleSelect(talent.id)}>
      Carte {talent.firstName}
    </button>
  ),
}));

vi.mock('@/pages/client/components/CVListItem', () => ({
  default: ({
    talent,
    onToggleSelect,
  }: {
    talent: { id: string; firstName: string };
    selected: boolean;
    onToggleSelect: (id: string) => void;
  }) => (
    <button type="button" onClick={() => onToggleSelect(talent.id)}>
      CV {talent.firstName}
    </button>
  ),
}));

import CityTalentsModal from './CityTalentsModal';
import { talentMarketplaceService, type TalentPreview } from '@/services/talent-marketplace.service';
import { useWishlistStore } from '@/store/wishlistStore';
import { useClientAuthStore } from '@/store/clientAuthStore';

const searchByCity = talentMarketplaceService.searchByCity as ReturnType<typeof vi.fn>;

const makeTalent = (overrides: Partial<TalentPreview> = {}): TalentPreview => ({
  id: 'tal-1',
  firstName: 'Marc',
  city: 'Montréal',
  province: 'QC',
  globalRating: 8,
  status: 'AVAILABLE',
  available24_7: false,
  availableDays: true,
  availableNights: false,
  availableWeekends: false,
  availableImmediately: true,
  hasBSP: true,
  bspExpiryDate: null,
  hasDriverLicense: true,
  hasVehicle: true,
  vehicleType: null,
  hasRCR: false,
  experiences: [],
  languages: [],
  skills: [],
  ...overrides,
});

describe('CityTalentsModal', () => {
  let addItem: ReturnType<typeof vi.fn>;
  let getCityPricing: ReturnType<typeof vi.fn>;
  let getAvailableCount: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();

    addItem = vi.fn().mockResolvedValue(undefined);
    getCityPricing = vi.fn().mockResolvedValue({
      evaluatedCandidatePrice: 150,
      cvOnlyPrice: 40,
    });
    getAvailableCount = vi.fn().mockResolvedValue({ evaluated: 12, cvOnly: 30 });

    // Store contrôlé : on injecte les actions mockées, aucune action réseau réelle.
    useWishlistStore.setState({
      addItem: addItem as unknown as WishlistStoreAddItem,
      getCityPricing: getCityPricing as unknown as WishlistStoreGetPricing,
      getAvailableCount: getAvailableCount as unknown as WishlistStoreGetCount,
    });
    useClientAuthStore.setState({ accessToken: 'tok-abc' });

    searchByCity.mockResolvedValue({ data: [makeTalent()], total: 1, city: 'Montréal' });
  });

  it('ne rend pas le contenu quand open est false', () => {
    renderWithProviders(
      <CityTalentsModal open={false} onClose={vi.fn()} city="Montréal" mode="evaluated" />,
    );

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByText('Demande Rapide')).not.toBeInTheDocument();
  });

  it('affiche l\'en-tête, le badge du mode et charge la tarification de la ville', async () => {
    renderWithProviders(
      <CityTalentsModal open onClose={vi.fn()} city="Québec" province="QC" mode="evaluated" />,
    );

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('Québec, QC')).toBeInTheDocument();
    expect(within(dialog).getByText('Candidats Évalués')).toBeInTheDocument();

    // Tarification chargée via le store (mode évalué → 150$/candidat).
    await waitFor(() => expect(getCityPricing).toHaveBeenCalledWith('tok-abc', 'Québec'));
    expect(getAvailableCount).toHaveBeenCalledWith('tok-abc', 'Québec');
    expect(await screen.findByText('150.00$ par candidat')).toBeInTheDocument();
    // Disponibilité affichée pour le mode évalué.
    expect(screen.getByText('12 disponibles')).toBeInTheDocument();
  });

  it('ajoute des candidats au panier via la demande rapide avec la quantité choisie', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    renderWithProviders(
      <CityTalentsModal open onClose={onClose} city="Laval" province="QC" mode="evaluated" />,
    );

    // On attend que prix/disponibilité soient chargés (bouton +5 actif).
    await screen.findByText('150.00$ par candidat');

    await user.click(screen.getByRole('button', { name: '+5' }));
    // Total recalculé : 5 x 150 = 750$.
    expect(await screen.findByText('= 750.00$')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Ajouter au panier \(750\.00\$\)/ }));

    await waitFor(() => expect(addItem).toHaveBeenCalledTimes(1));
    expect(addItem).toHaveBeenCalledWith('tok-abc', {
      city: 'Laval',
      province: 'QC',
      type: 'EVALUATED',
      quantity: 5,
      notes: '',
    });
    // Fermeture du modal après succès.
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it('avertit sans appeler addItem quand on soumet une demande rapide vide', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <CityTalentsModal open onClose={vi.fn()} city="Montréal" mode="evaluated" />,
    );

    await screen.findByText('150.00$ par candidat');

    // Aucune quantité sélectionnée → le bouton "Ajouter au panier" est désactivé.
    const addToCart = screen.getByRole('button', { name: /Ajouter au panier/ });
    expect(addToCart).toBeDisabled();
    expect(addItem).not.toHaveBeenCalled();
  });

  it('charge les talents et permet la sélection manuelle dans l\'onglet dédié', async () => {
    const user = userEvent.setup();
    searchByCity.mockResolvedValue({
      data: [makeTalent({ id: 't1', firstName: 'Anne' }), makeTalent({ id: 't2', firstName: 'Bruno' })],
      total: 2,
      city: 'Montréal',
    });

    renderWithProviders(
      <CityTalentsModal open onClose={vi.fn()} city="Montréal" province="QC" mode="evaluated" />,
    );

    await user.click(screen.getByRole('tab', { name: 'Sélection Manuelle' }));

    // Le service est appelé avec la ville, le mode et les filtres par défaut.
    await waitFor(() => expect(searchByCity).toHaveBeenCalledTimes(1));
    expect(searchByCity).toHaveBeenCalledWith(
      expect.objectContaining({ city: 'Montréal', mode: 'evaluated', minRating: 7 }),
    );

    // Les cartes (stub) des deux talents sont rendues.
    expect(await screen.findByRole('button', { name: 'Carte Anne' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Carte Bruno' })).toBeInTheDocument();

    // Sélection d'un talent → compteur du pied de page mis à jour.
    await user.click(screen.getByRole('button', { name: 'Carte Anne' }));
    expect(await screen.findByText('1 sélectionné(s)')).toBeInTheDocument();
  });

  it('affiche une alerte quand le chargement des talents échoue', async () => {
    const user = userEvent.setup();
    searchByCity.mockRejectedValue(new Error('boom'));

    renderWithProviders(
      <CityTalentsModal open onClose={vi.fn()} city="Montréal" mode="cvonly" />,
    );

    await user.click(screen.getByRole('tab', { name: 'Sélection Manuelle' }));

    expect(await screen.findByText('Erreur lors du chargement des candidats')).toBeInTheDocument();
    expect(addItem).not.toHaveBeenCalled();
  });
});

// Types d'aide pour caster les mocks d'actions du store sans `any`.
type WishlistStoreAddItem = ReturnType<typeof useWishlistStore.getState>['addItem'];
type WishlistStoreGetPricing = ReturnType<typeof useWishlistStore.getState>['getCityPricing'];
type WishlistStoreGetCount = ReturnType<typeof useWishlistStore.getState>['getAvailableCount'];
