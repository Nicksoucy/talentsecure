import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  renderWithProviders,
  screen,
  within,
  userEvent,
  waitFor,
} from '@/test/renderWithProviders';
import CitySelectDialog from './CitySelectDialog';
import { useWishlistStore, type CityPricing } from '@/store/wishlistStore';
import { useClientAuthStore } from '@/store/clientAuthStore';

const makePricing = (overrides: Partial<CityPricing> = {}): CityPricing => ({
  id: 'price-1',
  city: 'Montréal',
  province: 'QC',
  evaluatedCandidateMinPrice: 100,
  evaluatedCandidateMaxPrice: 300,
  evaluatedCandidatePrice: 200,
  cvOnlyMinPrice: 20,
  cvOnlyMaxPrice: 80,
  cvOnlyPrice: 50,
  priceMultiplier: 1,
  ...overrides,
});

describe('CitySelectDialog', () => {
  let addItem: ReturnType<typeof vi.fn>;
  let getCityPricing: ReturnType<typeof vi.fn>;
  let getAvailableCount: ReturnType<typeof vi.fn>;
  let onClose: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    addItem = vi.fn().mockResolvedValue(undefined);
    getCityPricing = vi.fn().mockResolvedValue(makePricing());
    getAvailableCount = vi.fn().mockResolvedValue({ evaluated: 8, cvOnly: 12 });
    onClose = vi.fn();

    // État du store contrôlé directement : on remplace les actions réseau par des
    // mocks (zéro appel HTTP réel, MSW est en onUnhandledRequest:'error').
    useWishlistStore.setState({
      addItem: addItem as unknown as ReturnType<typeof useWishlistStore.getState>['addItem'],
      getCityPricing: getCityPricing as unknown as ReturnType<
        typeof useWishlistStore.getState
      >['getCityPricing'],
      getAvailableCount: getAvailableCount as unknown as ReturnType<
        typeof useWishlistStore.getState
      >['getAvailableCount'],
    });
    // Token requis : le useEffect ne charge les données que si accessToken existe.
    useClientAuthStore.setState({ accessToken: 'tok-abc' });
  });

  it('affiche le dialog ouvert avec le titre ville/province et la disponibilité totale', async () => {
    renderWithProviders(
      <CitySelectDialog open onClose={onClose} city="Montréal" province="QC" />
    );

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Montréal, QC')).toBeInTheDocument();

    // 8 évalués + 12 cv = 20 candidats disponibles (puce affichée après chargement).
    await waitFor(() =>
      expect(within(dialog).getByText('20 candidats disponibles')).toBeInTheDocument()
    );
    // Les données ont été chargées via les actions du store, pas par réseau.
    expect(getCityPricing).toHaveBeenCalledWith('tok-abc', 'Montréal');
    expect(getAvailableCount).toHaveBeenCalledWith('tok-abc', 'Montréal');
  });

  it('affiche la tarification et les disponibilités par type une fois chargées', async () => {
    renderWithProviders(
      <CitySelectDialog open onClose={onClose} city="Montréal" province="QC" />
    );

    expect(await screen.findByText('Tarification pour Montréal')).toBeInTheDocument();
    // Prix évalué 200.00$ et prix CV 50.00$ formatés.
    expect(screen.getByText('200.00$')).toBeInTheDocument();
    expect(screen.getByText('50.00$')).toBeInTheDocument();
    // Puces de disponibilité par catégorie.
    expect(screen.getByText('8 disponibles')).toBeInTheDocument();
    expect(screen.getByText('12 disponibles')).toBeInTheDocument();
  });

  it('affiche une alerte d\'erreur si le chargement échoue', async () => {
    getCityPricing.mockRejectedValueOnce(new Error('boom'));
    renderWithProviders(
      <CitySelectDialog open onClose={onClose} city="Québec" province="QC" />
    );

    expect(
      await screen.findByText('Erreur lors du chargement des données')
    ).toBeInTheDocument();
    // Le bouton d'ajout reste désactivé tant qu'aucune quantité valide n'existe.
    expect(screen.getByRole('button', { name: /Ajouter au panier/i })).toBeDisabled();
  });

  it('ajoute au panier la quantité sélectionnée puis ferme le dialog', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <CitySelectDialog open onClose={onClose} city="Montréal" province="QC" />
    );

    // Attendre la fin du chargement (boutons d'ajout rapide rendus).
    // Deux boutons "+5" existent (Évalués + CVs) → on cible le premier (Évalués).
    await screen.findByText('Tarification pour Montréal');
    const plusFiveButtons = screen.getAllByRole('button', { name: '+5' });
    await user.click(plusFiveButtons[0]);

    // Le bouton de confirmation reflète le total (5 × 200 = 1000.00$) et s'active.
    const confirm = screen.getByRole('button', { name: /Ajouter au panier \(1000\.00\$\)/i });
    expect(confirm).toBeEnabled();

    await user.click(confirm);

    await waitFor(() =>
      expect(addItem).toHaveBeenCalledWith('tok-abc', {
        city: 'Montréal',
        province: 'QC',
        type: 'EVALUATED',
        quantity: 5,
        notes: '',
      })
    );
    // Après un ajout réussi, le dialog se ferme (handleClose → onClose).
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it('appelle onClose au clic sur Annuler sans ajouter d\'article', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <CitySelectDialog open onClose={onClose} city="Montréal" province="QC" />
    );

    await screen.findByText('Tarification pour Montréal');
    await user.click(screen.getByRole('button', { name: 'Annuler' }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(addItem).not.toHaveBeenCalled();
  });

  it('ne rend aucun contenu quand open vaut false', () => {
    renderWithProviders(
      <CitySelectDialog open={false} onClose={onClose} city="Montréal" province="QC" />
    );

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByText('Montréal, QC')).not.toBeInTheDocument();
    // Fermé → pas de chargement de données déclenché.
    expect(getCityPricing).not.toHaveBeenCalled();
  });
});
