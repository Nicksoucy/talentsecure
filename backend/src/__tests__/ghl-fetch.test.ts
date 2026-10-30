import https from 'https';
import { PassThrough } from 'stream';
import { downloadGhlFile } from '../utils/ghlFetch';

/**
 * Téléchargement des fichiers GHL — src/utils/ghlFetch.ts
 *
 * L'URL arrive du webhook GHL (video_url) : seuls les hôtes de GHL et du
 * stockage Google sont suivis, à chaque saut, sinon le serveur pourrait être
 * envoyé vers une adresse interne (SSRF, alerte CodeQL js/request-forgery).
 * `https.get` est simulé : aucun appel réseau.
 */

type FakeResponse = { status: number; headers?: Record<string, string>; body?: string };

function mockHttps(responses: FakeResponse[]) {
  const queue = [...responses];
  return jest.spyOn(https, 'get').mockImplementation(((options: any, cb: any) => {
    const next = queue.shift()!;
    const res = Object.assign(new PassThrough(), { statusCode: next.status, headers: next.headers || {} });
    process.nextTick(() => {
      cb(res);
      res.end(Buffer.from(next.body || ''));
    });
    return { on: jest.fn(), setTimeout: jest.fn(), destroy: jest.fn() } as any;
  }) as any);
}

describe('downloadGhlFile — hôtes autorisés seulement', () => {
  afterEach(() => jest.restoreAllMocks());

  it.each([
    ['adresse de métadonnées', 'https://169.254.169.254/computeMetadata/v1/'],
    ['localhost', 'https://localhost:5000/api/admin'],
    ['site quelconque', 'https://evil.example.com/cv.pdf'],
    ['faux sous-domaine', 'https://services.leadconnectorhq.com.evil.com/x'],
  ])('refuse %s sans aucun appel réseau', async (_label, url) => {
    const get = mockHttps([]);
    await expect(downloadGhlFile(url)).rejects.toThrow(/Hôte non autorisé/);
    expect(get).not.toHaveBeenCalled();
  });

  it('refuse le http en clair', async () => {
    const get = mockHttps([]);
    await expect(downloadGhlFile('http://services.leadconnectorhq.com/documents/download/x')).rejects.toThrow(/https/);
    expect(get).not.toHaveBeenCalled();
  });

  it('suit la chaîne GHL → stockage Google (soft-redirect)', async () => {
    const get = mockHttps([
      { status: 200, headers: { 'content-type': 'text/plain' }, body: 'Temporary Redirect. Redirecting to https://storage.googleapis.com/msgsndr/cv.pdf' },
      { status: 200, headers: { 'content-type': 'application/pdf' }, body: '%PDF-1.4' },
    ]);
    const file = await downloadGhlFile('https://services.leadconnectorhq.com/documents/download/abc?x=1');
    expect(file.contentType).toBe('application/pdf');
    expect(file.buffer.toString()).toBe('%PDF-1.4');
    expect(get.mock.calls.map(([o]: any) => `${o.hostname}${o.path}`)).toEqual([
      'services.leadconnectorhq.com/documents/download/abc?x=1',
      'storage.googleapis.com/msgsndr/cv.pdf',
    ]);
  });

  it('refuse une redirection 3xx vers un hôte non autorisé', async () => {
    mockHttps([{ status: 302, headers: { location: 'https://169.254.169.254/latest/meta-data/' } }]);
    await expect(
      downloadGhlFile('https://services.leadconnectorhq.com/documents/download/abc')
    ).rejects.toThrow(/Hôte non autorisé/);
  });

  it('refuse un soft-redirect vers un hôte non autorisé', async () => {
    mockHttps([
      { status: 200, headers: { 'content-type': 'text/plain' }, body: 'Redirecting to https://evil.example.com/x' },
    ]);
    await expect(
      downloadGhlFile('https://services.leadconnectorhq.com/documents/download/abc')
    ).rejects.toThrow(/Hôte non autorisé/);
  });
});
