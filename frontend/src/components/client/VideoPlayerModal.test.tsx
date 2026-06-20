import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderWithProviders, screen, within, userEvent } from '@/test/renderWithProviders';
import VideoPlayerModal from './VideoPlayerModal';

// jsdom n'implémente pas les commandes média du HTMLVideoElement → on les stubbe
// pour que togglePlay/toggleMute/fullscreen ne lèvent pas.
beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  HTMLMediaElement.prototype.requestFullscreen = vi.fn().mockResolvedValue(undefined);
});

const defaultProps = {
  open: true,
  onClose: vi.fn(),
  videoUrl: 'https://r2.example/entrevue.mp4',
  candidateName: 'Marie Tremblay',
};

describe('VideoPlayerModal', () => {
  it('affiche le dialog avec le titre d\'entrevue et la source vidéo quand open=true', () => {
    renderWithProviders(<VideoPlayerModal {...defaultProps} onClose={vi.fn()} />);

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('Entrevue - Marie Tremblay')).toBeInTheDocument();

    // La balise <video> pointe sur l'URL fournie (Dialog rendu via portal).
    const video = dialog.querySelector('video');
    expect(video).toBeTruthy();
    expect(video).toHaveAttribute('src', 'https://r2.example/entrevue.mp4');
  });

  it('ne rend aucun contenu quand open=false', () => {
    renderWithProviders(<VideoPlayerModal {...defaultProps} open={false} onClose={vi.fn()} />);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByText(/Entrevue -/)).not.toBeInTheDocument();
  });

  it('appelle onClose au clic sur le bouton de fermeture', async () => {
    const onClose = vi.fn();
    renderWithProviders(<VideoPlayerModal {...defaultProps} onClose={onClose} />);

    // Le bouton de fermeture porte l'icône Close → premier IconButton du titre.
    const dialog = screen.getByRole('dialog');
    const buttons = within(dialog).getAllByRole('button');
    await userEvent.click(buttons[0]);

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('bascule lecture/pause en pilotant l\'élément vidéo au clic sur le bouton play', async () => {
    renderWithProviders(<VideoPlayerModal {...defaultProps} onClose={vi.fn()} />);

    const video = screen.getByRole('dialog').querySelector('video') as HTMLVideoElement;

    // Au départ : icône Play affichée (pas de lecture en cours).
    expect(screen.getByTestId('PlayArrowIcon')).toBeInTheDocument();

    // Clic sur la vidéo elle-même → démarre la lecture, l'icône passe à Pause.
    await userEvent.click(video);
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('PauseIcon')).toBeInTheDocument();

    // Nouveau clic → met en pause, retour à l'icône Play.
    await userEvent.click(video);
    expect(HTMLMediaElement.prototype.pause).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('PlayArrowIcon')).toBeInTheDocument();
  });

  it('bascule le son et synchronise la propriété muted de la vidéo', async () => {
    renderWithProviders(<VideoPlayerModal {...defaultProps} onClose={vi.fn()} />);

    const video = screen.getByRole('dialog').querySelector('video') as HTMLVideoElement;

    // Son actif au départ → icône VolumeUp visible.
    expect(screen.getByTestId('VolumeUpIcon')).toBeInTheDocument();
    expect(video.muted).toBe(false);

    await userEvent.click(screen.getByTestId('VolumeUpIcon').closest('button')!);

    // Coupé → icône VolumeOff et muted=true sur l'élément.
    expect(screen.getByTestId('VolumeOffIcon')).toBeInTheDocument();
    expect(video.muted).toBe(true);
  });

  it('déclenche le plein écran sur l\'élément vidéo au clic sur le bouton dédié', async () => {
    renderWithProviders(<VideoPlayerModal {...defaultProps} onClose={vi.fn()} />);

    await userEvent.click(screen.getByTestId('FullscreenIcon').closest('button')!);

    const video = screen.getByRole('dialog').querySelector('video') as HTMLVideoElement;
    expect(video.requestFullscreen).toHaveBeenCalledTimes(1);
  });
});
