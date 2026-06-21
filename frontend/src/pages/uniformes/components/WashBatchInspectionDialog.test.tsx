import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderWithProviders, screen, waitFor, userEvent } from '@/test/renderWithProviders';

vi.mock('@/services/uniform-wash-batch.service', () => ({
  washBatchService: { inspect: vi.fn() },
}));

import WashBatchInspectionDialog from './WashBatchInspectionDialog';
import { washBatchService, type WashBatch } from '@/services/uniform-wash-batch.service';

const svc = washBatchService as unknown as { inspect: ReturnType<typeof vi.fn> };

function makeItem(id: string, name: string, size: string, postWashCondition: WashBatch['items'][number]['postWashCondition'] = null) {
  return {
    id,
    batchId: 'batch-1',
    variantId: `variant-${id}`,
    quantity: 1,
    returnLineId: null,
    postWashCondition,
    notes: null,
    createdAt: '2026-06-21T00:00:00.000Z',
    updatedAt: '2026-06-21T00:00:00.000Z',
    variant: {
      id: `variant-${id}`,
      size,
      barcode: `BC-${id}`,
      item: { id: `item-${id}`, name, division: 'SECURITE', type: 'CHEMISE' },
    },
  };
}

function makeBatch(overrides: Partial<WashBatch> = {}): WashBatch {
  return {
    id: 'abcdef1234567890',
    status: 'RETURNED_FROM_LAUNDRY',
    vendor: 'Buanderie X',
    notes: null,
    sentAt: null,
    returnedAt: null,
    inspectedAt: null,
    createdById: null,
    inspectedById: null,
    createdAt: '2026-06-21T00:00:00.000Z',
    updatedAt: '2026-06-21T00:00:00.000Z',
    items: [makeItem('p1', 'Chemise', 'M'), makeItem('p2', 'Pantalon', 'L')],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('WashBatchInspectionDialog', () => {
  it('affiche le titre avec id court + nombre de pièces et une carte par pièce', () => {
    renderWithProviders(
      <WashBatchInspectionDialog batch={makeBatch()} open onClose={vi.fn()} onSuccess={vi.fn()} />
    );

    expect(screen.getByText(/Inspection du lot #abcdef12/)).toBeInTheDocument();
    expect(screen.getByText(/2 pièce\(s\)/)).toBeInTheDocument();
    expect(screen.getByText(/Chemise — taille M/)).toBeInTheDocument();
    expect(screen.getByText(/Pantalon — taille L/)).toBeInTheDocument();
  });

  it('le bouton Finaliser est désactivé tant que des pièces restent à décider', () => {
    renderWithProviders(
      <WashBatchInspectionDialog batch={makeBatch()} open onClose={vi.fn()} onSuccess={vi.fn()} />
    );

    const finalize = screen.getByRole('button', { name: /Finaliser l'inspection/i });
    expect(finalize).toBeDisabled();
  });

  it('"Tout marquer Bonne" inspecte toutes les pièces et active Finaliser', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <WashBatchInspectionDialog batch={makeBatch()} open onClose={vi.fn()} onSuccess={vi.fn()} />
    );

    await user.click(screen.getByRole('button', { name: /Tout marquer Bonne/i }));

    const finalize = screen.getByRole('button', { name: /Finaliser l'inspection/i });
    await waitFor(() => expect(finalize).toBeEnabled());
    // Le bouton "Tout marquer Bonne" se désactive (plus rien à décider).
    expect(screen.getByRole('button', { name: /Tout marquer Bonne/i })).toBeDisabled();
  });

  it('finalise : appelle washBatchService.inspect avec les conditions puis onSuccess', async () => {
    const user = userEvent.setup();
    svc.inspect.mockResolvedValue({ data: makeBatch({ status: 'INSPECTED' }) });
    const onSuccess = vi.fn();
    renderWithProviders(
      <WashBatchInspectionDialog batch={makeBatch()} open onClose={vi.fn()} onSuccess={onSuccess} />
    );

    await user.click(screen.getByRole('button', { name: /Tout marquer Bonne/i }));
    await user.click(screen.getByRole('button', { name: /Finaliser l'inspection/i }));

    await waitFor(() => expect(svc.inspect).toHaveBeenCalledTimes(1));
    expect(svc.inspect).toHaveBeenCalledWith('abcdef1234567890', [
      { itemId: 'p1', postWashCondition: 'GOOD' },
      { itemId: 'p2', postWashCondition: 'GOOD' },
    ]);
    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
  });

  it('Annuler déclenche onClose', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    renderWithProviders(
      <WashBatchInspectionDialog batch={makeBatch()} open onClose={onClose} onSuccess={vi.fn()} />
    );

    await user.click(screen.getByRole('button', { name: /^Annuler$/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('conditions pré-remplies (postWashCondition) → Finaliser actif d\'emblée', () => {
    const batch = makeBatch({
      items: [makeItem('p1', 'Chemise', 'M', 'GOOD'), makeItem('p2', 'Pantalon', 'L', 'DAMAGED')],
    });
    renderWithProviders(
      <WashBatchInspectionDialog batch={batch} open onClose={vi.fn()} onSuccess={vi.fn()} />
    );

    expect(screen.getByRole('button', { name: /Finaliser l'inspection/i })).toBeEnabled();
  });
});
