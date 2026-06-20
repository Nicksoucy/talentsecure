import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderWithProviders, screen, waitFor } from '@/test/renderWithProviders';

vi.mock('@/services/prospect.service', () => ({
  prospectService: { getVideoUrl: vi.fn() },
}));

import ProspectVideoPlayer from './ProspectVideoPlayer';
import { prospectService } from '@/services/prospect.service';

const svc = prospectService as unknown as { getVideoUrl: ReturnType<typeof vi.fn> };

beforeEach(() => {
  vi.clearAllMocks();
});

describe('ProspectVideoPlayer', () => {
  it("charge et affiche la vidéo via l'URL signée du prospect", async () => {
    svc.getVideoUrl.mockResolvedValue({ success: true, data: { videoUrl: 'https://r2/presentation.mp4' } });
    const { container } = renderWithProviders(<ProspectVideoPlayer prospectId="p1" />);

    await waitFor(() => expect(container.querySelector('video')).toBeTruthy());
    expect(container.querySelector('video')).toHaveAttribute('src', 'https://r2/presentation.mp4');
    expect(svc.getVideoUrl).toHaveBeenCalledWith('p1');
  });

  it('affiche un indicateur de chargement avant la résolution', () => {
    // Promesse jamais résolue → on reste dans l'état loading.
    svc.getVideoUrl.mockReturnValue(new Promise(() => {}));
    renderWithProviders(<ProspectVideoPlayer prospectId="p1" />);

    expect(screen.getByRole('progressbar')).toBeInTheDocument();
  });

  it('réponse sans vidéo → message "Aucune vidéo disponible"', async () => {
    svc.getVideoUrl.mockResolvedValue({ success: true, data: { videoUrl: '' } });
    renderWithProviders(<ProspectVideoPlayer prospectId="p1" />);

    expect(await screen.findByText(/aucune vidéo disponible/i)).toBeInTheDocument();
  });

  it('erreur 404 → message "Aucune vidéo disponible"', async () => {
    svc.getVideoUrl.mockRejectedValue({ response: { status: 404 } });
    renderWithProviders(<ProspectVideoPlayer prospectId="p1" />);

    expect(await screen.findByText(/aucune vidéo disponible/i)).toBeInTheDocument();
  });

  it('erreur serveur (500) → message de chargement dédié', async () => {
    svc.getVideoUrl.mockRejectedValue({ response: { status: 500 } });
    renderWithProviders(<ProspectVideoPlayer prospectId="p1" />);

    expect(await screen.findByText(/erreur de chargement de la vidéo/i)).toBeInTheDocument();
  });

  it('applique la hauteur max sur la vidéo (prop height numérique)', async () => {
    svc.getVideoUrl.mockResolvedValue({ success: true, data: { videoUrl: 'https://r2/v.mp4' } });
    const { container } = renderWithProviders(<ProspectVideoPlayer prospectId="p1" height={500} />);

    await waitFor(() => expect(container.querySelector('video')).toBeTruthy());
    expect(container.querySelector('video')).toHaveStyle({ maxHeight: '500px' });
  });
});
