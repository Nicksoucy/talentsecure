import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderWithProviders, screen, userEvent, waitFor } from '@/test/renderWithProviders';

vi.mock('@/services/upload.service', () => ({
  uploadService: {
    uploadCV: vi.fn(),
    deleteCV: vi.fn(),
    getCVDownloadUrl: vi.fn(() => 'https://dl/cv'),
  },
}));
vi.mock('./CVPreview', () => ({ default: () => null }));

import CVUpload from './CVUpload';
import { uploadService } from '@/services/upload.service';

const svc = uploadService as unknown as Record<string, ReturnType<typeof vi.fn>>;

beforeEach(() => {
  vi.clearAllMocks();
});

function makeFile(name: string, type: string, sizeBytes = 1000) {
  const f = new File(['x'], name, { type });
  Object.defineProperty(f, 'size', { value: sizeBytes });
  return f;
}

describe('CVUpload', () => {
  it('sans CV → affiche la zone de dépôt', () => {
    renderWithProviders(<CVUpload candidateId="c1" />);
    expect(screen.getByText(/glissez-déposez votre cv/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /parcourir/i })).toBeInTheDocument();
  });

  it('avec CV → affiche « CV disponible » (et pas la zone de dépôt)', () => {
    renderWithProviders(
      <CVUpload candidateId="c1" currentCV={{ cvUrl: 'https://x/cv.pdf', cvStoragePath: 'cv.pdf' }} />
    );
    expect(screen.getByText(/cv disponible/i)).toBeInTheDocument();
    expect(screen.queryByText(/glissez-déposez/i)).not.toBeInTheDocument();
  });

  it('upload d\'un PDF valide → uploadService.uploadCV(candidateId, file)', async () => {
    svc.uploadCV.mockResolvedValue({ success: true });
    const user = userEvent.setup();
    const { container } = renderWithProviders(<CVUpload candidateId="c1" />);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;

    await user.upload(input, makeFile('cv.pdf', 'application/pdf'));

    await waitFor(() => expect(svc.uploadCV).toHaveBeenCalledWith('c1', expect.any(File)));
  });

  it('type non autorisé → n\'appelle pas uploadCV', async () => {
    const user = userEvent.setup({ applyAccept: false });
    const { container } = renderWithProviders(<CVUpload candidateId="c1" />);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;

    await user.upload(input, makeFile('note.txt', 'text/plain'));

    expect(svc.uploadCV).not.toHaveBeenCalled();
  });
});
