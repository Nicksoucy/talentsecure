import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderWithProviders, screen, within, userEvent } from '@/test/renderWithProviders';
import { useAuthStore } from '@/store/authStore';
import { resetStores } from '@/test/resetStores';
import { makeUser } from '@/test/factories';
import type { UniformItem, UniformDivision } from '@/types/uniform';

// Enfants lourds (scanner code-barres + caméra, pad de signature canvas, gros
// dialog de correction de stock) : hors-sujet pour la page → neutralisés.
vi.mock('./components/BarcodeScannerInput', () => ({ default: () => null }));
vi.mock('./components/SignaturePad', () => ({ default: () => null }));
vi.mock('./components/StockQuickFixDialog', () => ({ default: () => null }));

// La page lit/écrit via ces deux services (TanStack Query) ; on les mocke pour
// piloter chargement / données / vide sans réseau réel.
vi.mock('@/services/uniform.service', () => ({
  uniformService: {
    listItems: vi.fn(),
    getIssuance: vi.fn(),
    getByBarcode: vi.fn(),
    prepareDraftIssuance: vi.fn(),
    updateIssuance: vi.fn(),
    createIssuance: vi.fn(),
    finalizeIssuance: vi.fn(),
    sendIssuanceSms: vi.fn(),
    counterSignIssuance: vi.fn(),
    uploadIssuancePdf: vi.fn(),
  },
}));
vi.mock('@/services/employee.service', () => ({
  employeeService: {
    getEmployees: vi.fn(),
    getEmployeeById: vi.fn(),
  },
}));
// Évite de toucher au vrai QueryClient lors des invalidations.
vi.mock('@/utils/uniformCache', () => ({ invalidateUniformCaches: vi.fn() }));

import { uniformService } from '@/services/uniform.service';
import { employeeService } from '@/services/employee.service';
import UniformIssuanceWizardPage from './UniformIssuanceWizardPage';

const listItems = vi.mocked(uniformService.listItems);
const getEmployees = vi.mocked(employeeService.getEmployees);

/** Article catalogue type « uniforme » avec une variante stockée. */
function makeItem(overrides: Partial<UniformItem> = {}): UniformItem {
  return {
    id: 'it-1',
    division: 'SECURITE' as UniformDivision,
    type: 'UNIFORME',
    name: 'Chemise tactique',
    isOneSize: false,
    defaultReplacementCost: 45,
    sortOrder: 0,
    isActive: true,
    variants: [
      {
        id: 'var-1',
        itemId: 'it-1',
        size: 'M',
        barcode: 'BC-M-001',
        replacementCost: 45,
        quantityOnHand: 5,
        isActive: true,
        stockByLocation: [
          { id: 's1', variantId: 'var-1', location: 'FRONT_OFFICE', quantityOnHand: 3 },
          { id: 's2', variantId: 'var-1', location: 'BACK_OFFICE', quantityOnHand: 2 },
        ],
      },
    ],
    ...overrides,
  };
}

/** Article sans aucun stock (front + back = 0) pour l'état « source vide ». */
function makeEmptyItem(): UniformItem {
  return makeItem({
    id: 'it-empty',
    name: 'Casquette épuisée',
    isOneSize: true,
    variants: [
      {
        id: 'var-empty',
        itemId: 'it-empty',
        size: 'Unique',
        barcode: 'BC-E-001',
        replacementCost: 12,
        quantityOnHand: 0,
        isActive: true,
        stockByLocation: [
          { id: 'e1', variantId: 'var-empty', location: 'FRONT_OFFICE', quantityOnHand: 0 },
          { id: 'e2', variantId: 'var-empty', location: 'BACK_OFFICE', quantityOnHand: 0 },
        ],
      },
    ],
  });
}

function seedAuth(role: 'ADMIN' | 'MAGASIN' | 'RH_RECRUITER' = 'ADMIN'): void {
  useAuthStore.getState().setAuth(makeUser({ role }), 'fake-token', 'fake-refresh');
}

