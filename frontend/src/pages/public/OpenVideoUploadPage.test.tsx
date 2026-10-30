import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderWithProviders, screen, userEvent } from '@/test/renderWithProviders';
import { Routes, Route } from 'react-router-dom';
import OpenVideoUploadPage from './OpenVideoUploadPage';
import { publicVideoService } from '@/services/public-video.service';

/**
 * Lien vidéo général (/video) : aucun identifiant dans l'adresse, le candidat
 * donne son nom et son téléphone avant d'envoyer sa vidéo.
 */

vi.mock('@/services/public-video.service', () => ({
  publicVideoService: {
    getSession: vi.fn(),
    upload: vi.fn(),
    uploadOpen: vi.fn(),
  },
}));

vi.mock('@/components/video/VideoRecorder', () => ({
  default: () => null,
}));

const uploadOpen = vi.mocked(publicVideoService.uploadOpen);

function renderPage() {
  return renderWithProviders(
    <Routes>
      <Route path="/video" element={<OpenVideoUploadPage />} />
    </Routes>,
    { route: '/video' }
  );
}

function fileOfSize(bytes: number, name = 'video.mp4', type = 'video/mp4'): File {
  const file = new File(['x'], name, { type });
  Object.defineProperty(file, 'size', { value: bytes });
  return file;
}

async function fillContact(phone = '514 555-1234', email = '') {
  await userEvent.type(screen.getByLabelText(/Prénom/), 'Karim');
  await userEvent.type(screen.getByLabelText(/^Nom/), 'Benali');
  await userEvent.type(screen.getByLabelText(/Téléphone/), phone);
  if (email) await userEvent.type(screen.getByLabelText(/Courriel/), email);
  await userEvent.click(screen.getByRole('button', { name: /Continuer/ }));
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('OpenVideoUploadPage — lien général /video', () => {
  it("demande les coordonnées avant de montrer l'envoi", () => {
    renderPage();
    expect(screen.getByText(/Envoyez-nous votre vidéo/)).toBeInTheDocument();
    expect(screen.queryByTestId('public-video-input')).not.toBeInTheDocument();
  });

  it('téléphone incomplet → message, on reste sur le formulaire', async () => {
    renderPage();
    await fillContact('514 555');
    expect(screen.getByText(/10 chiffres/)).toBeInTheDocument();
    expect(screen.queryByTestId('public-video-input')).not.toBeInTheDocument();
  });

  it('courriel mal formé → message', async () => {
    renderPage();
    await fillContact('514 555-1234', 'karim@');
    expect(screen.getByText(/ne semble pas valide/)).toBeInTheDocument();
  });

  it('coordonnées valides → envoi avec ces coordonnées, puis confirmation', async () => {
    uploadOpen.mockResolvedValue({ attached: true });
    renderPage();
    await fillContact('514 555-1234', 'karim@example.com');

    expect(screen.getByText(/Merci Karim/)).toBeInTheDocument();
    await userEvent.upload(screen.getByTestId('public-video-input'), fileOfSize(1_000_000));

    expect(uploadOpen).toHaveBeenCalledWith(
      { firstName: 'Karim', lastName: 'Benali', phone: '514 555-1234', email: 'karim@example.com' },
      expect.any(File),
      'video.mp4',
      expect.any(Function)
    );
    expect(await screen.findByText(/Vidéo bien reçue/)).toBeInTheDocument();
  });

  it('courriel laissé vide → non transmis', async () => {
    uploadOpen.mockResolvedValue({ attached: true });
    renderPage();
    await fillContact();
    await userEvent.upload(screen.getByTestId('public-video-input'), fileOfSize(1_000_000));
    expect(uploadOpen.mock.calls[0][0].email).toBeUndefined();
  });

  it('vidéo au-delà de 500 Mo → refusée avant tout appel au serveur', async () => {
    renderPage();
    await fillContact();
    await userEvent.upload(screen.getByTestId('public-video-input'), fileOfSize(600 * 1024 * 1024));
    expect(screen.getByText(/au-delà de la limite/)).toBeInTheDocument();
    expect(uploadOpen).not.toHaveBeenCalled();
  });

  it("remonte le message d'erreur du serveur", async () => {
    uploadOpen.mockRejectedValue({ response: { data: { message: 'Numéro de téléphone invalide' } } });
    renderPage();
    await fillContact();
    await userEvent.upload(screen.getByTestId('public-video-input'), fileOfSize(1_000_000));
    expect(await screen.findByText(/Numéro de téléphone invalide/)).toBeInTheDocument();
  });

  it('« Modifier mes coordonnées » ramène au formulaire, rempli', async () => {
    renderPage();
    await fillContact();
    await userEvent.click(screen.getByRole('button', { name: /Modifier mes coordonnées/ }));
    expect(screen.getByLabelText(/Prénom/)).toHaveValue('Karim');
  });
});
