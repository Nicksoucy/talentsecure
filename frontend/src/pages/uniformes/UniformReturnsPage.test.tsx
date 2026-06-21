import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderWithProviders, screen, within, userEvent } from '@/test/renderWithProviders';
import { useAuthStore } from '@/store/authStore';
import { resetStores } from '@/test/resetStores';
import { makeUser } from '@/test/factories';
import type { UniformIssuance } from '@/types/uniform';

// Le pavé de signature embarque un <canvas> (react-signature-canvas) inutilisable
// sous jsdom et hors-sujet pour cette page : on le neutralise.
vi.mock('./components/SignaturePad', () => ({ default: () => null }));

// L'invalidation de cache touche tout le module Uniformes : sans intérêt ici, on
// la neutralise pour garder le test centré sur le comportement de la page.
vi.mock('@/utils/uniformCache', () => ({ invalidateUniformCaches: vi.fn() }));

// La couche données = les deux services (chacun adossé à TanStack Query / axios).
// On les mocke pour piloter chargement / données / vide sans toucher au réseau.
vi.mock('@/services/uniform.service', () => ({
  uniformService: {
    listIssuances: vi.fn(),
    getIssuance: vi.fn(),
    createReturn: vi.fn(),
    finalizeReturn: vi.fn(),
    sendReturnSms: vi.fn(),
    counterSignReturn: vi.fn(),
  },
}));
vi.mock('@/services/employee.service', () => ({
  employeeService: {
    getEmployees: vi.fn(),
    getEmployeeById: vi.fn(),
  },
}));

import { uniformService } from '@/services/uniform.service';
import { employeeService } from '@/services/employee.service';
import UniformReturnsPage from './UniformReturnsPage';

const listIssuances = vi.mocked(uniformService.listIssuances);
const getIssuance = vi.mocked(uniformService.getIssuance);
const getEmployees = vi.mocked(employeeService.getEmployees);
const getEmployeeById = vi.mocked(employeeService.getEmployeeById);

const EMPLOYEE = {
  id: 'emp-1',
  firstName: 'Marie',
  lastName: 'Lavoie',
};

// Remise active (ISSUED) avec 2 pièces détenues, sans aucun retour préalable.
function makeIssuance(over: Partial<UniformIssuance> = {}): UniformIssuance {
  return {
    id: 'iss-1',
    employeeId: 'emp-1',
    division: 'SECURITE',
    status: 'ISSUED',
    issuedAt: '2026-06-01T00:00:00.000Z',
    totalLoanCost: 120,
    signatureStatus: 'SIGNED',
    itemsCount: 2,
    createdAt: '2026-06-01T00:00:00.000Z',
    lines: [
      {
        id: 'line-1',
        variantId: 'var-1',
        quantity: 2,
        unitCostSnapshot: 60,
        variant: {
          id: 'var-1',
          size: 'M',
          item: { name: 'Veste haute visibilité' },
        },
      },
    ],
    ...over,
  } as unknown as UniformIssuance;
}

function seedAuth(role = 'MAGASIN_GESTION'): void {
  useAuthStore
    .getState()
    .setAuth(makeUser({ role: role as never }), 'fake-access-token', 'fake-refresh-token');
}

