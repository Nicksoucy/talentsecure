import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderWithProviders, screen, within, userEvent } from '@/test/renderWithProviders';
import BatchExtractionConfirmDialog from './BatchExtractionConfirmDialog';

// Props par défaut réalistes : callbacks mockés + valeurs numériques typiques.
const baseProps = () => ({
  open: true,
  onClose: vi.fn(),
  onConfirm: vi.fn(),
  candidateCount: 12,
  estimatedCost: 3.5,
  estimatedTimeMinutes: 8,
});

describe('BatchExtractionConfirmDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('ne rend pas le dialogue quand open=false', () => {
    renderWithProviders(<BatchExtractionConfirmDialog {...baseProps()} open={false} />);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByText('Extraction en Masse')).not.toBeInTheDocument();
  });

  it('affiche le titre, le volume, le coût et le temps estimés quand ouvert', () => {
    renderWithProviders(<BatchExtractionConfirmDialog {...baseProps()} />);

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('Extraction en Masse')).toBeInTheDocument();
    // Pluriel sur "candidat" puisque candidateCount = 12 > 1.
    expect(within(dialog).getByText(/12 candidats/)).toBeInTheDocument();
    expect(within(dialog).getByText('12 CVs')).toBeInTheDocument();
    // Coût formaté à deux décimales avec préfixe ~$.
    expect(within(dialog).getByText('~$3.50')).toBeInTheDocument();
    expect(within(dialog).getByText('~8 min')).toBeInTheDocument();
  });

  it('utilise le singulier pour un seul candidat', () => {
    renderWithProviders(<BatchExtractionConfirmDialog {...baseProps()} candidateCount={1} />);

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText(/1 candidat\b/)).toBeInTheDocument();
    expect(within(dialog).queryByText(/1 candidats/)).not.toBeInTheDocument();
  });

  it('affiche la note des candidats ignorés seulement quand skippedCount > 0', () => {
    const { rerender } = renderWithProviders(
      <BatchExtractionConfirmDialog {...baseProps()} skippedCount={0} />
    );
    // skippedCount = 0 → aucune note d'ignorés.
    expect(screen.queryByText(/déjà traité/)).not.toBeInTheDocument();

    rerender(<BatchExtractionConfirmDialog {...baseProps()} skippedCount={3} />);
    expect(screen.getByText(/3 candidats déjà traités seront ignorés/)).toBeInTheDocument();
  });

  it('désactive "Lancer l\'extraction" tant que la case n\'est pas cochée, puis l\'active', async () => {
    renderWithProviders(<BatchExtractionConfirmDialog {...baseProps()} />);

    const launchBtn = screen.getByRole('button', { name: /Lancer l'extraction/ });
    expect(launchBtn).toBeDisabled();

    await userEvent.click(screen.getByRole('checkbox'));
    expect(launchBtn).toBeEnabled();
  });

  it('appelle onConfirm seulement après acceptation, et onClose au clic sur Annuler', async () => {
    const props = baseProps();
    renderWithProviders(<BatchExtractionConfirmDialog {...props} />);

    // Sans cocher la case, le bouton est désactivé → onConfirm jamais appelé.
    expect(props.onConfirm).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('checkbox'));
    await userEvent.click(screen.getByRole('button', { name: /Lancer l'extraction/ }));
    expect(props.onConfirm).toHaveBeenCalledTimes(1);

    await userEvent.click(screen.getByRole('button', { name: 'Annuler' }));
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });
});
