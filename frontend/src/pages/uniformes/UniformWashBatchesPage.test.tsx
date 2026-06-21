import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderWithProviders, screen, within, userEvent, waitFor } from '@/test/renderWithProviders';
import { useAuthStore } from '@/store/authStore';
import { resetStores } from '@/test/resetStores';
import { makeUser } from '@/test/factories';
import type { WashBatch } from '@/services/uniform-wash-batch.service';

// La page récupère les lots via le service (TanStack Query). On le mocke pour
// piloter chargement / données / vide sans réseau réel.
vi.mock('@/services/uniform-wash-batch.service', () => ({
  washBatchService: {
    list: vi.fn(),
    get: vi.fn(),
    send: vi.fn(),
    markReturned: vi.fn(),
    inspectAllGood: vi.fn(),
    cancel: vi.fn(),
  },
}));

// Le dialog d'inspection détaillée est lourd (cartes par pièce, toggles) et
// hors-sujet pour la page : on le neutralise.
vi.mock('./components/WashBatchInspectionDialog', () => {
  const Stub = () => null;
  Stub.displayName = 'WashBatchInspectionDialogStub';
  return { default: Stub };
});

import { washBatchService } from '@/services/uniform-wash-batch.service';
import UniformWashBatchesPage from './UniformWashBatchesPage';

const list = vi.mocked(washBatchService.list);
const get = vi.mocked(washBatchService.get);
const send = vi.mocked(washBatchService.send);

function makeBatch(overrides: Partial<WashBatch> = {}): WashBatch {
  return {
    id: 'batch-0001-aaaa-bbbb',
    status: 'CREATED',
    vendor: 'Buanderie Nettoie-Tout',
    notes: null,
    sentAt: null,
    returnedAt: null,
    inspectedAt: null,
    createdById: 'user-1',
    inspectedById: null,
    createdAt: '2026-06-15T10:00:00.000Z',
    updatedAt: '2026-06-15T10:00:00.000Z',
    items: [
      {
        id: 'item-1',
        batchId: 'batch-0001-aaaa-bbbb',
        variantId: 'variant-xyz-123',
        quantity: 1,
        returnLineId: null,
        postWashCondition: null,
        notes: null,
        createdAt: '2026-06-15T10:00:00.000Z',
        updatedAt: '2026-06-15T10:00:00.000Z',
        variant: {
          id: 'variant-xyz-123',
          size: 'L',
          barcode: '000111',
          item: { id: 'i1', name: 'Chemise bleue', division: 'GARDIENNAGE', type: 'TOP' },
        },
      },
    ],
    ...overrides,
  };
}

// usePerms lit le rôle depuis le store auth : ADMIN ⇒ canWriteUniforms = true,
// nécessaire pour voir les boutons d'action du dialog.
function seedAuth(role: 'ADMIN' | 'MAGASIN' = 'ADMIN'): void {
  useAuthStore.getState().setAuth(makeUser({ role }), 'tok', 'refresh');
}

describe('UniformWashBatchesPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    seedAuth();
  });

  afterEach(() => resetStores());

  it("affiche l'en-tête et les en-têtes du tableau", async () => {
    list.mockResolvedValue({ data: [] });
    renderWithProviders(<UniformWashBatchesPage />);

    expect(screen.getByRole('heading', { name: /lots de lavage/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /actifs/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /archives/i })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: /fournisseur/i })).toBeInTheDocument();

    // Laisse la query se résoudre pour éviter un warning act() en fin de test.
    await screen.findByText(/aucun lot actif/i);
  });

  it('charge puis affiche une ligne de lot', async () => {
    list.mockResolvedValue({ data: [makeBatch()] });
    renderWithProviders(<UniformWashBatchesPage />);

    // Données post-chargement : fournisseur, statut traduit, nb de pièces.
    expect(await screen.findByText('Buanderie Nettoie-Tout')).toBeInTheDocument();
    expect(screen.getByText('Créé')).toBeInTheDocument();
    // L'ID est tronqué à 8 caractères.
    expect(screen.getByText('batch-00')).toBeInTheDocument();
  });

  it("affiche l'état vide quand aucun lot actif", async () => {
    list.mockResolvedValue({ data: [] });
    renderWithProviders(<UniformWashBatchesPage />);

    expect(await screen.findByText(/aucun lot actif/i)).toBeInTheDocument();
  });

  it('bascule sur l\'onglet Archives et relance la requête sur les statuts archivés', async () => {
    const user = userEvent.setup();
    list.mockResolvedValue({ data: [] });
    renderWithProviders(<UniformWashBatchesPage />);

    await screen.findByText(/aucun lot actif/i);
    expect(list).toHaveBeenLastCalledWith({
      status: ['CREATED', 'SENT_TO_LAUNDRY', 'RETURNED_FROM_LAUNDRY'],
    });

    await user.click(screen.getByRole('tab', { name: /archives/i }));

    expect(await screen.findByText(/aucun lot archivé/i)).toBeInTheDocument();
    expect(list).toHaveBeenLastCalledWith({ status: ['INSPECTED', 'CANCELLED'] });
  });

  it('ouvre le dialog de détail via le bouton « Ouvrir »', async () => {
    const user = userEvent.setup();
    list.mockResolvedValue({ data: [makeBatch()] });
    get.mockResolvedValue({ data: makeBatch() });
    renderWithProviders(<UniformWashBatchesPage />);

    await screen.findByText('Buanderie Nettoie-Tout');
    await user.click(screen.getByRole('button', { name: /ouvrir/i }));

    // Le dialog charge le détail du lot et expose ses actions.
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/lot de lavage #batch-00/i)).toBeInTheDocument();
    expect(get).toHaveBeenCalledWith('batch-0001-aaaa-bbbb');
    expect(
      await within(dialog).findByRole('button', { name: /envoyer au lavage/i })
    ).toBeInTheDocument();
  });

  it('ouvre le sous-dialog d\'envoi et déclenche l\'envoi au lavage', async () => {
    const user = userEvent.setup();
    const batch = makeBatch();
    list.mockResolvedValue({ data: [batch] });
    get.mockResolvedValue({ data: batch });
    send.mockResolvedValue({ data: { ...batch, status: 'SENT_TO_LAUNDRY' } });
    renderWithProviders(<UniformWashBatchesPage />);

    await screen.findByText('Buanderie Nettoie-Tout');
    await user.click(screen.getByRole('button', { name: /ouvrir/i }));

    const dialog = await screen.findByRole('dialog');
    await user.click(await within(dialog).findByRole('button', { name: /envoyer au lavage/i }));

    // Le sous-dialog d'envoi apparaît avec son bouton de confirmation.
    const confirm = await screen.findByRole('button', { name: /^envoyer$/i });
    await user.click(confirm);

    // Attend que la mutation soit déclenchée (laisse aussi son onSuccess régler
    // l'état dans act, ce qui évite des avertissements act() de fin de test).
    await waitFor(() =>
      expect(send).toHaveBeenCalledWith('batch-0001-aaaa-bbbb', expect.any(Object))
    );
  });
});
