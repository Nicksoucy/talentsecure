import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderWithProviders, screen, waitFor, userEvent } from '@/test/renderWithProviders';
import { Routes, Route } from 'react-router-dom';
import VideoUploadPage from './VideoUploadPage';
import { publicVideoService } from '@/services/public-video.service';

/**
 * Page publique de téléversement de la vidéo de présentation.
 *
 * Le candidat arrive ici depuis la redirection du formulaire GoHighLevel (ou un
 * SMS de rappel) : pas de compte, pas de session. Toute la logique d'accès vit
 * côté serveur — ici on vérifie surtout que chaque état a un message clair, et
 * que la garde de taille protège avant même de contacter le serveur.
 */

vi.mock('@/services/public-video.service', () => ({
  publicVideoService: {
    getSession: vi.fn(),
    upload: vi.fn(),
  },
}));

// VideoRecorder pilote getUserMedia + MediaRecorder, absents de jsdom.
// Mock léger : un bouton qui produit un blob, pour tester le branchement.
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

const getSession = vi.mocked(publicVideoService.getSession);
const upload = vi.mocked(publicVideoService.upload);

const MAX_BYTES = 500 * 1024 * 1024;

function renderAt(query = '?c=ghlContact0001') {
  return renderWithProviders(
    <Routes>
      <Route path="/ma-video" element={<VideoUploadPage />} />
    </Routes>,
    { route: `/ma-video${query}` }
  );
}

/** Crée un File dont on force la taille (impossible d'allouer 600 Mo en test). */
function fileOfSize(bytes: number, name = 'video.mp4', type = 'video/mp4'): File {
  const file = new File(['x'], name, { type });
  Object.defineProperty(file, 'size', { value: bytes });
  return file;
}

beforeEach(() => {
  vi.clearAllMocks();
  getSession.mockResolvedValue({ firstName: 'Amélie', alreadyUploaded: false, maxBytes: MAX_BYTES });
});

describe('VideoUploadPage', () => {
  describe('validité du lien', () => {
    it('sans identifiant dans l’URL → message de lien invalide, aucun appel réseau', async () => {
      renderAt('');

      expect(await screen.findByText(/lien n'est plus valide/i)).toBeInTheDocument();
      expect(getSession).not.toHaveBeenCalled();
    });

    it('lien refusé par le serveur → message de lien invalide', async () => {
      getSession.mockRejectedValue({ response: { status: 404 } });
      renderAt();

      expect(await screen.findByText(/lien n'est plus valide/i)).toBeInTheDocument();
    });

    it('service indisponible (503) → dit que le lien reste valide, pas le contraire', async () => {
      getSession.mockRejectedValue({ response: { status: 503 } });
      renderAt();

      expect(await screen.findByText(/momentanément indisponible/i)).toBeInTheDocument();
      expect(screen.queryByText(/n'est plus valide/i)).not.toBeInTheDocument();
    });

    it('accepte le paramètre contact_id ajouté par GoHighLevel', async () => {
      renderAt('?contact_id=ghlContact0002');

      await waitFor(() => expect(getSession).toHaveBeenCalledWith('ghlContact0002'));
    });

    it('affiche un indicateur pendant la vérification du lien', () => {
      getSession.mockReturnValue(new Promise(() => {}));
      renderAt();

      expect(screen.getByRole('progressbar')).toBeInTheDocument();
    });
  });

  describe('affichage', () => {
    it('salue le candidat par son prénom', async () => {
      renderAt();

      expect(await screen.findByText(/Bonjour Amélie/)).toBeInTheDocument();
    });

    it('sans prénom connu, reste neutre plutôt que d’afficher un trou', async () => {
      getSession.mockResolvedValue({ firstName: null, alreadyUploaded: false, maxBytes: MAX_BYTES });
      renderAt();

      expect(await screen.findByText(/Dernière étape/)).toBeInTheDocument();
    });

    it('vidéo déjà reçue → écran de confirmation, pas de formulaire', async () => {
      getSession.mockResolvedValue({ firstName: 'Amélie', alreadyUploaded: true, maxBytes: MAX_BYTES });
      renderAt();

      expect(await screen.findByText(/déjà parvenue/i)).toBeInTheDocument();
      expect(screen.queryByText(/Choisir ma vidéo/)).not.toBeInTheDocument();
    });
  });

  describe('téléversement d’un fichier', () => {
    it('fichier au-delà de la limite → refusé côté client, aucun envoi tenté', async () => {
      renderAt();
      await screen.findByText(/Bonjour Amélie/);

      const input = screen.getByTestId('public-video-input');
      await userEvent.upload(input, fileOfSize(MAX_BYTES + 1));

      expect(await screen.findByText(/au-delà de la limite/i)).toBeInTheDocument();
      expect(upload).not.toHaveBeenCalled();
    });

    it('fichier valide → envoi puis écran de confirmation', async () => {
      upload.mockResolvedValue({ attached: true });
      renderAt();
      await screen.findByText(/Bonjour Amélie/);

      const file = fileOfSize(5_000_000);
      await userEvent.upload(screen.getByTestId('public-video-input'), file);

      await waitFor(() =>
        expect(upload).toHaveBeenCalledWith(
          'ghlContact0001',
          file,
          'video.mp4',
          expect.any(Function)
        )
      );
      expect(await screen.findByText(/Vidéo bien reçue/i)).toBeInTheDocument();
    });

    it('échec réseau → message actionnable, le formulaire reste disponible', async () => {
      upload.mockRejectedValue(new Error('boom'));
      renderAt();
      await screen.findByText(/Bonjour Amélie/);

      await userEvent.upload(screen.getByTestId('public-video-input'), fileOfSize(1_000_000));

      expect(await screen.findByText(/n'a pas abouti/i)).toBeInTheDocument();
      expect(screen.getByText(/Choisir ma vidéo/)).toBeInTheDocument();
    });

    it('remonte le message d’erreur du serveur quand il y en a un', async () => {
      upload.mockRejectedValue({
        response: { data: { message: "Ce fichier n'est pas une vidéo valide." } },
      });
      renderAt();
      await screen.findByText(/Bonjour Amélie/);

      await userEvent.upload(screen.getByTestId('public-video-input'), fileOfSize(1_000_000));

      expect(await screen.findByText(/pas une vidéo valide/i)).toBeInTheDocument();
    });
  });

  describe('enregistrement dans le navigateur', () => {
    it('la vidéo enregistrée suit le même chemin d’envoi que le fichier', async () => {
      upload.mockResolvedValue({ attached: false });
      renderAt();
      await screen.findByText(/Bonjour Amélie/);

      await userEvent.click(screen.getByRole('tab', { name: /Enregistrer maintenant/i }));
      await userEvent.click(await screen.findByText(/Simuler un enregistrement/));

      await waitFor(() =>
        expect(upload).toHaveBeenCalledWith(
          'ghlContact0001',
          expect.any(Blob),
          'presentation.webm',
          expect.any(Function)
        )
      );
      expect(await screen.findByText(/Vidéo bien reçue/i)).toBeInTheDocument();
    });
  });
});
