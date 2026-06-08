/**
 * Classe chaque prospect + candidat par PROVINCE et produit un CSV de révision.
 * LECTURE SEULE — ne supprime rien. On garde QC + Ontario ; on marque pour
 * retrait les autres provinces canadiennes + l'étranger.
 *
 * Signal de province (par priorité) :
 *   1) code postal (1ʳᵉ lettre)  — le plus fiable, instantané
 *   2) géocodage de la ville (classifyProvince → Nominatim)
 * Filet de sécurité : pour les dossiers « à retirer » dont le CV est un PDF
 * (prospects GHL), on scanne le texte ; un code postal QC/ON dans le CV
 * « sauve » le dossier (→ GARDER). Les CV image/docx ou sur R2 (candidats) ne
 * sont pas lisibles ici → « à vérifier visuellement » (jamais supprimés auto).
 *
 *   npx ts-node src/scripts/classify-out-of-quebec.ts
 */
import * as fs from 'fs';
import { prisma } from '../config/database';
import { classifyProvince, ProvinceClass } from '../services/cityGeocode.service';
import { downloadGhlFile } from '../utils/ghlFetch';

const { PDFParse } = require('pdf-parse'); // v2 : classe, pas une fonction

type Decision = 'GARDER' | 'RETIRER' | 'A_VERIFIER';

function provinceFromPostal(pc?: string | null): ProvinceClass | null {
  if (!pc) return null;
  const c = pc.trim().toUpperCase()[0];
  if (!c) return null;
  if ('GHJ'.includes(c)) return 'QC';
  if ('KLMNP'.includes(c)) return 'ON';
  if ('ABCERSTVXY'.includes(c)) return 'other-CA';
  return null; // lettre invalide → on ne conclut pas
}

function decisionOf(p: ProvinceClass): Decision {
  if (p === 'QC' || p === 'ON') return 'GARDER';
  if (p === 'other-CA' || p === 'foreign') return 'RETIRER';
  return 'A_VERIFIER'; // unknown
}

// Code postal canadien QC/ON dans un texte de CV.
const QC_ON_POSTAL = /\b[GHJKLMNP]\d[A-Z]\s?\d[A-Z]\d\b/i;

interface Row {
  id: string;
  section: 'prospect' | 'candidat';
  firstName: string;
  lastName: string;
  city: string | null;
  postalCode: string | null;
  cvUrl: string | null;
  cvStoragePath: string | null;
}

async function scanCvForQcOn(row: Row): Promise<string> {
  // Candidats / CV sur R2 : pas de creds R2 en local → vérif visuelle dans l'app.
  if (row.cvStoragePath && !row.cvUrl) return 'CV sur R2 — vérifier dans l\'app';
  if (!row.cvUrl) return 'aucun CV';
  try {
    const f = await downloadGhlFile(row.cvUrl);
    const h = f.buffer.subarray(0, 4);
    const isPdf = h[0] === 0x25 && h[1] === 0x50 && h[2] === 0x44 && h[3] === 0x46;
    if (!isPdf) return 'CV image/doc — vérif visuelle';
    const result = await new PDFParse({ data: f.buffer }).getText();
    const text: string = result?.text || '';
    return QC_ON_POSTAL.test(text) ? 'CODE POSTAL QC/ON DANS LE CV' : 'PDF lu — aucun code postal QC/ON';
  } catch (e: any) {
    return `CV illisible (${e?.message || 'err'})`;
  }
}

function csvCell(v: any): string {
  return `"${String(v ?? '').replace(/"/g, '""')}"`;
}

async function run() {
  // URL de prod (le .env local pointe sur localhost — inutile dans le CSV).
  const FRONT = 'https://talentsecure-frontend-572017163659.northamerica-northeast1.run.app';

  const prospects = await prisma.prospectCandidate.findMany({
    where: { isDeleted: false, isConverted: false },
    select: { id: true, firstName: true, lastName: true, city: true, postalCode: true, cvUrl: true, cvStoragePath: true },
  });
  const candidates = await prisma.candidate.findMany({
    where: { isDeleted: false },
    select: { id: true, firstName: true, lastName: true, city: true, postalCode: true, cvUrl: true, cvStoragePath: true },
  });

  const rows: Row[] = [
    ...prospects.map((p) => ({ ...p, section: 'prospect' as const })),
    ...candidates.map((c) => ({ ...c, section: 'candidat' as const, cvStoragePath: (c as any).cvStoragePath ?? null })),
  ];

  console.log(`${rows.length} dossiers (${prospects.length} prospects + ${candidates.length} candidats)\n`);

  const out: string[] = [
    ['id', 'section', 'prenom', 'nom', 'ville', 'codePostal', 'province', 'decision', 'signalCV', 'lienFiche'].join(','),
  ];
  const counts: Record<Decision, number> = { GARDER: 0, RETIRER: 0, A_VERIFIER: 0 };

  for (const r of rows) {
    // 1) province via code postal, sinon ville
    let prov = provinceFromPostal(r.postalCode);
    if (!prov) prov = await classifyProvince(r.city || '');
    let decision = decisionOf(prov);

    // 2) filet CV : ne s'applique qu'aux dossiers « à retirer »
    let cvSignal = '';
    if (decision === 'RETIRER') {
      cvSignal = await scanCvForQcOn(r);
      if (cvSignal === 'CODE POSTAL QC/ON DANS LE CV') {
        decision = 'GARDER'; // le CV prouve qu'on est au QC/ON
      }
    }

    counts[decision]++;
    const link = r.section === 'prospect' ? `${FRONT}/prospects/${r.id}` : `${FRONT}/candidates/${r.id}`;
    out.push([
      csvCell(r.id), r.section, csvCell(r.firstName), csvCell(r.lastName), csvCell(r.city),
      csvCell(r.postalCode), prov, decision, csvCell(cvSignal), csvCell(link),
    ].join(','));
  }

  // RETIRER d'abord, puis A_VERIFIER, puis GARDER
  const order: Record<Decision, number> = { RETIRER: 0, A_VERIFIER: 1, GARDER: 2 };
  const header = out[0];
  const body = out.slice(1).sort((a, b) => {
    const da = a.split(',')[7] as Decision, db = b.split(',')[7] as Decision;
    return (order[da] ?? 9) - (order[db] ?? 9);
  });
  const path = 'out-of-quebec-review.csv';
  fs.writeFileSync(path, '﻿' + [header, ...body].join('\n'), 'utf-8');

  console.log('Résumé :');
  console.log(`  GARDER (QC/ON)      : ${counts.GARDER}`);
  console.log(`  RETIRER (autre/étr) : ${counts.RETIRER}`);
  console.log(`  À VÉRIFIER (inconnu): ${counts.A_VERIFIER}`);
  console.log(`\n📄 Rapport écrit : backend/${path}`);
  await prisma.$disconnect();
}

run().catch((e) => { console.error(e); process.exit(1); });
