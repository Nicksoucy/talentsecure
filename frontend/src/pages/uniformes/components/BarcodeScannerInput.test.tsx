import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderWithProviders, screen, userEvent } from '@/test/renderWithProviders';

// Mocke ENTIÈREMENT l'enfant caméra : il importe dynamiquement @zxing/browser et
// appelle getUserMedia. On ne déclenche JAMAIS un vrai flux caméra ; on expose un
// faux composant avec un bouton qui simule un scan + un bouton fermer.
vi.mock('./CameraScanner', () => ({
  default: ({ onScan, onClose }: { onScan: (c: string) => void; onClose?: () => void }) => (
    <div data-testid="camera-scanner">
      <button type="button" onClick={() => onScan('CAM-999')}>
        simuler-scan-camera
      </button>
      {onClose && (
        <button type="button" onClick={onClose}>
          fermer-camera
        </button>
      )}
    </div>
  ),
}));

import BarcodeScannerInput from './BarcodeScannerInput';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('BarcodeScannerInput', () => {
  it('rend le champ et le bouton Caméra sans ouvrir la caméra au départ', () => {
    renderWithProviders(<BarcodeScannerInput onScan={vi.fn()} />);

    expect(screen.getByLabelText(/scanner \/ saisir un code-barres/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /caméra/i })).toBeInTheDocument();
    expect(screen.queryByTestId('camera-scanner')).not.toBeInTheDocument();
  });

  it('saisie manuelle + Entrée → onScan avec le code trimé et vide le champ', async () => {
    const user = userEvent.setup();
    const onScan = vi.fn();
    renderWithProviders(<BarcodeScannerInput onScan={onScan} />);

    const input = screen.getByLabelText(/scanner \/ saisir un code-barres/i) as HTMLInputElement;
    await user.type(input, '  ABC-123  {Enter}');

    expect(onScan).toHaveBeenCalledTimes(1);
    expect(onScan).toHaveBeenCalledWith('ABC-123');
    expect(input.value).toBe('');
  });

  it('Entrée sur un champ vide (ou espaces seuls) → aucun appel onScan', async () => {
    const user = userEvent.setup();
    const onScan = vi.fn();
    renderWithProviders(<BarcodeScannerInput onScan={onScan} />);

    const input = screen.getByLabelText(/scanner \/ saisir un code-barres/i);
    await user.type(input, '{Enter}');
    await user.type(input, '   {Enter}');

    expect(onScan).not.toHaveBeenCalled();
  });

  it('bouton Caméra → ouvre puis ferme le scanner (toggle du libellé)', async () => {
    const user = userEvent.setup();
    renderWithProviders(<BarcodeScannerInput onScan={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: /caméra/i }));
    expect(screen.getByTestId('camera-scanner')).toBeInTheDocument();

    // Le libellé du bouton bascule sur « Fermer » (match exact pour éviter le
    // bouton « fermer-camera » du faux scanner).
    await user.click(screen.getByRole('button', { name: 'Fermer' }));
    expect(screen.queryByTestId('camera-scanner')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /caméra/i })).toBeInTheDocument();
  });

  it('un scan caméra remonte le code via onScan', async () => {
    const user = userEvent.setup();
    const onScan = vi.fn();
    renderWithProviders(<BarcodeScannerInput onScan={onScan} />);

    await user.click(screen.getByRole('button', { name: /caméra/i }));
    await user.click(screen.getByRole('button', { name: /simuler-scan-camera/i }));

    expect(onScan).toHaveBeenCalledWith('CAM-999');
  });

  it('onClose interne du scanner referme la caméra et restaure le bouton Caméra', async () => {
    const user = userEvent.setup();
    renderWithProviders(<BarcodeScannerInput onScan={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: /caméra/i }));
    await user.click(screen.getByRole('button', { name: /fermer-camera/i }));

    expect(screen.queryByTestId('camera-scanner')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /caméra/i })).toBeInTheDocument();
  });
});
