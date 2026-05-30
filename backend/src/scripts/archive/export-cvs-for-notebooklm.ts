/**
 * Exporte les CVs des prospects créés depuis une date donnée vers un dossier
 * local, fichiers numérotés (01_Prenom_Nom.ext) — prêts pour NotebookLM.
 *
 * Gère le "soft-redirect" GoHighLevel : /documents/download renvoie
 * 200 + text/plain "Temporary Redirect. Redirecting to https://storage..."
 * au lieu d'un vrai 302.
 */
import { PrismaClient } from '@prisma/client';
import https from 'https';
import http from 'http';
import fs from 'fs';
import path from 'path';

const prisma = new PrismaClient();

const SINCE = new Date('2026-05-06T00:00:00Z'); // 6 mai inclus
const OUT_DIR = 'C:\\Users\\nicol\\cv xguard\\data\\cvs_notebooklm_06-19mai';

function sanitize(s: string): string {
  return (s || '')
    .replace(/[<>:"/\\|?*]/g, '')
    .trim()
    .replace(/\s+/g, '_')
    .slice(0, 50);
}

interface FetchResult {
  buffer: Buffer;
  contentType: string;
  contentDisposition: string;
}

function fetchFollow(url: string, redirectsLeft = 6): Promise<FetchResult> {
  return new Promise((resolve, reject) => {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return reject(new Error('URL invalide'));
    }
    const client = parsed.protocol === 'http:' ? http : https;
    const req = client.get(
      url,
      { headers: { 'User-Agent': 'Mozilla/5.0' } },
      (res) => {
        const status = res.statusCode ?? 0;

        // Vrai redirect HTTP
        if (status >= 300 && status < 400 && res.headers.location) {
          res.resume();
          if (redirectsLeft <= 0) return reject(new Error('Trop de redirections'));
          const next = new URL(res.headers.location, url).toString();
          return resolve(fetchFollow(next, redirectsLeft - 1));
        }
        if (status >= 400) {
          res.resume();
          return reject(new Error(`HTTP ${status}`));
        }

        const ct = (res.headers['content-type'] || '').toLowerCase();
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => {
          const body = Buffer.concat(chunks);

          // Soft-redirect GHL : 200 + text/plain "Redirecting to <url>"
          if (ct.startsWith('text/plain') && body.length < 8192) {
            const m = body.toString('utf-8').match(/https?:\/\/\S+/);
            if (m && redirectsLeft > 0) {
              const next = m[0].replace(/[)\].,;]+$/, '');
              return resolve(fetchFollow(next, redirectsLeft - 1));
            }
          }
          resolve({
            buffer: body,
            contentType: ct,
            contentDisposition: (res.headers['content-disposition'] as string) || '',
          });
        });
      },
    );
    req.on('error', reject);
    req.setTimeout(60_000, () => req.destroy(new Error('Timeout')));
  });
}

function pickExt(ct: string, cd: string, buf: Buffer): string {
  // Content-Disposition filename a priorité
  const m = cd.match(/filename[*]?=(?:UTF-8'')?"?([^";]+)"?/i);
  if (m) {
    const ext = path.extname(decodeURIComponent(m[1]));
    if (ext) return ext.toLowerCase();
  }
  // Magic bytes
  if (buf.length >= 4) {
    if (buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46) return '.pdf';
    if (buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04) return '.docx';
    if (buf[0] === 0xd0 && buf[1] === 0xcf && buf[2] === 0x11 && buf[3] === 0xe0) return '.doc';
    if (buf[0] === 0xff && buf[1] === 0xd8) return '.jpg';
    if (buf[0] === 0x89 && buf[1] === 0x50) return '.png';
  }
  // Content-Type
  if (ct.includes('pdf')) return '.pdf';
  if (ct.includes('wordprocessingml') || ct.includes('officedocument')) return '.docx';
  if (ct.includes('msword')) return '.doc';
  if (ct.includes('png')) return '.png';
  if (ct.includes('jpeg') || ct.includes('jpg')) return '.jpg';
  return '.bin';
}

async function run() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const prospects = await prisma.prospectCandidate.findMany({
    where: { isDeleted: false, cvUrl: { not: null }, createdAt: { gte: SINCE } },
    orderBy: { createdAt: 'asc' },
    select: { firstName: true, lastName: true, email: true, phone: true, cvUrl: true, createdAt: true },
  });

  console.log(`\n${prospects.length} CVs à exporter depuis le ${SINCE.toISOString().slice(0, 10)}`);
  console.log(`Dossier: ${OUT_DIR}\n`);

  const manifest: string[] = ['num,prenom,nom,email,telephone,date_creation,fichier,taille_ko,erreur'];
  let ok = 0;
  let fail = 0;

  for (let i = 0; i < prospects.length; i++) {
    const p = prospects[i];
    const num = String(i + 1).padStart(2, '0');
    const base = `${num}_${sanitize(p.firstName)}_${sanitize(p.lastName)}`;
    process.stdout.write(`[${num}/${prospects.length}] ${p.firstName} ${p.lastName} ... `);
    try {
      const r = await fetchFollow(p.cvUrl!);
      const ext = pickExt(r.contentType, r.contentDisposition, r.buffer);
      const fileName = `${base}${ext}`;
      fs.writeFileSync(path.join(OUT_DIR, fileName), r.buffer);
      const kb = Math.round(r.buffer.length / 1024);
      console.log(`OK ${ext} ${kb}Ko`);
      manifest.push(
        `${num},"${p.firstName}","${p.lastName}","${p.email || ''}","${p.phone || ''}",${p.createdAt.toISOString().slice(0, 10)},${fileName},${kb},`,
      );
      ok++;
    } catch (e: any) {
      console.log(`ERREUR: ${e.message}`);
      manifest.push(
        `${num},"${p.firstName}","${p.lastName}","${p.email || ''}","${p.phone || ''}",${p.createdAt.toISOString().slice(0, 10)},,,"${e.message}"`,
      );
      fail++;
    }
  }

  fs.writeFileSync(path.join(OUT_DIR, '_manifest.csv'), manifest.join('\n'), 'utf-8');
  console.log(`\n✅ Terminé : ${ok} réussis, ${fail} échoués`);
  console.log(`📄 Manifeste : ${path.join(OUT_DIR, '_manifest.csv')}`);

  await prisma.$disconnect();
}

run().catch((e) => {
  console.error('Erreur fatale:', e);
  process.exit(1);
});
