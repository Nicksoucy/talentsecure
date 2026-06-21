import { describe, it, expect, vi } from 'vitest';
import { renderWithProviders, screen, userEvent } from '@/test/renderWithProviders';
import CandidateBulkActions from './CandidateBulkActions';

const baseProps = {
  onCreateCatalogue: vi.fn(),
  onClearSelection: vi.fn(),
  onCompare: vi.fn(),
};

describe('CandidateBulkActions', () => {
  it('ne rend rien quand aucun candidat n\'est sélectionné (selectedCount=0)', () => {
    const { container } = renderWithProviders(
      <CandidateBulkActions selectedCount={0} {...baseProps} />
    );

    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByText(/sélectionné/i)).not.toBeInTheDocument();
  });

  it('affiche le chip au singulier et les boutons principaux pour 1 candidat', () => {
    renderWithProviders(<CandidateBulkActions selectedCount={1} {...baseProps} />);

    expect(screen.getByText('1 candidat sélectionné')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Créer un catalogue' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Annuler' })).toBeInTheDocument();
  });

  it('accorde le chip au pluriel pour plusieurs candidats', () => {
    renderWithProviders(<CandidateBulkActions selectedCount={3} {...baseProps} />);

    expect(screen.getByText('3 candidats sélectionnés')).toBeInTheDocument();
  });

  it('désactive Comparer hors de la plage 2-3 et l\'active dans la plage', () => {
    const { rerender } = renderWithProviders(
      <CandidateBulkActions selectedCount={1} {...baseProps} />
    );
    expect(screen.getByRole('button', { name: /Comparer \(1\)/ })).toBeDisabled();

    rerender(<CandidateBulkActions selectedCount={2} {...baseProps} />);
    expect(screen.getByRole('button', { name: /Comparer \(2\)/ })).toBeEnabled();

    rerender(<CandidateBulkActions selectedCount={4} {...baseProps} />);
    expect(screen.getByRole('button', { name: /Comparer \(4\)/ })).toBeDisabled();
  });

  it('appelle les callbacks correspondants au clic sur les boutons', async () => {
    const onCompare = vi.fn();
    const onCreateCatalogue = vi.fn();
    const onClearSelection = vi.fn();
    const user = userEvent.setup();

    renderWithProviders(
      <CandidateBulkActions
        selectedCount={2}
        onCompare={onCompare}
        onCreateCatalogue={onCreateCatalogue}
        onClearSelection={onClearSelection}
      />
    );

    await user.click(screen.getByRole('button', { name: /Comparer \(2\)/ }));
    await user.click(screen.getByRole('button', { name: 'Créer un catalogue' }));
    await user.click(screen.getByRole('button', { name: 'Annuler' }));

    expect(onCompare).toHaveBeenCalledTimes(1);
    expect(onCreateCatalogue).toHaveBeenCalledTimes(1);
    expect(onClearSelection).toHaveBeenCalledTimes(1);
  });

  it('n\'affiche "Re-convertir" que si onRevertToProspect est fourni, et le déclenche', async () => {
    const user = userEvent.setup();
    const { rerender } = renderWithProviders(
      <CandidateBulkActions selectedCount={2} {...baseProps} />
    );

    expect(screen.queryByRole('button', { name: 'Re-convertir' })).not.toBeInTheDocument();

    const onRevertToProspect = vi.fn();
    rerender(
      <CandidateBulkActions
        selectedCount={2}
        {...baseProps}
        onRevertToProspect={onRevertToProspect}
      />
    );

    const revertBtn = screen.getByRole('button', { name: 'Re-convertir' });
    expect(revertBtn).toBeInTheDocument();

    await user.click(revertBtn);
    expect(onRevertToProspect).toHaveBeenCalledTimes(1);
  });
});
