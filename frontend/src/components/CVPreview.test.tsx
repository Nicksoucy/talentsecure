import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderWithProviders, screen, waitFor } from '@/test/renderWithProviders';

// On mocke le service api : le composant l'utilise UNIQUEMENT pour les URLs
// cross-origin (proxy /api/prospects/cv-proxy). Les URLs same-origin passent
// par `fetch` global, qu'on stub par test.
vi.mock('@/services/api', () => ({
  default: { get: vi.fn() },
}));

// docx-preview est importé dynamiquement et écrit dans le DOM : on le neutralise
// pour ne pas dépendre de sa logique de rendu réelle.
vi.mock('docx-preview', () => ({
  renderAsync: vi.fn().mockResolvedValue(undefined),
}));

import CVPreview from './CVPreview';
import api from '@/services/api';

const apiGet = api.get as unknown as ReturnType<typeof vi.fn>;

// L'origine jsdom est http://localhost:3000 → une URL relative ou localhost est
// same-origin et passe par fetch.
const SAME_ORIGIN_URL = '/api/candidates/c1/cv/download';
const CROSS_ORIGIN_URL = 'https://cdn.gohighlevel.com/files/abc123';

/**
 * jsdom n'implémente PAS `Blob.prototype.arrayBuffer()` (ni sur les Blob issus
 * de `slice`). CVPreview en dépend (lecture des magic bytes via
 * `blob.slice(0, 16).arrayBuffer()`), y compris sur les Blob qu'il crée lui-même
 * pour la voie proxy. On polyfill le prototype pour couvrir les deux chemins.
 */
function polyfillBlobArrayBuffer(): void {
  const proto = Blob.prototype as unknown as { arrayBuffer?: () => Promise<ArrayBufferLike> };
  if (!proto.arrayBuffer) {
    proto.arrayBuffer = function arrayBuffer(this: Blob) {
      // Octets mémorisés par blobWithMagic (slice perd le contenu en jsdom)…
      const memo = (this as unknown as { __bytes?: Uint8Array }).__bytes;
      if (memo) return Promise.resolve(memo.buffer);
      // …sinon (Blob créé par le composant lui-même, voie proxy) on lit via
      // FileReader, que jsdom implémente.
      return new Promise<ArrayBuffer>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as ArrayBuffer);
        reader.onerror = () => reject(reader.error);
        reader.readAsArrayBuffer(this);
      });
    };
  }
}

/** Construit un Blob réel dont les premiers octets sont les magic bytes. */
function blobWithMagic(magic: number[], type = 'application/octet-stream'): Blob {
  const bytes = new Uint8Array(16);
  bytes.set(magic);
  const blob = new Blob([bytes], { type });
  // Mémorise les octets pour que le polyfill arrayBuffer les restitue, y compris
  // après slice (qui, en jsdom, perd le contenu).
  (blob as unknown as { __bytes: Uint8Array }).__bytes = bytes;
  const origSlice = blob.slice.bind(blob);
  (blob as unknown as { slice: Blob['slice'] }).slice = ((
    start?: number,
    end?: number,
    sliceType?: string,
  ) => {
    const sliced = origSlice(start, end, sliceType);
    (sliced as unknown as { __bytes: Uint8Array }).__bytes = bytes;
    return sliced;
  }) as Blob['slice'];
  return blob;
}

/** Stub global.fetch pour renvoyer le blob donné (réponse OK). */
function stubFetchOk(blob: Blob): void {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({ ok: true, status: 200, blob: () => Promise.resolve(blob) }),
  );
}

const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46]; // %PDF
const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47]; // PNG
const DOC_MAGIC = [0xd0, 0xcf, 0x11, 0xe0]; // OLE (Word 97-2003)

