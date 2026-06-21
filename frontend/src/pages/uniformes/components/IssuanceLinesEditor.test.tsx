import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderWithProviders, screen, within, userEvent, waitFor } from '@/test/renderWithProviders';

// notistack : on espionne les notifications sans dépendre du provider réel.
const enqueueSnackbar = vi.fn();
vi.mock('notistack', async () => {
  const actual = await vi.importActual<typeof import('notistack')>('notistack');
  return { ...actual, useSnackbar: () => ({ enqueueSnackbar }) };
});

vi.mock('@/services/uniform.service', () => ({
  uniformService: {
    listItems: vi.fn(),
    updateIssuance: vi.fn(),
  },
}));

import IssuanceLinesEditor from './IssuanceLinesEditor';
import { uniformService } from '@/services/uniform.service';
import type { UniformItem, UniformIssuance } from '@/types/uniform';

const svc = uniformService as unknown as {
  listItems: ReturnType<typeof vi.fn>;
  updateIssuance: ReturnType<typeof vi.fn>;
};

// Une pièce d'uniforme avec grandeurs (S/M) + une pièce d'équipement taille unique.
const polo: UniformItem = {
  id: 'item-polo',
  division: 'SECURITE',
  type: 'UNIFORME',
  name: 'Polo manches courtes',
  isOneSize: false,
  defaultReplacementCost: 25,
  sortOrder: 1,
  isActive: true,
  variants: [
    { id: 'var-polo-s', itemId: 'item-polo', size: 'S', barcode: 'b1', replacementCost: 25, quantityOnHand: 10, isActive: true },
    { id: 'var-polo-m', itemId: 'item-polo', size: 'M', barcode: 'b2', replacementCost: 25, quantityOnHand: 10, isActive: true },
  ],
};
const radio: UniformItem = {
  id: 'item-radio',
  division: 'SECURITE',
  type: 'EQUIPEMENT',
  name: 'Radio portative',
  isOneSize: true,
  defaultReplacementCost: 120,
  sortOrder: 1,
  isActive: true,
  variants: [
    { id: 'var-radio', itemId: 'item-radio', size: 'U', barcode: 'b3', replacementCost: 120, quantityOnHand: 5, isActive: true },
  ],
};

const makeIssuance = (overrides: Partial<UniformIssuance> = {}): UniformIssuance => ({
  id: 'iss-1',
  employeeId: 'emp-1',
  division: 'SECURITE',
  status: 'DRAFT',
  totalLoanCost: 0,
  signatureStatus: 'PENDING',
  createdAt: '2026-06-01T00:00:00.000Z',
  lines: [],
  ...overrides,
});

const renderEditor = (props: Partial<Parameters<typeof IssuanceLinesEditor>[0]> = {}) =>
  renderWithProviders(
    <IssuanceLinesEditor
      open
      onClose={props.onClose ?? vi.fn()}
      issuance={props.issuance ?? makeIssuance()}
      employeeId={props.employeeId ?? 'emp-1'}
    />
  );