describe('UniformReturnsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    seedAuth();
    // Valeurs par défaut « chargées » ; chaque test surcharge au besoin.
    getEmployees.mockResolvedValue({
      data: [EMPLOYEE],
      pagination: { total: 1, page: 1, limit: 15, totalPages: 1 },
    } as never);
    getEmployeeById.mockResolvedValue({ data: EMPLOYEE } as never);
    listIssuances.mockResolvedValue({ data: [makeIssuance()], pagination: {} } as never);
    getIssuance.mockResolvedValue({ data: makeIssuance() } as never);
  });

  afterEach(() => resetStores());

  it("affiche l'en-tête et le sélecteur d'agent", () => {
    renderWithProviders(<UniformReturnsPage />);

    expect(
      screen.getByRole('heading', { name: /retour d'uniforme/i })
    ).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: /agent/i })).toBeInTheDocument();
  });

  it("bloque l'accès en lecture seule sans permission d'écriture", () => {
    seedAuth('MAGASIN'); // magasin = lecture seule
    renderWithProviders(<UniformReturnsPage />);

    expect(
      screen.getByText(/accès en lecture seule/i)
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: /retour d'uniforme/i })
    ).not.toBeInTheDocument();
  });

  it("pré-charge l'agent depuis le paramètre d'URL employeeId", async () => {
    renderWithProviders(<UniformReturnsPage />, {
      route: '/uniformes/retours?employeeId=emp-1',
    });

    // L'effet d'init lit ?employeeId → getEmployeeById, puis charge ses remises.
    await screen.findByDisplayValue('Marie Lavoie');
    expect(getEmployeeById).toHaveBeenCalledWith('emp-1');
    expect(listIssuances).toHaveBeenCalledWith(
      expect.objectContaining({ employeeId: 'emp-1' })
    );
  });

  it('charge les pièces de la remise sélectionnée et les affiche en cartes', async () => {
    const user = userEvent.setup();
    renderWithProviders(<UniformReturnsPage />, {
      route: '/uniformes/retours?employeeId=emp-1',
    });

    // Attendre que l'agent (et ses remises actives) soit chargé.
    await screen.findByDisplayValue('Marie Lavoie');

    // Ouvre le Select « Remise » et choisit la remise active.
    await user.click(screen.getByRole('combobox', { name: /remise/i }));
    await user.click(await screen.findByRole('option', { name: /sécurité/i }));

    // La ligne (qty=2) doit produire 2 cartes-pièces distinctes.
    expect(getIssuance).toHaveBeenCalledWith('iss-1');
    expect(await screen.findByText('Pièce 1/2')).toBeInTheDocument();
    expect(screen.getByText('Pièce 2/2')).toBeInTheDocument();
    expect(screen.getAllByText('Veste haute visibilité')).toHaveLength(2);
  });

  it("affiche l'état vide quand tout a déjà été retourné", async () => {
    const user = userEvent.setup();
    // La remise figure dans la liste, mais tout est déjà retourné côté détail.
    getIssuance.mockResolvedValue({
      data: makeIssuance({
        // @ts-expect-error forme libre côté page (any) — retour complet de la ligne
        returns: [
          { status: 'RETURNED', lines: [{ variantId: 'var-1', quantity: 2 }] },
        ],
      }),
    } as never);

    renderWithProviders(<UniformReturnsPage />, {
      route: '/uniformes/retours?employeeId=emp-1',
    });
    await screen.findByDisplayValue('Marie Lavoie');

    await user.click(screen.getByRole('combobox', { name: /remise/i }));
    await user.click(await screen.findByRole('option', { name: /sécurité/i }));

    expect(
      await screen.findByText(/aucune pièce à retourner pour cette remise/i)
    ).toBeInTheDocument();
    expect(screen.queryByText('Pièce 1/2')).not.toBeInTheDocument();
  });

  it('« Tout marquer Bon » active le bouton de finalisation', async () => {
    const user = userEvent.setup();
    renderWithProviders(<UniformReturnsPage />, {
      route: '/uniformes/retours?employeeId=emp-1',
    });
    await screen.findByDisplayValue('Marie Lavoie');

    await user.click(screen.getByRole('combobox', { name: /remise/i }));
    await user.click(await screen.findByRole('option', { name: /sécurité/i }));
    await screen.findByText('Pièce 1/2');

    // Tant que des pièces sont « à décider », la finalisation est désactivée.
    const finalize = screen.getByRole('button', { name: /finaliser le retour/i });
    expect(finalize).toBeDisabled();

    await user.click(screen.getByRole('button', { name: /tout marquer bon/i }));

    // Toutes les pièces taguées → le bouton de finalisation s'active.
    expect(finalize).toBeEnabled();
  });
});
