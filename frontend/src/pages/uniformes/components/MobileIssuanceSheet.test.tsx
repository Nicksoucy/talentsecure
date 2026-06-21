import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderWithProviders, screen, within, userEvent, waitFor } from '@/test/renderWithProviders';

// --- Mocks des enfants lourds (caméra / scanner USB / canvas de signature) ---
vi.mock('./CameraScanner', () => ({ default: () => null }));
vi.mock('./BarcodeScannerInput', () => ({ default: () => null }));
vi.mock('./SignaturePad', () => ({ default: () => null }));

// --- Mock du service réseau ---
vi.mock('@/services/uniform.service', () => ({
  uniformService: {
    listItems: vi.fn(),
    getByBarcode: vi.fn(),
    createIssuance: vi.fn(),
    finalizeIssuance: vi.fn(),
    getIssuance: vi.fn(),
    counterSignIssuance: vi.fn(),
    sendIssuanceSms: vi.fn(),
  },
}));

import MobileIssuanceSheet from './MobileIssuanceSheet';
import { uniformService } from '@/services/uniform.service';
import type { UniformItem } from '@/types/uniform';

const svc = uniformService as unknown as Record<string, ReturnType<typeof vi.fn>>;

// Catalogue minimal : une chemise « Sécurité » avec une variante en stock front/back.
const makeItems = (): { data: UniformItem[] } => ({
  data: [
    {
      id: 'item-1',
      division: 'SECURITE',
      type: 'UNIFORME',
      name: 'Chemise blanche',
      isOneSize: false,
      defaultReplacementCost: 25,
      sortOrder: 0,
      isActive: true,
      variants: [
        {
          id: 'var-1',
          itemId: 'item-1',
          size: 'M',
          barcode: 'BC-VAR-1',
          replacementCost: 25,
          quantityOnHand: 8,
          isActive: true,
          stockByLocation: [
            { id: 's1', variantId: 'var-1', location: 'FRONT_OFFICE', quantityOnHand: 5 },
            { id: 's2', variantId: 'var-1', location: 'BACK_OFFICE', quantityOnHand: 3 },
          ],
        },
      ],
    },
  ],
});

describe('MobileIssuanceSheet', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    svc.listItems.mockResolvedValue(makeItems());
  });

  it("ne monte pas le contenu du dialogue quand open=false", () => {
    renderWithProviders(
      <MobileIssuanceSheet open={false} onClose={vi.fn()} employeeId="emp-1" />
    );

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByText('Remettre des uniformes')).not.toBeInTheDocument();
  });

  it("affiche le titre de composition, l'état vide et désactive « Finaliser » sans ligne", () => {
    renderWithProviders(
      <MobileIssuanceSheet open onClose={vi.fn()} employeeId="emp-1" />
    );

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('Remettre des uniformes')).toBeInTheDocument();
    expect(within(dialog).getByText("Aucune pièce ajoutée pour l'instant.")).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Finaliser la remise' })).toBeDisabled();
  });

  it("appelle onClose au clic sur Annuler", async () => {
    const onClose = vi.fn();
    renderWithProviders(
      <MobileIssuanceSheet open onClose={onClose} employeeId="emp-1" />
    );

    await userEvent.click(screen.getByRole('button', { name: 'Annuler' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("ajoute une pièce via l'autocomplete : la carte apparaît avec le total et active « Finaliser »", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <MobileIssuanceSheet open onClose={vi.fn()} employeeId="emp-1" />
    );

    // L'autocomplete charge le catalogue (enabled: open).
    await waitFor(() => expect(svc.listItems).toHaveBeenCalled());

    const combo = screen.getByRole('combobox', { name: 'Ajouter une pièce (nom / taille)' });
    await user.click(combo);
    const option = await screen.findByText('Chemise blanche — M');
    await user.click(option);

    // La ligne est rendue en carte avec son emplacement par défaut (front) et le coût.
    expect(screen.getByText('Chemise blanche')).toBeInTheDocument();
    expect(screen.getByText('1 ligne(s)')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Finaliser la remise' })).toBeEnabled();
  });

  it("finalise la remise : crée + finalise + recharge, puis passe à l'étape signature", async () => {
    const user = userEvent.setup();
    svc.createIssuance.mockResolvedValue({ data: { id: 'iss-9', signToken: 'tok-9' } });
    svc.finalizeIssuance.mockResolvedValue({});
    svc.getIssuance.mockResolvedValue({ data: { id: 'iss-9', signToken: 'tok-9' } });

    renderWithProviders(
      <MobileIssuanceSheet open onClose={vi.fn()} employeeId="emp-42" />
    );

    await waitFor(() => expect(svc.listItems).toHaveBeenCalled());
    const combo = screen.getByRole('combobox', { name: 'Ajouter une pièce (nom / taille)' });
    await user.click(combo);
    await user.click(await screen.findByText('Chemise blanche — M'));

    await user.click(screen.getByRole('button', { name: 'Finaliser la remise' }));

    await waitFor(() => expect(svc.createIssuance).toHaveBeenCalledTimes(1));
    expect(svc.createIssuance).toHaveBeenCalledWith(
      expect.objectContaining({
        employeeId: 'emp-42',
        division: 'SECURITE',
        lines: [
          expect.objectContaining({ variantId: 'var-1', quantity: 1, sourceLocation: 'FRONT_OFFICE' }),
        ],
      })
    );
    expect(svc.finalizeIssuance).toHaveBeenCalledWith('iss-9');

    // L'écran bascule sur la signature (titre + alerte de l'employeur en premier).
    await waitFor(() =>
      expect(screen.getByText('Signature de la remise')).toBeInTheDocument()
    );
    expect(screen.getByText("1. Signature de l'employeur")).toBeInTheDocument();
  });

  it("retire une ligne via l'icône Supprimer et revient à l'état vide", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <MobileIssuanceSheet open onClose={vi.fn()} employeeId="emp-1" />
    );

    await waitFor(() => expect(svc.listItems).toHaveBeenCalled());
    const combo = screen.getByRole('combobox', { name: 'Ajouter une pièce (nom / taille)' });
    await user.click(combo);
    await user.click(await screen.findByText('Chemise blanche — M'));
    expect(screen.getByText('1 ligne(s)')).toBeInTheDocument();

    const deleteBtn = screen
      .getAllByRole('button')
      .find((b) => b.querySelector('[data-testid="DeleteIcon"]')) as HTMLElement;
    await user.click(deleteBtn);

    expect(screen.getByText("Aucune pièce ajoutée pour l'instant.")).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Finaliser la remise' })).toBeDisabled();
  });
});
