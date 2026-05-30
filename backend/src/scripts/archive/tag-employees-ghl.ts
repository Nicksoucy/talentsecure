/**
 * Applique dans GHL un tag selon le statut de l'employé :
 *   - ACTIF   -> "employer xguard actif"
 *   - INACTIF -> "employer xguard archiver"
 * Matching contact GHL par email.
 *
 * Options:
 *   --apply        applique réellement (sinon dry-run)
 *   --limit=N      ne traiter que les N premiers (échantillon)
 */
import { PrismaClient } from '@prisma/client';
import axios from 'axios';

const prisma = new PrismaClient();
const APPLY = process.argv.includes('--apply');
const limitArg = process.argv.find((a) => a.startsWith('--limit='));
const LIMIT = limitArg ? parseInt(limitArg.split('=')[1], 10) : 0;

const TOKEN = 'pit-7de455ab-c46e-47a4-af9e-0b07a6c3a1ee';
const LOC = 'dfkLurZY2ADWAUZl4zYc';
const BASE = 'https://services.leadconnectorhq.com';
const H = { Authorization: `Bearer ${TOKEN}`, Version: '2021-07-28' };

const TAG_ACTIF = 'employer xguard actif';
const TAG_ARCHIVE = 'employer xguard archiver';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function findContact(email: string): Promise<{ id: string; tags: string[] } | null> {
  try {
    const r = await axios.get(`${BASE}/contacts/search/duplicate`, {
      params: { locationId: LOC, email },
      headers: H,
      timeout: 20000,
    });
    const c = r.data?.contact;
    if (c?.id) return { id: c.id, tags: (c.tags || []).map((t: string) => t.toLowerCase()) };
    return null;
  } catch {
    return null;
  }
}

async function addTag(contactId: string, tag: string): Promise<boolean> {
  try {
    const r = await axios.post(
      `${BASE}/contacts/${contactId}/tags`,
      { tags: [tag] },
      { headers: { ...H, 'Content-Type': 'application/json' }, timeout: 20000 }
    );
    return r.status >= 200 && r.status < 300;
  } catch {
    return false;
  }
}

async function main() {
  let employees = await prisma.employee.findMany({
    where: { isDeleted: false, email: { not: null } },
    select: { email: true, status: true },
    orderBy: { createdAt: 'asc' },
  });
  if (LIMIT > 0) employees = employees.slice(0, LIMIT);

  console.log(`\n=== TAG EMPLOYÉS GHL ${APPLY ? '(APPLIQUÉ)' : '(DRY-RUN)'} ${LIMIT ? '[échantillon ' + LIMIT + ']' : ''} ===`);
  console.log(`${employees.length} employés à traiter\n`);

  let taggedActif = 0, taggedArch = 0, already = 0, notFound = 0, errors = 0;

  for (let i = 0; i < employees.length; i++) {
    const e = employees[i];
    const email = (e.email || '').trim();
    const tag = e.status === 'ACTIF' ? TAG_ACTIF : TAG_ARCHIVE;

    const contact = await findContact(email);
    if (!contact) { notFound++; await sleep(120); continue; }

    if (contact.tags.includes(tag.toLowerCase())) { already++; await sleep(80); continue; }

    if (APPLY) {
      const ok = await addTag(contact.id, tag);
      if (!ok) { errors++; await sleep(150); continue; }
    }
    if (e.status === 'ACTIF') taggedActif++; else taggedArch++;

    if ((i + 1) % 100 === 0) {
      console.log(`  …${i + 1}/${employees.length} (actif:${taggedActif} arch:${taggedArch} déjà:${already} introuvable:${notFound})`);
    }
    await sleep(140);
  }

  console.log(`\n--- RÉSULTAT ---`);
  console.log(`Taggés "${TAG_ACTIF}"     : ${taggedActif}`);
  console.log(`Taggés "${TAG_ARCHIVE}"  : ${taggedArch}`);
  console.log(`Déjà taggés (ignorés)         : ${already}`);
  console.log(`Contact GHL introuvable       : ${notFound}`);
  console.log(`Erreurs                       : ${errors}`);
  if (!APPLY) console.log(`\n(Relancer avec --apply pour appliquer)`);

  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