describe('IssuanceLinesEditor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    svc.listItems.mockResolvedValue({ data: [polo, radio] });
    svc.updateIssuance.mockResolvedValue({ data: makeIssuance() });
  });

  it("n'affiche pas le dialogue ni ne charge les items quand open=false", () => {
    renderWithProviders(
      <IssuanceLinesEditor open={false} onClose={vi.fn()} issuance={makeIssuance()} employeeId="emp-1" />
    );

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    // La requête est `enabled: open` → aucun appel réseau tant que fermé.
    expect(svc.listItems).not.toHaveBeenCalled();
  });

  it('charge les items de la division et affiche les sections Uniforme et Équipement', async () => {
    renderEditor();

    // Les pièces des deux catégories apparaissent une fois la requête résolue.
    expect(await screen.findByText('Polo manches courtes')).toBeInTheDocument();
    expect(screen.getByText('Radio portative')).toBeInTheDocument();
    expect(screen.getByText('Uniforme')).toBeInTheDocument();
    expect(screen.getByText('Équipement')).toBeInTheDocument();

    // La requête cible bien la division de la remise.
    expect(svc.listItems).toHaveBeenCalledWith({ division: 'SECURITE' });
  });

  it('pré-remplit les quantités existantes et calcule le total', async () => {
    const issuance = makeIssuance({
      lines: [
        { id: 'l1', variantId: 'var-polo-m', quantity: 2, unitCostSnapshot: 25 },
        { id: 'l2', customItemName: 'Écusson brodé', quantity: 1, unitCostSnapshot: 10 },
      ],
    });
    renderEditor({ issuance });

    // La ligne libre existante est pré-remplie dans un champ "Désignation".
    const designation = await screen.findByDisplayValue('Écusson brodé');
    expect(designation).toBeInTheDocument();

    // Total = 2 × 25 (polo) + 1 × 10 (écusson) = 60.
    await waitFor(() => expect(screen.getByText('Total : $ 60.00')).toBeInTheDocument());
  });

  it('affiche le bandeau "remise historique" quand le statut n\'est pas DRAFT', async () => {
    renderEditor({ issuance: makeIssuance({ status: 'ISSUED' }) });

    expect(await screen.findByText('Polo manches courtes')).toBeInTheDocument();
    expect(screen.getByText(/Remise historique \(papier\)/)).toBeInTheDocument();
  });

  it('ajoute une ligne libre au clic sur "Ajouter une ligne libre"', async () => {
    const user = userEvent.setup();
    renderEditor();

    await screen.findByText('Polo manches courtes');
    expect(screen.queryByLabelText('Désignation')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Ajouter une ligne libre/ }));

    expect(screen.getByLabelText('Désignation')).toBeInTheDocument();
    expect(screen.getByLabelText('Qté')).toBeInTheDocument();
  });

  it('bloque la sauvegarde et notifie quand une pièce a une quantité sans grandeur', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    renderEditor({ onClose });

    await screen.findByText('Polo manches courtes');

    // On met une quantité au polo SANS choisir de grandeur (variantId vide).
    const poloRow = screen.getByText('Polo manches courtes').closest('tr') as HTMLElement;
    const qtyInput = within(poloRow).getByRole('spinbutton');
    await user.clear(qtyInput);
    await user.type(qtyInput, '1');

    await user.click(screen.getByRole('button', { name: 'Enregistrer' }));

    await waitFor(() =>
      expect(enqueueSnackbar).toHaveBeenCalledWith(
        'Choisissez une grandeur pour « Polo manches courtes »',
        { variant: 'error' }
      )
    );
    expect(svc.updateIssuance).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('enregistre les lignes valides, notifie le succès et ferme', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    // Remise pré-remplie avec une grandeur déjà choisie → sauvegarde sans saisie de Select.
    const issuance = makeIssuance({
      lines: [{ id: 'l1', variantId: 'var-radio', quantity: 1, unitCostSnapshot: 120 }],
    });
    renderEditor({ issuance, onClose });

    await screen.findByText('Radio portative');
    await waitFor(() => expect(screen.getByText('Total : $ 120.00')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: 'Enregistrer' }));

    await waitFor(() => expect(svc.updateIssuance).toHaveBeenCalledTimes(1));
    expect(svc.updateIssuance).toHaveBeenCalledWith('iss-1', {
      lines: [{ variantId: 'var-radio', quantity: 1, unitCost: 120 }],
    });
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(enqueueSnackbar).toHaveBeenCalledWith('Pièces mises à jour', { variant: 'success' });
  });

  it('appelle onClose au clic sur Annuler', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    renderEditor({ onClose });

    await screen.findByText('Polo manches courtes');
    await user.click(screen.getByRole('button', { name: 'Annuler' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
