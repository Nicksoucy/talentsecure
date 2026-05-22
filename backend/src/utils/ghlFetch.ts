import https from 'https';
import http from 'http';

export interface GhlFile {
  buffer: Buffer;
  contentType: string;
  contentDisposition: string;
}

const MAX_REDIRECTS = 6;
const MAX_SOFT_REDIRECT_BODY = 8 * 1024;

/**
 * Télécharge un fichier hébergé par GHL / un CDN, en gérant :
 *  - les vrais redirects HTTP 3xx (Location)
 *  - le "soft-redirect" GoHighLevel : /documents/download renvoie
 *    200 + Content-Type text/plain + body "Temporary Redirect.
 *    Redirecting to https://storage.googleapis.com/...".
 *
 * Retourne le contenu en mémoire (Buffer) + le content-type final.
 * Utilisé par le proxy CV (streaming) et par la synchro survey (upload R2).
 */
export function downloadGhlFile(url: string, redirectsLeft = MAX_REDIRECTS): Promise<GhlFile> {
  return new Promise((resolve, reject) => {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return reject(new Error('URL invalide'));
    }
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      return reject(new Error('Seules les URLs http(s) sont acceptées'));
    }

    const client = parsed.protocol === 'https:' ? https : http;
    const req = client.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
      const status = res.statusCode ?? 0;

      // Vrai redirect HTTP
      if (status >= 300 && status < 400 && res.headers.location) {
        res.resume();
        if (redirectsLeft <= 0) return reject(new Error('Trop de redirections'));
        const next = new URL(res.headers.location, url).toString();
        return resolve(downloadGhlFile(next, redirectsLeft - 1));
      }
      if (status >= 400) {
        res.resume();
        return reject(new Error(`Upstream a retourné ${status}`));
      }

      const ct = (res.headers['content-type'] || '').toLowerCase();
      const chunks: Buffer[] = [];
      let total = 0;
      let aborted = false;

      // Soft-redirect GHL : 200 + text/plain "Redirecting to <url>"
      const isMaybeSoftRedirect = ct.startsWith('text/plain');

      res.on('data', (c: Buffer) => {
        total += c.length;
        // Si c'est un soft-redirect, le body est petit ; on le borne.
        if (isMaybeSoftRedirect && total > MAX_SOFT_REDIRECT_BODY) {
          aborted = true;
          req.destroy(new Error('Soft-redirect body trop gros'));
          return;
        }
        chunks.push(c);
      });
      res.on('end', () => {
        if (aborted) return;
        const body = Buffer.concat(chunks);
        if (isMaybeSoftRedirect && body.length < MAX_SOFT_REDIRECT_BODY && redirectsLeft > 0) {
          const m = body.toString('utf-8').match(/https?:\/\/\S+/);
          if (m) {
            const next = m[0].replace(/[)\].,;]+$/, '');
            return resolve(downloadGhlFile(next, redirectsLeft - 1));
          }
        }
        resolve({
          buffer: body,
          contentType: res.headers['content-type'] || 'application/octet-stream',
          contentDisposition: (res.headers['content-disposition'] as string) || '',
        });
      });
    });

    req.on('error', reject);
    req.setTimeout(120_000, () => req.destroy(new Error('Timeout upstream')));
  });
}

/**
 * Vérifie que le contenu téléchargé est RÉELLEMENT une vidéo (et pas un
 * fichier renommé), via les magic bytes des conteneurs vidéo courants :
 *   - MP4 / MOV / M4V (ISO BMFF) : "ftyp" / atomes "moov"/"mdat"/"free"/"skip" à l'offset 4
 *   - WebM / Matroska : 1A 45 DF A3
 *   - AVI : "RIFF" ... "AVI "
 *   - MPEG-PS : 00 00 01 BA
 */
export function isLikelyVideo(buffer: Buffer): boolean {
  if (buffer.length < 12) return false;
  const ascii = (start: number, len: number) => buffer.toString('ascii', start, start + len);

  // MP4 / MOV : box type à l'offset 4
  const box = ascii(4, 4);
  if (['ftyp', 'moov', 'mdat', 'free', 'skip', 'wide'].includes(box)) return true;

  // WebM / Matroska (EBML)
  if (buffer[0] === 0x1a && buffer[1] === 0x45 && buffer[2] === 0xdf && buffer[3] === 0xa3) return true;

  // AVI : RIFF....AVI
  if (ascii(0, 4) === 'RIFF' && ascii(8, 4) === 'AVI ') return true;

  // MPEG program stream
  if (buffer[0] === 0x00 && buffer[1] === 0x00 && buffer[2] === 0x01 && buffer[3] === 0xba) return true;

  return false;
}

/**
 * Déduit une extension de fichier fiable : magic bytes d'abord, puis
 * Content-Disposition, puis Content-Type.
 */
export function detectExtension(file: GhlFile, originalName?: string): string {
  const b = file.buffer;
  if (b.length >= 4) {
    if (b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46) return '.pdf';
    if (b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04) return '.docx';
    if (b[0] === 0xd0 && b[1] === 0xcf && b[2] === 0x11 && b[3] === 0xe0) return '.doc';
    if (b[0] === 0xff && b[1] === 0xd8) return '.jpg';
    if (b[0] === 0x89 && b[1] === 0x50) return '.png';
  }
  const cd = file.contentDisposition || '';
  const m = cd.match(/filename[*]?=(?:UTF-8'')?"?([^";]+)"?/i);
  const fromName = (s: string) => {
    const dot = s.lastIndexOf('.');
    return dot >= 0 ? s.slice(dot).toLowerCase() : '';
  };
  if (m) {
    const ext = fromName(decodeURIComponent(m[1]));
    if (ext) return ext;
  }
  if (originalName) {
    const ext = fromName(originalName);
    if (ext) return ext;
  }
  const ct = (file.contentType || '').toLowerCase();
  if (ct.includes('pdf')) return '.pdf';
  if (ct.includes('wordprocessingml') || ct.includes('officedocument')) return '.docx';
  if (ct.includes('msword')) return '.doc';
  if (ct.includes('mp4')) return '.mp4';
  if (ct.includes('quicktime')) return '.mov';
  if (ct.includes('webm')) return '.webm';
  if (ct.includes('x-msvideo')) return '.avi';
  if (ct.includes('png')) return '.png';
  if (ct.includes('jpeg') || ct.includes('jpg')) return '.jpg';
  return '.bin';
}
