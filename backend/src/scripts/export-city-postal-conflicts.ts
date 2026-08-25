/**
 * Fiches dont la VILLE écrite et le CODE POSTAL se contredisent — Candidats
 * Potentiels + Candidats. LECTURE SEULE, aucun appel réseau.
 *
 * Ni le code ni un audit ne peuvent trancher ces cas : quand une fiche dit
 * « Québec » avec un code postal de Laval, seul un humain (le CV, un appel)
 * sait laquelle des deux informations est la bonne. Le géocodage, lui, suit le
 * code postal — donc l'épingle est probablement au bon endroit et c'est la
 * FICHE qui reste fausse, avec le mauvais nom de ville dans les listes,
 * les filtres et les exports.
 *
 * Détection : distance entre le centroïde du secteur postal et le centre de la
 * ville écrite. Au-delà du seuil, les deux ne peuvent pas désigner le même
 * endroit. Signale aussi tout code postal d'une AUTRE province.
 *
 *   npx ts-node src/scripts/export-city-postal-conflicts.ts
 *   npx ts-node src/scripts/export-city-postal-conflicts.ts --seuil 30
 */
import * as fs from 'fs';
import { prisma } from '../config/database';
import {
  postalToFSA,
  prefersCityOverFSA,
  resolvePostalCoordinates,
} from '../services/cityGeocode.service';
import {
  canonicalCity,
  normalizeCityKey,
  provinceFromPostalCode,
} from '../utils/cityNormalize';
import { haversineKm } from '../utils/geo';
import { quebecCitiesCoordinates } from '../data/quebecCities';

const OUT_CSV = 'ville-vs-code-postal-review.csv'; // suffixe -review.csv → gitignoré (PII)

/**
 * Base des liens vers les fiches. Volontairement PAS FRONTEND_URL : en local
 * cette variable vaut http://localhost:5183, et le CSV part aux RH — un lien
 * localhost n'ouvre rien chez eux. On vise la prod par défaut ; FICHE_BASE_URL
 * permet de viser un autre environnement en connaissance de cause.
 */
const FRONTEND =
  process.env.FICHE_BASE_URL ||
  'https://talentsecure-frontend-572017163659.northamerica-northeast1.run.app';

/**
 * Écart au-delà duquel ville et code postal ne peuvent PAS désigner le même
 * endroit. 50 km laisse passer les grandes villes fusionnées (Saguenay,
 * Gatineau) et les banlieues, où un écart de 20-30 km est normal.
 */
const CONFLICT_KM = (() => {
  const i = process.argv.indexOf('--seuil');
  return i >= 0 ? Number(process.argv[i + 1]) : 50;
})();

interface Conflict {
  section: 'prospect' | 'candidat';
  id: string;
  name: string;
  city: string | null;
  postalCode: string | null;
  fsa: string | null;
  reason: string;
  distanceKm: number | null;
  link: string;
}

const cityCenter = new Map<string, { lat: number; lng: number }>();
for (const [name, c] of Object.entries(quebecCitiesCoordinates)) {
  cityCenter.set(normalizeCityKey(name), c);
}

async function loadCityCache(): Promise<void> {
  const rows = await prisma.cityGeocode.findMany({ where: { found: true } });
  for (const r of rows) {
    if (r.lat != null && r.lng != null && !cityCenter.has(r.cityKey)) {
      cityCenter.set(r.cityKey, { lat: r.lat, lng: r.lng });
    }
  }
}

function conflictOf(r: {
  city: string | null;
  postalCode: string | null;
}): { reason: string; distanceKm: number | null } | null {
  const province = provinceFromPostalCode(r.postalCode);
  if (province && province !== 'QC') {
    return { reason: `code postal de ${province}, hors Québec`, distanceKm: null };
  }

  // Secteur dont la ville l'emporte de toute façon (FSA rurale, ou centroïde
  // cassé) : la fiche N'EST PAS placée par ce centroïde, donc l'écart ne prouve
  // aucune contradiction. Un village de la FSA J0K est normalement à 90 km du
  // centroïde de sa FSA — et il est déjà épinglé sur son village, pas là.
  if (prefersCityOverFSA(r.postalCode)) return null;

  const postal = resolvePostalCoordinates(r.postalCode);
  const center = cityCenter.get(normalizeCityKey(r.city));
  if (!postal || !center) return null; // rien à comparer → pas de contradiction prouvable

  const distanceKm = Math.round(haversineKm(postal, center) * 10) / 10;
  if (distanceKm <= CONFLICT_KM) return null;
  return {
    reason: `le secteur ${postalToFSA(r.postalCode)} est à ${distanceKm} km de « ${canonicalCity(r.city)} »`,
    distanceKm,
  };
}

async function main(): Promise<void> {
  console.log('\n🔎 Ville écrite ≠ code postal — LECTURE SEULE, aucun réseau\n');
  await loadCityCache();

  const [prospects, candidates] = await Promise.all([
    prisma.prospectCandidate.findMany({
      where: { isDeleted: false },
      select: { id: true, firstName: true, lastName: true, city: true, postalCode: true },
    }),
    prisma.candidate.findMany({
      where: { isDeleted: false },
      select: { id: true, firstName: true, lastName: true, city: true, postalCode: true },
    }),
  ]);

  const rows: Conflict[] = [];
  const scan = (section: 'prospect' | 'candidat', list: typeof prospects, path: string) => {
    for (const p of list) {
      const c = conflictOf(p);
      if (!c) continue;
      rows.push({
        section,
        id: p.id,
        name: `${p.firstName ?? ''} ${p.lastName ?? ''}`.trim(),
        city: p.city,
        postalCode: p.postalCode,
        fsa: postalToFSA(p.postalCode),
        reason: c.reason,
        distanceKm: c.distanceKm,
        link: `${FRONTEND}/${path}/${p.id}`,
      });
    }
  };
  scan('prospect', prospects, 'prospects');
  scan('candidat', candidates as typeof prospects, 'candidates');

  rows.sort((a, b) => (b.distanceKm ?? 1e9) - (a.distanceKm ?? 1e9));

  const pad = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + '…' : s.padEnd(n));
  console.log(`   ${rows.length} fiche(s) à trancher à la main (seuil ${CONFLICT_KM} km)\n`);
  console.log(`   ${pad('section', 10)}${pad('nom', 28)}${pad('ville écrite', 24)}${pad('CP', 10)}motif`);
  for (const r of rows) {
    console.log(
      `   ${pad(r.section, 10)}${pad(r.name, 28)}${pad(r.city ?? '—', 24)}${pad(r.postalCode ?? '—', 10)}${r.reason}`
    );
  }

  const esc = (v: unknown) => {
    const s = v == null ? '' : String(v);
    return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = [
    'section', 'id', 'nom', 'ville_ecrite', 'code_postal', 'fsa',
    'motif', 'distance_km', 'lien_fiche', 'decision_rh',
  ].join(',');
  const body = rows.map((r) =>
    [r.section, r.id, r.name, r.city, r.postalCode, r.fsa, r.reason, r.distanceKm ?? '', r.link, '']
      .map(esc)
      .join(',')
  );
  fs.writeFileSync(OUT_CSV, '﻿' + [header, ...body].join('\n'), 'utf-8');
  console.log(`\n   CSV : backend/${OUT_CSV} — colonne « decision_rh » à remplir.`);
  console.log('   Aucune écriture en base.\n');
}

main()
  .catch((e) => {
    console.error('[export-city-postal-conflicts] échec :', e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
