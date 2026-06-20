import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderWithProviders, screen, waitFor } from '@/test/renderWithProviders';

vi.mock('@/services/candidate.service', () => ({
  candidateService: { getVideoUrlByType: vi.fn() },
}));

import VideoPlayer from './VideoPlayer';
import { candidateService } from '@/services/candidate.service';

const svc = candidateService as unknown as { getVideoUrlByType: ReturnType<typeof vi.fn> };

beforeEach(() => vi.clearAllMocks());

describe('VideoPlayer', () => {
  it('charge et affiche la vidéo via l\'URL signée du bon type', async () => {
    svc.getVideoUrlByType.mockResolvedValue({ success: true, data: { videoUrl: 'https://r2/v.mp4', expiresIn: 3600 } });
    const { container } = renderWithProviders(
      <VideoPlayer candidateId="c1" videoType="PRESENTATION" title="Vidéo de présentation" />
    );

    await waitFor(() => expect(container.querySelector('video')).toBeTruthy());
    expect(container.innerHTML).toContain('https://r2/v.mp4');
    expect(svc.getVideoUrlByType).toHaveBeenCalledWith('c1', 'PRESENTATION');
  });

  it('aucune vidéo → message "Aucune vidéo disponible"', async () => {
    svc.getVideoUrlByType.mockResolvedValue({ success: false, data: { videoUrl: '' } });
    renderWithProviders(<VideoPlayer candidateId="c1" videoType="INTERVIEW" title="Vidéo d'entrevue" />);
    expect(await screen.findByText(/aucune vidéo disponible/i)).toBeInTheDocument();
  });

  it('erreur 404 → message dédié', async () => {
    svc.getVideoUrlByType.mockRejectedValue({ response: { status: 404 } });
    renderWithProviders(<VideoPlayer candidateId="c1" videoType="INTERVIEW" title="Vidéo d'entrevue" />);
    expect(await screen.findByText(/aucune vidéo disponible pour ce candidat/i)).toBeInTheDocument();
  });
});
