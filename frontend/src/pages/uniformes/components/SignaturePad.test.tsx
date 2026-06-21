import { describe, it, expect, vi, beforeEach } from 'vitest';
import { forwardRef, useImperativeHandle } from 'react';
import { renderWithProviders, screen, userEvent } from '@/test/renderWithProviders';

/**
 * react-signature-canvas s'appuie sur un vrai <canvas> 2d que jsdom ne fournit
 * pas. On le remplace par un faux composant qui :
 *  - expose via ref les méthodes utilisées (isEmpty/toDataURL/clear) ;
 *  - rend un bouton "Simuler tracé" qui déclenche onEnd, comme un vrai geste.
 * Le flag `mockIsEmpty` pilote ce que isEmpty() renvoie pour chaque scénario.
 */
let mockIsEmpty = false;

vi.mock('react-signature-canvas', () => {
  const FakeSignatureCanvas = forwardRef(
    (props: { onEnd?: () => void }, ref) => {
      useImperativeHandle(ref, () => ({
        isEmpty: () => mockIsEmpty,
        toDataURL: () => 'data:image/png;base64,FAKE',
        clear: vi.fn(),
      }));
      return (
        <button type="button" onClick={() => props.onEnd?.()}>
          Simuler tracé
        </button>
      );
    }
  );
  FakeSignatureCanvas.displayName = 'FakeSignatureCanvas';
  return { default: FakeSignatureCanvas };
});

import SignaturePad from './SignaturePad';

beforeEach(() => {
  vi.clearAllMocks();
  mockIsEmpty = false;
});

describe('SignaturePad', () => {
  it('rend le label et le bouton Effacer', () => {
    renderWithProviders(<SignaturePad label="Signature du client" onChange={vi.fn()} />);
    expect(screen.getByText('Signature du client')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /effacer/i })).toBeInTheDocument();
  });

  it('sans label : ne rend pas de légende mais garde le bouton Effacer', () => {
    renderWithProviders(<SignaturePad onChange={vi.fn()} />);
    expect(screen.queryByText('Signature du client')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /effacer/i })).toBeInTheDocument();
  });

  it('fin de tracé non vide → onChange reçoit le dataURL', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    mockIsEmpty = false;
    renderWithProviders(<SignaturePad onChange={onChange} />);

    await user.click(screen.getByRole('button', { name: /simuler tracé/i }));

    expect(onChange).toHaveBeenCalledWith('data:image/png;base64,FAKE');
  });

  it('fin de tracé sur canvas vide → onChange non appelé', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    mockIsEmpty = true;
    renderWithProviders(<SignaturePad onChange={onChange} />);

    await user.click(screen.getByRole('button', { name: /simuler tracé/i }));

    expect(onChange).not.toHaveBeenCalled();
  });

  it('clic sur Effacer → onChange(null)', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderWithProviders(<SignaturePad onChange={onChange} />);

    await user.click(screen.getByRole('button', { name: /effacer/i }));

    expect(onChange).toHaveBeenCalledWith(null);
  });
});
