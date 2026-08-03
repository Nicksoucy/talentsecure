import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderWithProviders, screen, userEvent } from '@/test/renderWithProviders';
import VideoRecorder, { pickMimeType, baseMimeType } from './VideoRecorder';

/**
 * Enregistrement de la vidéo dans le navigateur.
 *
 * jsdom n'implémente ni getUserMedia ni MediaRecorder : on couvre donc les
 * fonctions pures de négociation de format (la partie qui diverge réellement
 * entre Safari et Chrome) et le repli quand la capture est indisponible.
 */

const originalMediaRecorder = (globalThis as any).MediaRecorder;
const originalMediaDevices = navigator.mediaDevices;

function setMediaRecorder(supported: string[] | null) {
  if (supported === null) {
    delete (globalThis as any).MediaRecorder;
    return;
  }
  (globalThis as any).MediaRecorder = {
    isTypeSupported: (type: string) => supported.includes(type),
  };
}

afterEach(() => {
  if (originalMediaRecorder === undefined) delete (globalThis as any).MediaRecorder;
  else (globalThis as any).MediaRecorder = originalMediaRecorder;
  Object.defineProperty(navigator, 'mediaDevices', {
    value: originalMediaDevices,
    configurable: true,
  });
});

describe('pickMimeType', () => {
  it('sans MediaRecorder → null (l’appelant bascule sur le téléversement)', () => {
    setMediaRecorder(null);
    expect(pickMimeType()).toBeNull();
  });

  it('Safari (mp4 seulement) → video/mp4', () => {
    // Safari/iOS ne produit que du MP4 : c'est pour ça qu'il est essayé en premier.
    setMediaRecorder(['video/mp4']);
    expect(pickMimeType()).toBe('video/mp4');
  });

  it('Chrome (webm seulement) → webm avec codecs explicites', () => {
    setMediaRecorder(['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm']);
    expect(pickMimeType()).toBe('video/webm;codecs=vp9,opus');
  });

  it('navigateur ancien ne supportant que webm nu → video/webm', () => {
    setMediaRecorder(['video/webm']);
    expect(pickMimeType()).toBe('video/webm');
  });

  it('aucun format supporté → null', () => {
    setMediaRecorder([]);
    expect(pickMimeType()).toBeNull();
  });
});

describe('baseMimeType', () => {
  it('retire les paramètres de codec', () => {
    // Le serveur signe `video/webm` : l'en-tête du PUT doit correspondre au
    // caractère près, sinon R2 répond 403.
    expect(baseMimeType('video/webm;codecs=vp8,opus')).toBe('video/webm');
  });

  it('laisse un type déjà nu intact', () => {
    expect(baseMimeType('video/mp4')).toBe('video/mp4');
  });
});

describe('VideoRecorder — capture indisponible', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sans getUserMedia → avertit et signale l’indisponibilité', async () => {
    setMediaRecorder(['video/webm']);
    Object.defineProperty(navigator, 'mediaDevices', { value: undefined, configurable: true });
    const onUnavailable = vi.fn();

    renderWithProviders(<VideoRecorder onRecorded={vi.fn()} onUnavailable={onUnavailable} />);
    await userEvent.click(screen.getByRole('button', { name: /Activer la caméra/i }));

    expect(onUnavailable).toHaveBeenCalled();
    expect(await screen.findByText(/ne permet pas d'enregistrer/i)).toBeInTheDocument();
  });

  it('caméra refusée par l’utilisateur → message qui oriente vers le téléversement', async () => {
    setMediaRecorder(['video/webm']);
    const denied = Object.assign(new Error('denied'), { name: 'NotAllowedError' });
    Object.defineProperty(navigator, 'mediaDevices', {
      value: { getUserMedia: vi.fn().mockRejectedValue(denied) },
      configurable: true,
    });
    const onUnavailable = vi.fn();

    renderWithProviders(<VideoRecorder onRecorded={vi.fn()} onUnavailable={onUnavailable} />);
    await userEvent.click(screen.getByRole('button', { name: /Activer la caméra/i }));

    expect(await screen.findByText(/refusé/i)).toBeInTheDocument();
    expect(onUnavailable).toHaveBeenCalled();
  });

  it('aucune caméra sur l’appareil → message spécifique', async () => {
    setMediaRecorder(['video/webm']);
    const notFound = Object.assign(new Error('none'), { name: 'NotFoundError' });
    Object.defineProperty(navigator, 'mediaDevices', {
      value: { getUserMedia: vi.fn().mockRejectedValue(notFound) },
      configurable: true,
    });

    renderWithProviders(<VideoRecorder onRecorded={vi.fn()} onUnavailable={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: /Activer la caméra/i }));

    expect(await screen.findByText(/Aucune caméra détectée/i)).toBeInTheDocument();
  });
});
