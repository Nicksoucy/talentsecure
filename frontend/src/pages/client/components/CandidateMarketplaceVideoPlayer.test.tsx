import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderWithProviders, screen, waitFor } from '@/test/renderWithProviders';

vi.mock('@/services/talent-marketplace.service', () => ({
  talentMarketplaceService: { getTalentVideoUrl: vi.fn() },
}));

import CandidateMarketplaceVideoPlayer from './CandidateMarketplaceVideoPlayer';
import { talentMarketplaceService } from '@/services/talent-marketplace.service';

const svc = talentMarketplaceService as unknown as {
  getTalentVideoUrl: ReturnType<typeof vi.fn>;
};

// Permet de résoudre la promesse du service à la demande pour observer l'état de chargement.
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('CandidateMarketplaceVideoPlayer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('affiche un indicateur de chargement tant que l\'URL n\'est pas résolue', () => {
    const d = deferred<{ success: boolean; data: { videoUrl: string } }>();
    svc.getTalentVideoUrl.mockReturnValue(d.promise);

    renderWithProviders(<CandidateMarketplaceVideoPlayer candidateId="cand-1" />);

    expect(screen.getByRole('progressbar')).toBeInTheDocument();
    expect(svc.getTalentVideoUrl).toHaveBeenCalledWith('cand-1');
  });

  it('charge et joue la vidéo via l\'URL signée renvoyée par le service', async () => {
    svc.getTalentVideoUrl.mockResolvedValue({
      success: true,
      data: { videoUrl: 'https://r2.example/talents/cand-1.mp4' },
    });

    const { container } = renderWithProviders(
      <CandidateMarketplaceVideoPlayer candidateId="cand-1" />
    );

    await waitFor(() => expect(container.querySelector('video')).toBeTruthy());
    const video = container.querySelector('video')!;
    expect(video).toHaveAttribute('src', 'https://r2.example/talents/cand-1.mp4');
    expect(video).toHaveAttribute('controls');
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });

  it('affiche "Aucune vidéo disponible" quand la réponse ne contient pas d\'URL', async () => {
    svc.getTalentVideoUrl.mockResolvedValue({ success: true, data: { videoUrl: '' } });

    const { container } = renderWithProviders(
      <CandidateMarketplaceVideoPlayer candidateId="cand-2" />
    );

    expect(await screen.findByText('Aucune vidéo disponible')).toBeInTheDocument();
    expect(container.querySelector('video')).toBeNull();
  });

  it('affiche un message d\'erreur quand le service échoue', async () => {
    svc.getTalentVideoUrl.mockRejectedValue(new Error('500'));

    renderWithProviders(<CandidateMarketplaceVideoPlayer candidateId="cand-3" />);

    expect(await screen.findByText('Aucune vidéo disponible')).toBeInTheDocument();
  });

  it('recharge l\'URL quand le candidateId change', async () => {
    svc.getTalentVideoUrl.mockResolvedValue({
      success: true,
      data: { videoUrl: 'https://r2.example/a.mp4' },
    });

    const { rerender, container } = renderWithProviders(
      <CandidateMarketplaceVideoPlayer candidateId="cand-a" />
    );
    await waitFor(() => expect(container.querySelector('video')).toBeTruthy());

    svc.getTalentVideoUrl.mockResolvedValue({
      success: true,
      data: { videoUrl: 'https://r2.example/b.mp4' },
    });
    rerender(<CandidateMarketplaceVideoPlayer candidateId="cand-b" />);

    await waitFor(() =>
      expect(container.querySelector('video')).toHaveAttribute('src', 'https://r2.example/b.mp4')
    );
    expect(svc.getTalentVideoUrl).toHaveBeenCalledTimes(2);
    expect(svc.getTalentVideoUrl).toHaveBeenNthCalledWith(1, 'cand-a');
    expect(svc.getTalentVideoUrl).toHaveBeenNthCalledWith(2, 'cand-b');
  });
});
