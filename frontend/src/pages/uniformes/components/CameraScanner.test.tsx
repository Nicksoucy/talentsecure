import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderWithProviders, screen, waitFor, userEvent } from '@/test/renderWithProviders';

// On mocke ENTIÈREMENT @zxing/browser : aucun vrai flux caméra n'est déclenché.
// `decodeFromVideoDevice` capture la callback de décodage pour qu'on puisse
// simuler des scans manuellement, et expose un `stop()` espionné (cleanup).
const stopMock = vi.fn();
let lastDecodeCb: ((result: { getText: () => string } | null) => void) | null = null;
const decodeFromVideoDevice = vi.fn(
  async (_deviceId: unknown, _video: unknown, cb: (r: { getText: () => string } | null) => void) => {
    lastDecodeCb = cb;
    return { stop: stopMock };
  }
);

vi.mock('@zxing/browser', () => ({
  BrowserMultiFormatReader: class {
    decodeFromVideoDevice = decodeFromVideoDevice;
  },
}));

import CameraScanner from './CameraScanner';

/** Émet un résultat de décodage comme le ferait @zxing en continu. */
function emitScan(code: string) {
  lastDecodeCb?.({ getText: () => code });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
  lastDecodeCb = null;
});

describe('CameraScanner', () => {
  it('rend l\'élément vidéo et démarre le lecteur @zxing', async () => {
    const { container } = renderWithProviders(<CameraScanner onScan={vi.fn()} />);

    expect(container.querySelector('video')).toBeTruthy();
    await waitFor(() => expect(decodeFromVideoDevice).toHaveBeenCalledTimes(1));
  });

  it('un code décodé déclenche onScan avec le texte', async () => {
    const onScan = vi.fn();
    renderWithProviders(<CameraScanner onScan={onScan} />);

    await waitFor(() => expect(decodeFromVideoDevice).toHaveBeenCalled());
    emitScan('UNIF-001');

    expect(onScan).toHaveBeenCalledWith('UNIF-001');
    expect(onScan).toHaveBeenCalledTimes(1);
  });

  it('anti-rebond : le MÊME code re-décodé tout de suite n\'émet qu\'une fois', async () => {
    const onScan = vi.fn();
    renderWithProviders(<CameraScanner onScan={onScan} debounceMs={5000} />);

    await waitFor(() => expect(decodeFromVideoDevice).toHaveBeenCalled());
    emitScan('DUP-9');
    emitScan('DUP-9');
    emitScan('DUP-9');

    expect(onScan).toHaveBeenCalledTimes(1);
  });

  it('un code DIFFÉRENT passe malgré l\'anti-rebond', async () => {
    const onScan = vi.fn();
    renderWithProviders(<CameraScanner onScan={onScan} debounceMs={5000} />);

    await waitFor(() => expect(decodeFromVideoDevice).toHaveBeenCalled());
    emitScan('A-1');
    emitScan('B-2');

    expect(onScan).toHaveBeenNthCalledWith(1, 'A-1');
    expect(onScan).toHaveBeenNthCalledWith(2, 'B-2');
  });

  it('affiche le bouton de fermeture et appelle onClose au clic', async () => {
    const onClose = vi.fn();
    renderWithProviders(<CameraScanner onScan={vi.fn()} onClose={onClose} />);

    const btn = screen.getByRole('button', { name: /fermer la caméra/i });
    await userEvent.setup().click(btn);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('caméra indisponible (@zxing rejette) → message d\'erreur', async () => {
    decodeFromVideoDevice.mockRejectedValueOnce(new Error('NotAllowedError'));
    renderWithProviders(<CameraScanner onScan={vi.fn()} />);

    expect(await screen.findByText(/caméra indisponible/i)).toBeInTheDocument();
  });

  it('au démontage, stop() du lecteur est appelé (libère la caméra)', async () => {
    const { unmount } = renderWithProviders(<CameraScanner onScan={vi.fn()} />);

    await waitFor(() => expect(decodeFromVideoDevice).toHaveBeenCalled());
    unmount();
    await waitFor(() => expect(stopMock).toHaveBeenCalled());
  });
});
