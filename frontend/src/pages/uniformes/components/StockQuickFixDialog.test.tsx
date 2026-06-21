import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderWithProviders, screen, within, userEvent, waitFor } from '@/test/renderWithProviders';

vi.mock('@/services/uniform.service', () => ({
  uniformService: {
    transfer: vi.fn(),
    adjust: vi.fn(),
    replenish: vi.fn(),
  },
}));

const invalidateUniformCaches = vi.fn();
vi.mock('@/utils/uniformCache', () => ({
  invalidateUniformCaches: (...args: unknown[]) => invalidateUniformCaches(...args),
}));

const enqueueSnackbar = vi.fn();
vi.mock('notistack', async (importOriginal) => {
  const actual = await importOriginal<typeof import('notistack')>();
  return { ...actual, useSnackbar: () => ({ enqueueSnackbar }) };
});

import StockQuickFixDialog, { type StockQuickFixTarget } from './StockQuickFixDialog';
import { uniformService } from '@/services/uniform.service';

const svc = uniformService as unknown as {
  transfer: ReturnType<typeof vi.fn>;
  adjust: ReturnType<typeof vi.fn>;
  replenish: ReturnType<typeof vi.fn>;
};

const makeTarget = (overrides: Partial<StockQuickFixTarget> = {}): StockQuickFixTarget => ({
  variantId: 'var-1',
  label: 'Chemise grise (ML) — M',
  front: 3,
  back: 20,
  ...overrides,
});

describe('StockQuickFixDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('ne rend rien quand target est null', () => {
    renderWithProviders(
      <StockQuickFixDialog open onClose={vi.fn()} target={null} />
    );

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByText('Corriger le stock')).not.toBeInTheDocument();
  });

  it('affiche le titre, le libellé de la variante et le stock actuel (Front/Back)', () => {
    renderWithProviders(
      <StockQuickFixDialog open onClose={vi.fn()} target={makeTarget({ front: 3, back: 20 })} />
    );

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('Corriger le stock')).toBeInTheDocument();
    expect(within(dialog).getByText('Chemise grise (ML) — M')).toBeInTheDocument();
    expect(within(dialog).getByText('Actuel — Front 3 · Back 20')).toBeInTheDocument();

    // Les trois onglets sont présents.
    expect(within(dialog).getByRole('tab', { name: 'Transférer' })).toBeInTheDocument();
    expect(within(dialog).getByRole('tab', { name: 'Ajuster' })).toBeInTheDocument();
    expect(within(dialog).getByRole('tab', { name: 'Réappro' })).toBeInTheDocument();
  });

  it('pré-remplit la quantité de transfert suggérée (plafonnée au stock back disponible)', () => {
    renderWithProviders(
      <StockQuickFixDialog open onClose={vi.fn()} target={makeTarget({ back: 5 })} suggestedTransferQty={8} />
    );

    // suggestedTransferQty 8 > back 5 → plafonné à 5.
    const qty = screen.getByLabelText('Quantité') as HTMLInputElement;
    expect(qty.value).toBe('5');
  });

  it('transfère le stock avec les bons arguments puis appelle onSuccess et onClose', async () => {
    svc.transfer.mockResolvedValue({ message: 'Transfert effectué' });
    const onClose = vi.fn();
    const onSuccess = vi.fn();

    renderWithProviders(
      <StockQuickFixDialog
        open
        onClose={onClose}
        onSuccess={onSuccess}
        target={makeTarget({ variantId: 'var-1', back: 20 })}
      />
    );

    const qty = screen.getByLabelText('Quantité');
    await userEvent.type(qty, '4');

    await userEvent.click(screen.getByRole('button', { name: 'Transférer' }));

    await waitFor(() => expect(svc.transfer).toHaveBeenCalledTimes(1));
    expect(svc.transfer).toHaveBeenCalledWith('var-1', {
      quantity: 4,
      from: 'BACK_OFFICE',
      to: 'FRONT_OFFICE',
    });

    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
    expect(invalidateUniformCaches).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(enqueueSnackbar).toHaveBeenCalledWith('Transfert effectué', { variant: 'success' });
  });

  it('désactive le bouton Transférer et signale une erreur quand la quantité dépasse le stock disponible', async () => {
    renderWithProviders(
      <StockQuickFixDialog open onClose={vi.fn()} target={makeTarget({ back: 5 })} />
    );

    await userEvent.type(screen.getByLabelText('Quantité'), '9');

    expect(screen.getByText('Dépasse le stock disponible')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Transférer' })).toBeDisabled();
    expect(svc.transfer).not.toHaveBeenCalled();
  });

  it('ajuste l\'inventaire (delta) avec la raison et l\'emplacement par défaut', async () => {
    svc.adjust.mockResolvedValue({ message: 'Inventaire ajusté' });

    renderWithProviders(
      <StockQuickFixDialog
        open
        onClose={vi.fn()}
        target={makeTarget({ variantId: 'var-9' })}
        initialTab="adjust"
        defaultLocation="FRONT_OFFICE"
      />
    );

    await userEvent.type(screen.getByLabelText(/Delta/), '-3');
    await userEvent.type(screen.getByLabelText('Raison'), 'Casse');

    await userEvent.click(screen.getByRole('button', { name: 'Ajuster' }));

    await waitFor(() => expect(svc.adjust).toHaveBeenCalledTimes(1));
    expect(svc.adjust).toHaveBeenCalledWith('var-9', -3, 'Casse', 'FRONT_OFFICE');
  });

  it('réapprovisionne le stock avec la quantité reçue et l\'emplacement back par défaut', async () => {
    svc.replenish.mockResolvedValue({ message: 'Stock ajouté' });

    renderWithProviders(
      <StockQuickFixDialog
        open
        onClose={vi.fn()}
        target={makeTarget({ variantId: 'var-r' })}
        initialTab="replenish"
      />
    );

    await userEvent.type(screen.getByLabelText('Quantité reçue'), '12');

    await userEvent.click(screen.getByRole('button', { name: 'Ajouter au stock' }));

    await waitFor(() => expect(svc.replenish).toHaveBeenCalledTimes(1));
    expect(svc.replenish).toHaveBeenCalledWith('var-r', 12, undefined, 'BACK_OFFICE');
  });

  it('appelle onClose au clic sur Annuler sans déclencher de mutation', async () => {
    const onClose = vi.fn();
    renderWithProviders(
      <StockQuickFixDialog open onClose={onClose} target={makeTarget()} />
    );

    await userEvent.click(screen.getByRole('button', { name: 'Annuler' }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(svc.transfer).not.toHaveBeenCalled();
    expect(svc.adjust).not.toHaveBeenCalled();
    expect(svc.replenish).not.toHaveBeenCalled();
  });
});