describe('UniformIssuanceWizardPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    seedAuth('ADMIN');
    getEmployees.mockResolvedValue({
      data: [],
      pagination: { total: 0, page: 1, limit: 15, totalPages: 0 },
    });
    listItems.mockResolvedValue({ data: [makeItem()] });
  });

  afterEach(() => resetStores());

  it("bloque l'accès quand le profil n'a pas le droit de préparer une remise", () => {
    // CANDIDAT/role inconnu → canPrepareUniformDraft = false.
    useAuthStore
      .getState()
      .setAuth(makeUser({ role: 'CANDIDAT' as never }), 'fake-token', 'fake-refresh');

    renderWithProviders(<UniformIssuanceWizardPage />);

    expect(
      screen.getByText(/accès en lecture seule — la remise d'uniformes n'est pas disponible/i)
    ).toBeInTheDocument();
  });

  it("affiche l'en-tête « Nouvelle remise » et charge le catalogue", async () => {
    renderWithProviders(<UniformIssuanceWizardPage />);

    expect(
      screen.getByRole('heading', { name: /nouvelle remise d'uniforme/i })
    ).toBeInTheDocument();

    // Après résolution de la query catalogue, l'article mocké apparaît.
    expect(await screen.findByText('Chemise tactique')).toBeInTheDocument();
    expect(listItems).toHaveBeenCalledWith({ division: 'SECURITE' });

    // En-têtes de la grille des pièces (desktop).
    expect(screen.getByRole('columnheader', { name: /pièce/i })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: /quantité/i })).toBeInTheDocument();
  });

  it('avertit quand aucun stock n\'est disponible pour la source par défaut', async () => {
    listItems.mockResolvedValue({ data: [makeEmptyItem()] });
    renderWithProviders(<UniformIssuanceWizardPage />);

    expect(await screen.findByText('Casquette épuisée')).toBeInTheDocument();
    // Bandeau d'alerte « aucun stock disponible (front et back) ».
    expect(
      await screen.findByText(/aucun stock disponible \(front et back\)/i)
    ).toBeInTheDocument();
  });

  it('filtre la grille des articles via la recherche par nom', async () => {
    listItems.mockResolvedValue({
      data: [makeItem(), makeItem({ id: 'it-2', name: 'Pantalon cargo' })],
    });
    const user = userEvent.setup();
    renderWithProviders(<UniformIssuanceWizardPage />);

    // Les deux articles sont rendus au départ.
    expect(await screen.findByText('Chemise tactique')).toBeInTheDocument();
    expect(screen.getByText('Pantalon cargo')).toBeInTheDocument();

    await user.type(screen.getByPlaceholderText(/rechercher un article par nom/i), 'cargo');

    // Seul l'article correspondant subsiste (recherche insensible aux accents/casse).
    expect(screen.getByText('Pantalon cargo')).toBeInTheDocument();
    expect(screen.queryByText('Chemise tactique')).not.toBeInTheDocument();
  });

  it('recharge le catalogue avec la division choisie', async () => {
    const user = userEvent.setup();
    renderWithProviders(<UniformIssuanceWizardPage />);

    await screen.findByText('Chemise tactique');
    expect(listItems).toHaveBeenLastCalledWith({ division: 'SECURITE' });

    // Le Select « Division » (combobox MUI) bascule sur Signalisation.
    const divisionSelect = screen.getByRole('combobox', { name: /division/i });
    await user.click(divisionSelect);
    await user.click(await screen.findByRole('option', { name: /signalisation/i }));

    // La query catalogue est relancée avec la nouvelle division.
    expect(listItems).toHaveBeenLastCalledWith({ division: 'SIGNALISATION' });
  });

  it("affiche le total du prêt et le compteur de lignes après ajout d'une quantité", async () => {
    const user = userEvent.setup();
    renderWithProviders(<UniformIssuanceWizardPage />);

    const row = (await screen.findByText('Chemise tactique')).closest('tr') as HTMLElement;
    expect(row).not.toBeNull();

    // Le stepper « + » incrémente la quantité de la ligne (cible la 1re variante stockée).
    const addBtn = within(row).getAllByRole('button')[1]; // [moins, plus]
    await user.click(addBtn);

    // Le total du prêt reflète le coût unitaire (45 $) de l'article ajouté.
    expect(await screen.findByText(/coût total du prêt : \$ 45\.00/i)).toBeInTheDocument();
    expect(screen.getByText('1 ligne(s)')).toBeInTheDocument();
  });
});
