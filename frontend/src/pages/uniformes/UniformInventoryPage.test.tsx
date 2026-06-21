import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderWithProviders, screen, within, userEvent } from '@/test/renderWithProviders';
import { useAuthStore } from '@/store/authStore';
import { resetStores } from '@/test/resetStores';
import { makeUser } from '@/test/factories';

// Le dialog de correction de stock est lourd (3 onglets, mutations) et hors-sujet
// pour la page : on le neutralise pour isoler le comportement de l'inventaire.
vi.mock('./components/StockQuickFixDialog', () => ({ default: () => null }));

// La page lit/écrit les données via ce service (TanStack Query). On le mocke pour
// piloter chargement / données / vide sans réseau réel.
vi.mock('@/services/uniform.service', () => ({
  uniformService: {
    reportStock: vi.fn(),
    listMovements: vi.fn(),
    exportInventoryXlsx: vi.fn(),
    labelsSheet: vi.fn(),
    transfer: vi.fn(),
    reorderItems: vi.fn(),
  },
}));

import { uniformService } from '@/services/uniform.service';
import UniformInventoryPage from './UniformInventoryPage';

const reportStock = vi.mocked(uniformService.reportStock);
const listMovements = vi.mocked(uniformService.listMovements);

// --- Factories de lignes de stock (forme renvoyée par reportStock().data.rows) ---
type StockRow = Record<string, unknown>;

function makeRow(over: Partial<StockRow> = {}): StockRow {
  return {
    variantId: 'v-1',
    itemId: 'item-1',
    itemName: 'Chemise grise',
    division: 'SECURITE',
    type: 'TOP',
    size: 'M',
    isOneSize: false,
    emplacement: 'A1',
    replacementCost: 25,
    quantityOnHand: 12,
    reorderThreshold: 4,
    lowStock: false,
    backOffice: 8,
    frontOffice: 4,
    value: 300,
    sortOrder: 0,
    ...over,
  };
}

function makeStock(rows: StockRow[]) {
  return {
    data: {
      rows,
      totals: {
        totalUnits: rows.reduce((s, r) => s + (r.quantityOnHand as number), 0),
        totalValue: 1234,
        totalBackOffice: 100,
        totalFrontOffice: 50,
      },
    },
  };
}

function makeMovements(items: Record<string, unknown>[] = []) {
  // cast : forme suffisante pour mockResolvedValue(listMovements) sans réimporter le type complet
  return { data: items, pagination: { total: items.length } } as never;
}

// MAGASIN = lecture seule ; ADMIN = écriture. Réglé par test selon le besoin.
function seedAuth(role = 'ADMIN'): void {
  useAuthStore.getState().setAuth(makeUser({ role: role as never }), 'tok', 'refresh');
}

describe('UniformInventoryPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    seedAuth('ADMIN');
    listMovements.mockResolvedValue(makeMovements());
  });

  afterEach(() => resetStores());

  it("affiche l'en-tête et le fil d'Ariane de la page", async () => {
    reportStock.mockResolvedValue(makeStock([]));
    renderWithProviders(<UniformInventoryPage />);

    expect(screen.getByText('Uniformes / Inventaire')).toBeInTheDocument();
    // Le titre est un Typography stylé (pas un vrai <h*>) → on cible le texte.
    expect(screen.getByText('Inventaire')).toBeInTheDocument();
    // Onglets de la page.
    expect(screen.getByRole('tab', { name: 'Stock' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Mouvements' })).toBeInTheDocument();

    // Laisse les queries se résoudre (évite un warning act() en fin de test).
    await screen.findByText(/aucun morceau ne correspond/i);
  });

  it('charge puis affiche les KPI et la heatmap des morceaux', async () => {
    reportStock.mockResolvedValue(
      makeStock([
        makeRow(),
        makeRow({ variantId: 'v-2', size: 'L', quantityOnHand: 3, lowStock: true }),
      ])
    );
    renderWithProviders(<UniformInventoryPage />);

    // Le nom du morceau apparaît dans le tableau heatmap une fois chargé.
    expect(await screen.findByText('Hauts — chemises, polos, chandails')).toBeInTheDocument();
    expect(screen.getAllByText('Chemise grise').length).toBeGreaterThan(0);

    // KPI : libellés + valeur formatée (variantes suivies = 2 lignes).
    expect(screen.getByText('Unités en stock')).toBeInTheDocument();
    expect(screen.getByText('Variantes suivies')).toBeInTheDocument();
    expect(screen.getByText('Valeur totale')).toBeInTheDocument();
  });

  it("affiche l'état vide quand aucun morceau ne correspond", async () => {
    reportStock.mockResolvedValue(makeStock([]));
    renderWithProviders(<UniformInventoryPage />);

    expect(
      await screen.findByText(/aucun morceau ne correspond à ces filtres/i)
    ).toBeInTheDocument();
    // Aucun tableau heatmap n'est rendu sans données.
    expect(screen.queryByText('Hauts — chemises, polos, chandails')).not.toBeInTheDocument();
  });

  it('met en avant le bloc « Action requise » pour les ruptures et stocks bas', async () => {
    reportStock.mockResolvedValue(
      makeStock([
        makeRow({ variantId: 'v-out', size: 'S', quantityOnHand: 0, lowStock: true }),
        makeRow({ variantId: 'v-low', size: 'M', quantityOnHand: 2, lowStock: true }),
      ])
    );
    renderWithProviders(<UniformInventoryPage />);

    expect(await screen.findByText('Action requise')).toBeInTheDocument();
    expect(screen.getByText('2 variantes')).toBeInTheDocument();
    // KPI de rupture reflète la ligne à 0.
    expect(screen.getByText('Rupture')).toBeInTheDocument();
  });

  it('masque les boutons d\'écriture pour un rôle en lecture seule (MAGASIN)', async () => {
    seedAuth('MAGASIN');
    reportStock.mockResolvedValue(makeStock([makeRow()]));
    renderWithProviders(<UniformInventoryPage />);

    await screen.findByText('Hauts — chemises, polos, chandails');

    // Lecture seule : ni Transférer ni Étiquettes QR ; mais l'export reste offert.
    expect(screen.queryByRole('button', { name: /transférer/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /étiquettes qr/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /exporter excel/i })).toBeInTheDocument();
  });

  it('bascule sur l\'onglet Mouvements et charge la liste des mouvements', async () => {
    const user = userEvent.setup();
    reportStock.mockResolvedValue(makeStock([makeRow()]));
    listMovements.mockResolvedValue(
      makeMovements([
        {
          id: 'm-1',
          type: 'TRANSFER',
          quantity: -3,
          location: 'BACK_OFFICE',
          reason: 'Réassort comptoir',
          createdAt: '2026-06-19T10:00:00.000Z',
          variant: { item: { name: 'Chemise grise' }, size: 'M' },
        },
      ])
    );
    renderWithProviders(<UniformInventoryPage />);

    await user.click(screen.getByRole('tab', { name: 'Mouvements' }));

    // La ligne de mouvement apparaît avec le type traduit + la raison.
    expect(await screen.findByText('Réassort comptoir')).toBeInTheDocument();
    expect(screen.getByText('Transfert')).toBeInTheDocument();
    expect(listMovements).toHaveBeenCalled();
  });
});
