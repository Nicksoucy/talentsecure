import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderWithProviders, screen, waitFor, within, userEvent } from '@/test/renderWithProviders';
import { useAuthStore } from '@/store/authStore';
import { resetStores } from '@/test/resetStores';
import { makeUser } from '@/test/factories';

// La page lit/écrit les données via ce service (TanStack Query). On le mocke pour
// piloter chargement / données / vide sans réseau réel. Régression historique :
// un `useEffect` resynchronisait l'ordre local sur un tableau recréé à chaque
// rendu → boucle de rendu infinie au montage. Ces tests verrouillent un montage
// déterministe (doivent finir en quelques secondes, pas en timeout).
vi.mock('@/services/uniform.service', () => ({
  uniformService: {
    listItems: vi.fn(),
    reorderItems: vi.fn(),
    labelsSheet: vi.fn(),
    variantLabelPdf: vi.fn(),
  },
}));

import { uniformService } from '@/services/uniform.service';
import UniformsCataloguePage from './UniformsCataloguePage';

const listItems = vi.mocked(uniformService.listItems);

// --- Factory d'un morceau (forme renvoyée par listItems().data) ---
type Item = Record<string, unknown>;

function makeItem(over: Item = {}): Item {
  return {
    id: 'item-1',
    division: 'SECURITE',
    type: 'UNIFORME',
    name: 'Chemise noire',
    isOneSize: false,
    defaultReplacementCost: 30,
    variants: [
      {
        id: 'var-1',
        size: 'M',
        emplacement: 'B4',
        barcode: 'UNI-0001',
        replacementCost: 25,
        quantityOnHand: 12,
        stockByLocation: [
          { location: 'FRONT_OFFICE', quantityOnHand: 4 },
          { location: 'BACK_OFFICE', quantityOnHand: 8 },
        ],
      },
    ],
    ...over,
  };
}

function makeList(items: Item[]) {
  return { data: items } as never;
}

// ADMIN = écriture ; MAGASIN = lecture seule. Réglé par test selon le besoin.
function seedAuth(role = 'ADMIN'): void {
  useAuthStore.getState().setAuth(makeUser({ role: role as never }), 'tok', 'refresh');
}

describe('UniformsCataloguePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    seedAuth('ADMIN');
    listItems.mockResolvedValue(makeList([makeItem()]));
  });

  afterEach(() => resetStores());

  it("affiche l'en-tête et le bouton de création pour un rôle en écriture", async () => {
    renderWithProviders(<UniformsCataloguePage />);

    // Le titre est un Typography stylé (pas un vrai <h*>) → on cible le texte.
    expect(screen.getByText('Catalogue des uniformes')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /nouveau morceau/i })).toBeInTheDocument();
    // Filtres présents (division + recherche).
    expect(screen.getByLabelText('Division')).toBeInTheDocument();
    expect(screen.getByLabelText('Recherche')).toBeInTheDocument();

    // Laisse la query se résoudre (évite un warning act() en fin de test).
    await screen.findByText('Chemise noire');
  });

  it('charge puis affiche la carte du morceau avec ses totaux de stock', async () => {
    renderWithProviders(<UniformsCataloguePage />);

    // Le nom apparaît une fois la query résolue.
    expect(await screen.findByText('Chemise noire')).toBeInTheDocument();
    // Chips division / type.
    expect(screen.getByText('Sécurité')).toBeInTheDocument();
    expect(screen.getByText('Uniforme')).toBeInTheDocument();
    // Coût + nombre de grandeurs et totaux par emplacement.
    expect(screen.getByText(/\$ 30\.00 · 1 grandeur/)).toBeInTheDocument();
    expect(screen.getByText('Front 4')).toBeInTheDocument();
    expect(screen.getByText('Back 8')).toBeInTheDocument();
  });

  it("affiche l'état vide quand aucun morceau n'est retourné", async () => {
    listItems.mockResolvedValue(makeList([]));
    renderWithProviders(<UniformsCataloguePage />);

    expect(
      await screen.findByText(/aucun morceau\. lancez le seed ou créez-en un\./i)
    ).toBeInTheDocument();
    // Aucune carte rendue sans données.
    expect(screen.queryByText('Chemise noire')).not.toBeInTheDocument();
  });

  it("masque les actions d'écriture pour un rôle en lecture seule (MAGASIN)", async () => {
    seedAuth('MAGASIN');
    renderWithProviders(<UniformsCataloguePage />);

    await screen.findByText('Chemise noire');

    // Lecture seule : pas de création ni de bouton « Grandeurs » masqué, mais
    // surtout pas de création de morceau ni d'édition.
    expect(screen.queryByRole('button', { name: /nouveau morceau/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /renommer \/ modifier/i })).not.toBeInTheDocument();
    // La consultation reste possible (bouton Grandeurs visible pour tous).
    expect(screen.getByRole('button', { name: /grandeurs/i })).toBeInTheDocument();
  });

  it('relance la recherche avec le terme saisi', async () => {
    const user = userEvent.setup();
    renderWithProviders(<UniformsCataloguePage />);

    await screen.findByText('Chemise noire');

    await user.type(screen.getByLabelText('Recherche'), 'noir');

    // La query est re-déclenchée avec le terme (queryKey inclut `search`).
    await waitFor(() =>
      expect(listItems).toHaveBeenCalledWith(expect.objectContaining({ search: 'noir' }))
    );
  });

  it('ouvre le dialogue des grandeurs avec le détail des variantes', async () => {
    const user = userEvent.setup();
    renderWithProviders(<UniformsCataloguePage />);

    await screen.findByText('Chemise noire');
    await user.click(screen.getByRole('button', { name: /grandeurs/i }));

    // Le dialogue ouvre un tableau listant le code-barres, l'emplacement et la grandeur.
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('UNI-0001')).toBeInTheDocument();
    expect(within(dialog).getByText('B4')).toBeInTheDocument();
    // En-têtes du tableau de grandeurs.
    expect(within(dialog).getByText('Code-barres')).toBeInTheDocument();
    expect(within(dialog).getByText('Emplacement')).toBeInTheDocument();
  });
});
