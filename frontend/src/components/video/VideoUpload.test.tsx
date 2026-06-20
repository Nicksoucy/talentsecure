import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderWithProviders, screen, userEvent, waitFor } from '@/test/renderWithProviders';

vi.mock('@/services/candidate.service', () => ({
  candidateService: {
    initiateVideoUploadByType: vi.fn(),
    uploadFileToUrl: vi.fn(),
    completeVideoUploadByType: vi.fn(),
    deleteVideoByType: vi.fn(),
  },
}));

import VideoUpload from './VideoUpload';
import { candidateService } from '@/services/candidate.service';

const svc = candidateService as unknown as Record<string, ReturnType<typeof vi.fn>>;

beforeEach(() => {
  vi.clearAllMocks();
});

function makeFile(name: string, type: string, sizeBytes = 1000) {
  const f = new File(['x'], name, { type });
  Object.defineProperty(f, 'size', { value: sizeBytes });
  return f;
}

describe('VideoUpload (feature vidéos typées)', () => {
  it('rejette un type de fichier non supporté', async () => {
    // applyAccept:false → ne pas filtrer via l'attribut accept du input, pour que
    // le fichier non vidéo atteigne la validation du composant.
    const user = userEvent.setup({ applyAccept: false });
    renderWithProviders(<VideoUpload candidateId="c1" videoType="INTERVIEW" title="Vidéo d'entrevue" />);

    await user.upload(screen.getByLabelText(/sélectionner une vidéo/i), makeFile('doc.pdf', 'application/pdf'));

    expect(await screen.findByText(/format de fichier non supporté/i)).toBeInTheDocument();
    expect(svc.initiateVideoUploadByType).not.toHaveBeenCalled();
  });

  it('rejette un fichier > 500 MB', async () => {
    const user = userEvent.setup();
    renderWithProviders(<VideoUpload candidateId="c1" videoType="INTERVIEW" title="Vidéo d'entrevue" />);

    await user.upload(
      screen.getByLabelText(/sélectionner une vidéo/i),
      makeFile('huge.mp4', 'video/mp4', 600 * 1024 * 1024)
    );

    expect(await screen.findByText(/trop volumineux/i)).toBeInTheDocument();
  });

  it('upload : appelle les endpoints TYPÉS (initiate → put → complete) avec le bon type', async () => {
    svc.initiateVideoUploadByType.mockResolvedValue({
      success: true,
      data: { signedUrl: 'https://r2/put', key: 'videos/x.mp4', provider: 'r2', expiresIn: 3600 },
    });
    svc.uploadFileToUrl.mockResolvedValue(undefined);
    svc.completeVideoUploadByType.mockResolvedValue({ success: true });
    const onUploadSuccess = vi.fn();
    const user = userEvent.setup();

    renderWithProviders(
      <VideoUpload candidateId="c1" videoType="PRESENTATION" title="Vidéo de présentation" onUploadSuccess={onUploadSuccess} />
    );

    await user.upload(screen.getByLabelText(/sélectionner une vidéo/i), makeFile('clip.mp4', 'video/mp4'));
    await user.click(screen.getByRole('button', { name: /uploader la vidéo/i }));

    await waitFor(() =>
      expect(svc.completeVideoUploadByType).toHaveBeenCalledWith('c1', 'PRESENTATION', 'videos/x.mp4')
    );
    expect(svc.initiateVideoUploadByType).toHaveBeenCalledWith('c1', 'PRESENTATION', 'clip.mp4', 'video/mp4');
  });

  it('suppression confirmée → appelle deleteVideoByType avec le type', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    svc.deleteVideoByType.mockResolvedValue({ success: true, message: 'ok' });
    const user = userEvent.setup();

    renderWithProviders(
      <VideoUpload candidateId="c1" videoType="INTERVIEW" title="Vidéo d'entrevue" hasVideo />
    );

    await user.click(screen.getByRole('button', { name: /supprimer la vidéo/i }));

    await waitFor(() => expect(svc.deleteVideoByType).toHaveBeenCalledWith('c1', 'INTERVIEW'));
  });

  it('suppression annulée (confirm=false) → n\'appelle pas le service', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    const user = userEvent.setup();

    renderWithProviders(
      <VideoUpload candidateId="c1" videoType="INTERVIEW" title="Vidéo d'entrevue" hasVideo />
    );

    await user.click(screen.getByRole('button', { name: /supprimer la vidéo/i }));
    expect(svc.deleteVideoByType).not.toHaveBeenCalled();
  });
});
