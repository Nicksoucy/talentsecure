import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderWithProviders, screen, within, userEvent } from '@/test/renderWithProviders';

// La page récupère ses données via le service uniformes (TanStack Query, une
// query par onglet avec `enabled: tab === N`). On mocke le service pour piloter
// chargement / données / vide sans réseau réel et garder le test centré sur le
// comportement de la page (onglets, tableaux, états vides).
vi.mock('@/services/uniform.service', () => ({
  uniformService: {
    reportStock: vi.fn(),
    reportOverdue: vi.fn(),
    reportLosses: vi.fn(),
  },
}));

import { uniformService } from '@/services/uniform.service';
import UniformReportsPage from './UniformReportsPage';

const reportStock = vi.mocked(uniformService.reportStock);
const reportOverdue = vi.mocked(uniformService.reportOverdue);
const reportLosses = vi.mocked(uniformService.reportLosses);

function makeStock() {
  return {
    data: {
      rows: [
        {
          variantId: 'v1',
          itemName: 'Chandail polo',
          division: 'SECURITE',
          size: 'M',
          emplacement: 'Casier A',
          quantityOnHand: 12,
          value: 240,
          lowStock: false,
        },
        {
          variantId: 'v2',
          itemName: 'Veste réfléchissante',
          division: 'SIGNALISATION',
          size: 'L',
          emplacement: null,
          quantityOnHand: 2,
          value: 90,
          lowStock: true,
        },
      ],
      totals: { totalUnits: 14, totalValue: 330 },
    },
  };
}

function makeOverdue() {
  return {
    data: [
      {
        issuanceId: 'i1',
        employeeId: 'e1',
        employeeName: 'Marc Tremblay',
        division: 'SECURITE',
        dueReturnAt: '2026-06-01T00:00:00.000Z',
        itemsCount: 3,
        totalLoanCost: 150,
      },
    ],
  };
}

function makeLosses() {
  return {
    data: {
      rows: [
        { employeeId: 'e2', employeeName: 'Julie Gagnon', units: 4, cost: 200 },
      ],
      totals: { totalUnits: 4, totalCost: 200 },
    },
  };
}

describe('UniformReportsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    reportStock.mockResolvedValue(makeStock());
    reportOverdue.mockResolvedValue(makeOverdue());
    reportLosses.mockResolvedValue(makeLosses());
  });

  it("affiche l'en-tête et les trois onglets de rapports", async () => {
    renderWithProviders(<UniformReportsPage />);

    expect(
      screen.getByRole('heading', { name: /rapports — uniformes/i })
    ).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Stock' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Retours en retard' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Pertes / dommages' })).toBeInTheDocument();

    // Laisse la query de l'onglet par défaut se résoudre (évite un warning act()).
    await screen.findByText('Chandail polo');
  });

  it("charge puis affiche le rapport de stock (totaux + lignes) par défaut", async () => {
    renderWithProviders(<UniformReportsPage />);

    // Lignes du tableau après résolution de la query Stock.
    expect(await screen.findByText('Chandail polo')).toBeInTheDocument();
    expect(screen.getByText('Veste réfléchissante')).toBeInTheDocument();

    // Les divisions sont traduites en français.
    expect(screen.getByText('Signalisation')).toBeInTheDocument();
    expect(screen.getByText('Sécurité')).toBeInTheDocument();

    // Chips de totaux + valeur formatée en argent.
    expect(screen.getByText('Unités : 14')).toBeInTheDocument();
    expect(screen.getByText('Valeur : $ 330.00')).toBeInTheDocument();

    // Le stock bas est signalé par un chip « bas ».
    expect(screen.getByText('bas')).toBeInTheDocument();

    // Seule la query de l'onglet actif est déclenchée (enabled: tab === 0).
    expect(reportStock).toHaveBeenCalledTimes(1);
    expect(reportOverdue).not.toHaveBeenCalled();
    expect(reportLosses).not.toHaveBeenCalled();
  });

  it('bascule sur l\'onglet « Retours en retard » et charge ses données', async () => {
    const user = userEvent.setup();
    renderWithProviders(<UniformReportsPage />);
    await screen.findByText('Chandail polo');

    await user.click(screen.getByRole('tab', { name: 'Retours en retard' }));

    // La query de l'onglet 1 se déclenche seulement au changement d'onglet.
    expect(await screen.findByText('Marc Tremblay')).toBeInTheDocument();
    expect(reportOverdue).toHaveBeenCalledTimes(1);

    // L'agent est rendu comme lien vers sa fiche.
    const link = screen.getByRole('link', { name: 'Marc Tremblay' });
    expect(link).toHaveAttribute('href', '/employees/e1');
  });

  it('affiche le message d\'état vide quand aucun retour n\'est en retard', async () => {
    reportOverdue.mockResolvedValue({ data: [] });
    const user = userEvent.setup();
    renderWithProviders(<UniformReportsPage />);
    await screen.findByText('Chandail polo');

    await user.click(screen.getByRole('tab', { name: 'Retours en retard' }));

    expect(await screen.findByText(/aucun retour en retard/i)).toBeInTheDocument();
  });

  it('bascule sur l\'onglet « Pertes / dommages » et affiche totaux + lignes', async () => {
    const user = userEvent.setup();
    renderWithProviders(<UniformReportsPage />);
    await screen.findByText('Chandail polo');

    await user.click(screen.getByRole('tab', { name: 'Pertes / dommages' }));

    expect(await screen.findByText('Julie Gagnon')).toBeInTheDocument();
    expect(screen.getByText('Unités perdues/endommagées : 4')).toBeInTheDocument();
    expect(screen.getByText('Coût total : $ 200.00')).toBeInTheDocument();
    expect(reportLosses).toHaveBeenCalledTimes(1);

    // La ligne expose un coût formaté et un lien vers la fiche de l'agent.
    const table = screen.getByRole('table');
    expect(within(table).getByText('$ 200.00')).toBeInTheDocument();
  });
});
