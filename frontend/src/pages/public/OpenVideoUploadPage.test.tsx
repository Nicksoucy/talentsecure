import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderWithProviders, screen, userEvent } from '@/test/renderWithProviders';
import { Routes, Route } from 'react-router-dom';
import OpenVideoUploadPage from './OpenVideoUploadPage';
import { publicVideoService } from '@/services/public-video.service';

/**
 * Lien vidéo général (/video) : aucun identifiant dans l'adresse, le candidat
 * donne son nom, son téléphone et son courriel avant d'envoyer sa vidéo.
 */

vi.mock('@/services/public-video.service', () => ({
  publicVideoService: {
    getSession: vi.fn(),
    upload: vi.fn(),
    uploadOpen: vi.fn(),
  },
}));

// VideoRecorder pilote getUserMedia + MediaRecorder, absents de jsdom.
vi.mock('@/components/video/VideoRecorder', () => ({
  default: ({ onRecorded }: { onRecorded: (blob: Blob, filename: string) => void }) => (
    <button
      type="button"
      onClick={() => onRecorded(new Blob(['video'], { type: 'video/webm' }), 'presentation.webm')}
    >
      Simuler un enregistrement
    </button>
  ),
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

async function fillContact(phone = '514 555-1234', email = 'karim@example.com') {
  await userEvent.type(screen.getByLabelText(/Prénom/), 'Karim');
  await userEvent.type(screen.getByLabelText(/^Nom/), 'Benali');
  await userEvent.type(screen.getByLabelText(/Téléphone/), phone);
  if (email) await userEvent.type(screen.getByLabelText(/Courriel/), email);
  await userEvent.click(screen.getByRole('button', { name: /Continuer/ }));
}

/** « Enregistrer maintenant » est ouvert d'office : le fichier est au 2e onglet. */
async function goToFileTab() {
  await userEvent.click(screen.getByRole('tab', { name: /Téléverser un fichier/i }));
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('OpenVideoUploadPage — lien général /video', () => {
  it("demande les coordonnées avant de montrer l'envoi", () => {
    renderPage();
    expect(screen.getByText(/Montrez-nous qui vous êtes/)).toBeInTheDocument();
    expect(screen.getByLabelText('Étape 1 sur 3')).toBeInTheDocument();
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
    await goToFileTab();
    await userEvent.upload(screen.getByTestId('public-video-input'), fileOfSize(1_000_000));

    expect(uploadOpen).toHaveBeenCalledWith(
      { firstName: 'Karim', lastName: 'Benali', phone: '514 555-1234', email: 'karim@example.com' },
      expect.any(File),
      'video.mp4',
      expect.any(Function)
    );
    expect(await screen.findByText(/Vidéo bien reçue/)).toBeInTheDocument();
  });

  it("« Enregistrer maintenant » est le premier onglet, ouvert d'office", async () => {
    uploadOpen.mockResolvedValue({ attached: true });
    renderPage();
    await fillContact();

    const tabs = screen.getAllByRole('tab');
    expect(tabs[0]).toHaveTextContent('Enregistrer maintenant');
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true');

    await userEvent.click(screen.getByText('Simuler un enregistrement'));
    expect(uploadOpen).toHaveBeenCalledWith(
      expect.objectContaining({ firstName: 'Karim' }),
      expect.any(Blob),
      'presentation.webm',
      expect.any(Function)
    );
    expect(await screen.findByText(/Vidéo bien reçue/)).toBeInTheDocument();
  });

  it('courriel vide → message, on reste sur le formulaire', async () => {
    renderPage();
    await fillContact('514 555-1234', '');
    expect(screen.getByText('Votre courriel')).toBeInTheDocument();
    expect(screen.queryByTestId('public-video-input')).not.toBeInTheDocument();
  });

  it("l'étape avance : coordonnées → vidéo → fini", async () => {
    uploadOpen.mockResolvedValue({ attached: true });
    renderPage();
    await fillContact();
    expect(screen.getByLabelText('Étape 2 sur 3')).toBeInTheDocument();
    await goToFileTab();
    await userEvent.upload(screen.getByTestId('public-video-input'), fileOfSize(1_000_000));
    expect(await screen.findByLabelText('Étape 3 sur 3')).toBeInTheDocument();
  });

  it('vidéo au-delà de 500 Mo → refusée avant tout appel au serveur', async () => {
    renderPage();
    await fillContact();
    await goToFileTab();
    await userEvent.upload(screen.getByTestId('public-video-input'), fileOfSize(600 * 1024 * 1024));
    expect(screen.getByText(/au-delà de la limite/)).toBeInTheDocument();
    expect(uploadOpen).not.toHaveBeenCalled();
  });

  it("remonte le message d'erreur du serveur", async () => {
    uploadOpen.mockRejectedValue({ response: { data: { message: 'Numéro de téléphone invalide' } } });
    renderPage();
    await fillContact();
    await goToFileTab();
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