const createObjectURL = vi.fn(() => 'blob:mock-url');
const revokeObjectURL = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  polyfillBlobArrayBuffer();
  // URL.createObjectURL n'existe pas en jsdom : on ajoute UNIQUEMENT les méthodes
  // statiques (le constructeur reste intact — isSameOrigin fait `new URL(...)`).
  (URL as unknown as { createObjectURL: unknown }).createObjectURL = createObjectURL;
  (URL as unknown as { revokeObjectURL: unknown }).revokeObjectURL = revokeObjectURL;
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete (URL as unknown as { createObjectURL?: unknown }).createObjectURL;
  delete (URL as unknown as { revokeObjectURL?: unknown }).revokeObjectURL;
});

describe('CVPreview', () => {
  it('URL same-origin + magic bytes PDF → rend un iframe titré (pas de proxy)', async () => {
    stubFetchOk(blobWithMagic(PDF_MAGIC));

    const { container } = renderWithProviders(
      <CVPreview url={SAME_ORIGIN_URL} fileName="cv-jean.pdf" />,
    );

    await waitFor(() => {
      const iframe = container.querySelector('iframe');
      expect(iframe).toBeTruthy();
      expect(iframe).toHaveAttribute('title', 'cv-jean.pdf');
      expect(iframe).toHaveAttribute('src', 'blob:mock-url');
    });

    // Same-origin : on ne passe PAS par le proxy axios.
    expect(apiGet).not.toHaveBeenCalled();
    expect(global.fetch).toHaveBeenCalledWith(SAME_ORIGIN_URL, { credentials: 'include' });
  });

  it('magic bytes PNG → rend une image avec alt = fileName', async () => {
    stubFetchOk(blobWithMagic(PNG_MAGIC, 'image/png'));

    renderWithProviders(<CVPreview url={SAME_ORIGIN_URL} fileName="scan-cv.png" />);

    const img = await screen.findByRole('img', { name: 'scan-cv.png' });
    expect(img).toHaveAttribute('src', 'blob:mock-url');
  });

  it('format legacy .doc (OLE) → alerte info « .doc … n\'est pas supporté »', async () => {
    stubFetchOk(blobWithMagic(DOC_MAGIC, 'application/msword'));

    renderWithProviders(<CVPreview url={SAME_ORIGIN_URL} />);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/\.doc/);
    expect(alert).toHaveTextContent(/n'est pas supporté en aperçu/i);
  });

  it('format inconnu (octets non reconnus, type vide) → alerte « Format non reconnu »', async () => {
    // Octets quelconques, content-type vide, URL sans extension → unsupported.
    stubFetchOk(blobWithMagic([0x00, 0x01, 0x02, 0x03], ''));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    renderWithProviders(<CVPreview url={SAME_ORIGIN_URL} />);

    expect(await screen.findByText(/Format non reconnu/i)).toBeInTheDocument();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('réponse HTTP non-ok → alerte d\'avertissement « Aperçu indisponible »', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 403, blob: () => Promise.resolve(new Blob()) }),
    );

    renderWithProviders(<CVPreview url={SAME_ORIGIN_URL} />);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/Aperçu indisponible/i);
    expect(alert).toHaveTextContent(/HTTP 403/);
  });

  it('URL cross-origin → route via le proxy axios et rend le PDF reçu', async () => {
    // arraybuffer contenant les magic bytes PDF.
    const buf = new Uint8Array(16);
    buf.set(PDF_MAGIC);
    apiGet.mockResolvedValue({
      data: buf.buffer,
      headers: { 'content-type': 'application/pdf' },
    });
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    const { container } = renderWithProviders(
      <CVPreview url={CROSS_ORIGIN_URL} fileName="externe.pdf" />,
    );

    await waitFor(() => expect(container.querySelector('iframe')).toBeTruthy());

    expect(apiGet).toHaveBeenCalledWith('/api/prospects/cv-proxy', {
      params: { url: CROSS_ORIGIN_URL },
      responseType: 'arraybuffer',
    });
    // Cross-origin : on n'utilise jamais fetch direct.
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
