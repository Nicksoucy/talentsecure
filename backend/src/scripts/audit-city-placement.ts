/**
 * AUDIT du placement des villes sur la carte. LECTURE SEULE — n'écrit rien,
 * ni en base ni dans le cache city_geocodes. Produit un résumé console + un CSV
 * de révision.
 *
 * Question à laquelle il répond : « une épingle annonce N CV, mais les fiches
 * sont dans N villes différentes — quelles villes manquent ou sont mal placées ? »
 *
 * Cause auditée : resolveProspectCoordinates place « code postal d'abord », donc
 * au centroïde du FSA (3 premiers caractères). Excellent en ville (H2X ≈ 2 km²),
 * faux en région : une FSA RURALE (2ᵉ caractère « 0 » : J0J, G0A…) couvre des
 * centaines de km² et plusieurs municipalités, qui reçoivent alors TOUTES les
 * mêmes coordonnées — donc une seule épingle sur la carte (buildGeoMapPoints
 * regroupe par clé `lat|lng` exacte) et des villes qui n'apparaissent nulle part.
 *
 *   npx ts-node src/scripts/audit-city-placement.ts             # complet (Nominatim ~1 req/s)
 *   npx ts-node src/scripts/audit-city-placement.ts --offline   # instantané, sans réseau
 *
 * --offline : n'utilise que le seed statique + le cache DB déjà présent. Les
 * villes jamais géocodées restent « inconnues » et leur dérive n'est pas chiffrée.
 *
 * Note lecture seule : on n'appelle PAS resolveCityCoordinates, qui déclenche
 * geocodeUnknownsInBackground et ÉCRIT dans city_geocodes. On lit le cache
 * directement et on résout les inconnues via geocodeNominatim, en mémoire.
 */
import * as fs from 'fs';
import { prisma } from '../config/database';
import { geocodeNominatim, isInQuebecBounds, isRuralFSA, postalToFSA } from '../services/cityGeocode.service';
import { canonicalCity, normalizeCityKey } from '../utils/cityNormalize';
import { buildGeoMapPoints, haversineKm, GeoPersonRow } from '../utils/geo';
import { quebecCitiesCoordinates } from '../data/quebecCities';

const OFFLINE = process.argv.includes('--offline');
const OUT_CSV = 'city-placement-review.csv'; // *-review.csv → déjà gitignoré (PII)

/** Au-delà de cette dérive, une fiche est considérée mal placée. */
const DRIFT_TOLERANCE_KM = 1;

type Verdict =
  | 'OK_ADRESSE'
  | 'OK_VILLE'
  | 'OK_FSA'
  | 'DÉRIVE_FSA_RURAL'
  | 'FSA_RURAL_VILLE_INCONNUE'
  | 'VILLE_INCONNUE'
  | 'NON_PLACÉ'
  | 'HORS_QUÉBEC';

interface AuditRow {
  section: string;
  id: string;
  label: string;
  city: string | null;
  canonical: string;
  postalCode: string | null;
  fsa: string | null;
  rural: boolean;
  lat: number | null;
  lng: number | null;
  source: string | null;
  cityLat: number | null;
  cityLng: number | null;
  driftKm: number | null;
  verdict: Verdict;
}

// ── Résolution des vraies coordonnées d'une ville (sans jamais écrire) ──────

const seed = new Map<string, { lat: number; lng: number }>();
for (const [name, coords] of Object.entries(quebecCitiesCoordinates)) {
  seed.set(normalizeCityKey(name), coords);
}

type CityCoords = { lat: number; lng: number } | null;
const cityCache = new Map<string, CityCoords>(); // clé normalisée → coords (ou null)
const cityOrigin = new Map<string, 'seed' | 'cache' | 'nominatim' | 'introuvable'>();

/** Charge le cache DB city_geocodes en mémoire (lecture seule). */
async function loadDbCache(): Promise<void> {
  const rows = await prisma.cityGeocode.findMany();
  for (const r of rows) {
    if (cityCache.has(r.cityKey)) continue;
    if (r.found && r.lat != null && r.lng != null) {
      cityCache.set(r.cityKey, { lat: r.lat, lng: r.lng });
      cityOrigin.set(r.cityKey, 'cache');
    } else {
      cityCache.set(r.cityKey, null); // négatif mémorisé (found=false)
      cityOrigin.set(r.cityKey, 'introuvable');
    }
  }
  console.log(`   cache DB city_geocodes : ${rows.length} entrée(s) lue(s)`);
}

/** Coordonnées réelles d'une ville : seed → cache DB → Nominatim (en mémoire). */
async function resolveCity(city: string | null): Promise<CityCoords> {
  const key = normalizeCityKey(city);
  if (!key) return null;

  const s = seed.get(key);
  if (s) {
    cityOrigin.set(key, 'seed');
    return s;
  }
  if (cityCache.has(key)) return cityCache.get(key)!;
  if (OFFLINE) return null;

  const hit = await geocodeNominatim(city || '');
  cityCache.set(key, hit);
  cityOrigin.set(key, hit ? 'nominatim' : 'introuvable');
  return hit;
}

// ── Lecture des 4 tables porteuses de ville + coordonnées ──────────────────
// (contract_leads n'a ni ville ni lat/lng : c'est une table d'étiquettes qui
// pointe vers prospects/candidats/employés, déjà couverts ici.)

const PERSON_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  city: true,
  postalCode: true,
  lat: true,
  lng: true,
  geocodeSource: true,
} as const;

async function loadRows(): Promise<Omit<AuditRow, 'canonical' | 'fsa' | 'rural' | 'cityLat' | 'cityLng' | 'driftKm' | 'verdict'>[]> {
  const [prospects, candidates, employees, mandates] = await Promise.all([
    prisma.prospectCandidate.findMany({ where: { isDeleted: false }, select: PERSON_SELECT }),
    prisma.candidate.findMany({ where: { isDeleted: false }, select: PERSON_SELECT }),
    prisma.employee.findMany({ where: { isDeleted: false }, select: PERSON_SELECT }),
    prisma.mandate.findMany({
      where: { isDeleted: false },
      select: { id: true, name: true, city: true, postalCode: true, lat: true, lng: true, geocodeSource: true },
    }),
  ]);

  const person = (section: string) => (p: (typeof prospects)[number]) => ({
    section,
    id: p.id,
    label: `${p.firstName} ${p.lastName}`.trim(),
    city: p.city,
    postalCode: p.postalCode,
    lat: p.lat,
    lng: p.lng,
    source: p.geocodeSource,
  });

  return [
    ...prospects.map(person('prospect')),
    ...candidates.map(person('candidat')),
    ...employees.map(person('employé')),
    ...mandates.map((m) => ({
      section: 'mandat',
      id: m.id,
      label: m.name,
      city: m.city,
      postalCode: m.postalCode,
      lat: m.lat,
      lng: m.lng,
      source: m.geocodeSource,
    })),
  ];
}

// ── Classement d'une fiche ────────────────────────────────────────────────

function verdictOf(r: {
  lat: number | null;
  lng: number | null;
  source: string | null;
  rural: boolean;
  fsa: string | null;
  cityKnown: boolean;
  driftKm: number | null;
}): Verdict {
  if (r.lat == null || r.lng == null) return 'NON_PLACÉ';
  if (!isInQuebecBounds(r.lat, r.lng)) return 'HORS_QUÉBEC';
  if (r.source === 'address') return 'OK_ADRESSE';
  if (r.source === 'city') return r.cityKnown ? 'OK_VILLE' : 'VILLE_INCONNUE';
  // source = 'postal' (ou inconnue) → placé sur un centroïde FSA
  if (r.rural) {
    if (!r.cityKnown) return 'FSA_RURAL_VILLE_INCONNUE';
    // Une FSA rurale dont le centroïde tombe malgré tout près du village est OK.
    return (r.driftKm ?? 0) > DRIFT_TOLERANCE_KM ? 'DÉRIVE_FSA_RURAL' : 'OK_FSA';
  }
  return r.fsa ? 'OK_FSA' : r.cityKnown ? 'OK_VILLE' : 'VILLE_INCONNUE';
}

// ── Rapport ───────────────────────────────────────────────────────────────

const km = (n: number | null) => (n == null ? '—' : `${n.toFixed(1)} km`);
const pad = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + '…' : s.padEnd(n));

function sectionA(rows: AuditRow[]): void {
  console.log('\n' + '═'.repeat(78));
  console.log('A. ÉPINGLES QUI MÉLANGENT PLUSIEURS VILLES');
  console.log('═'.repeat(78));

  // Libellés produits par la VRAIE logique de la carte, pour afficher ce que
  // l'utilisateur voit réellement.
  const geoRows: GeoPersonRow[] = rows.map((r) => ({
    lat: r.lat,
    lng: r.lng,
    geocodeSource: r.source,
    postalCode: r.postalCode,
    city: r.city,
  }));
  const { points } = buildGeoMapPoints(geoRows);
  const labelByKey = new Map(points.map((p) => [`${p.lat}|${p.lng}`, p.label]));

  const groups = new Map<string, AuditRow[]>();
  for (const r of rows) {
    if (r.lat == null || r.lng == null) continue;
    const k = `${r.lat}|${r.lng}`;
    const g = groups.get(k);
    if (g) g.push(r);
    else groups.set(k, [r]);
  }

  const mixed = [...groups.entries()]
    .map(([key, rs]) => ({ key, rs, cities: new Set(rs.map((r) => r.canonical).filter(Boolean)) }))
    .filter((g) => g.cities.size >= 2)
    .sort((a, b) => b.cities.size - a.cities.size || b.rs.length - a.rs.length);

  if (mixed.length === 0) {
    console.log('\n   Aucune épingle ne mélange plusieurs villes. 🎉');
    return;
  }

  console.log(
    `\n   ${mixed.length} épingle(s) regroupent des villes DIFFÉRENTES au même point.`
  );
  console.log(
    `   Les villes listées sous chaque épingle n'apparaissent nulle part ailleurs sur la carte.\n`
  );

  for (const g of mixed.slice(0, 25)) {
    const [lat, lng] = g.key.split('|');
    const label = labelByKey.get(g.key) ?? '(hors carte)';
    console.log(`   📍 ${label}`);
    console.log(`      ${lat}, ${lng} — ${g.rs.length} fiche(s), ${g.cities.size} villes`);

    const byCity = new Map<string, AuditRow[]>();
    for (const r of g.rs) {
      const c = r.canonical || '(vide)';
      const list = byCity.get(c);
      if (list) list.push(r);
      else byCity.set(c, [r]);
    }
    const sorted = [...byCity.entries()].sort((a, b) => (b[1][0].driftKm ?? 0) - (a[1][0].driftKm ?? 0));
    for (const [city, rs] of sorted) {
      const d = rs[0].driftKm;
      const flag = d == null ? '  ?' : d > DRIFT_TOLERANCE_KM ? ' ⚠️' : '  ·';
      console.log(`      ${flag} ${pad(city, 32)} ${String(rs.length).padStart(3)} fiche(s)   écart réel : ${km(d)}`);
    }
    console.log('');
  }
  if (mixed.length > 25) console.log(`   … et ${mixed.length - 25} autre(s) épingle(s). Détail complet dans le CSV.\n`);
}

function sectionB(rows: AuditRow[]): void {
  console.log('═'.repeat(78));
  console.log('B. VILLES MANQUANTES DU SYSTÈME');
  console.log('═'.repeat(78));

  const byCity = new Map<string, { name: string; count: number; known: boolean }>();
  for (const r of rows) {
    const key = normalizeCityKey(r.city);
    if (!key) continue;
    const e = byCity.get(key) ?? { name: r.canonical || r.city || key, count: 0, known: r.cityLat != null };
    e.count++;
    byCity.set(key, e);
  }

  const missing = [...byCity.entries()].filter(([, v]) => !v.known).sort((a, b) => b[1].count - a[1].count);
  const total = byCity.size;

  console.log(`\n   ${total} ville(s) distincte(s) en base, ${total - missing.length} avec coordonnées propres.`);
  if (missing.length === 0) {
    console.log('   Toutes les villes sont géocodables. 🎉\n');
    return;
  }
  console.log(`   ⚠️  ${missing.length} SANS coordonnées propres — leurs fiches retombent sur le`);
  console.log(`      centroïde FSA (ou ne sont pas placées du tout) :\n`);
  for (const [, v] of missing.slice(0, 40)) {
    console.log(`      ${pad(v.name, 40)} ${String(v.count).padStart(4)} fiche(s)`);
  }
  if (missing.length > 40) console.log(`      … et ${missing.length - 40} autre(s).`);
  if (OFFLINE) {
    console.log(`\n   (mode --offline : certaines sont peut-être géocodables — relancer sans --offline)`);
  }
  console.log('');
}

function sectionC(rows: AuditRow[]): void {
  console.log('═'.repeat(78));
  console.log('C. FICHES INVISIBLES SUR LA CARTE');
  console.log('═'.repeat(78));
  const unplaced = rows.filter((r) => r.verdict === 'NON_PLACÉ');
  const bySection = new Map<string, number>();
  for (const r of unplaced) bySection.set(r.section, (bySection.get(r.section) ?? 0) + 1);
  console.log(`\n   ${unplaced.length} fiche(s) sans coordonnées — sur aucune carte :`);
  for (const [s, n] of [...bySection.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`      ${pad(s, 14)} ${String(n).padStart(5)}`);
  }
  console.log('');
}

function sectionD(rows: AuditRow[]): void {
  console.log('═'.repeat(78));
  console.log('D. DÉRIVE PAR VILLE');
  console.log('═'.repeat(78));

  const byCity = new Map<string, { name: string; drifts: number[] }>();
  for (const r of rows) {
    if (r.driftKm == null || r.driftKm <= DRIFT_TOLERANCE_KM) continue;
    const key = normalizeCityKey(r.city);
    if (!key) continue;
    const e = byCity.get(key) ?? { name: r.canonical || key, drifts: [] };
    e.drifts.push(r.driftKm);
    byCity.set(key, e);
  }
  const list = [...byCity.values()]
    .map((v) => ({ name: v.name, n: v.drifts.length, max: Math.max(...v.drifts) }))
    .sort((a, b) => b.max - a.max);

  if (list.length === 0) {
    console.log('\n   Aucune ville au-delà de la tolérance. 🎉\n');
    return;
  }
  console.log(`\n   ${list.length} ville(s) dont les fiches sont épinglées à > ${DRIFT_TOLERANCE_KM} km du vrai centre :\n`);
  console.log(`      ${pad('Ville', 40)} Fiches   Écart max`);
  for (const v of list.slice(0, 40)) {
    console.log(`      ${pad(v.name, 40)} ${String(v.n).padStart(6)}   ${km(v.max)}`);
  }
  if (list.length > 40) console.log(`      … et ${list.length - 40} autre(s). Détail complet dans le CSV.`);
  console.log('');
}

function sectionE(rows: AuditRow[]): void {
  const out = rows.filter((r) => r.verdict === 'HORS_QUÉBEC');
  if (out.length === 0) return;
  console.log('═'.repeat(78));
  console.log('E. ⛔ FICHES PLACÉES HORS DES BORNES DU QUÉBEC');
  console.log('═'.repeat(78));
  console.log(`\n   ${out.length} fiche(s) ont des coordonnées hors Québec.`);
  console.log(`   Rappel : quebecFSACentroids contient H0H = { lat: 90, lng: 0 } (pôle Nord,`);
  console.log(`   code postal du père Noël) et resolvePostalCoordinates ne vérifie AUCUNE borne.\n`);
  for (const r of out.slice(0, 30)) {
    console.log(`      ${pad(r.section, 10)} ${pad(r.label, 28)} ${pad(r.city ?? '—', 22)} ${r.postalCode ?? '—'}  → ${r.lat}, ${r.lng}`);
  }
  console.log('');
}

// ── CSV ───────────────────────────────────────────────────────────────────

function writeCsv(rows: AuditRow[]): void {
  const esc = (v: unknown) => {
    const s = v == null ? '' : String(v);
    return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = [
    'section', 'id', 'nom', 'ville', 'ville_canonique', 'code_postal', 'fsa', 'fsa_rurale',
    'lat_actuel', 'lng_actuel', 'source', 'lat_ville_reelle', 'lng_ville_reelle',
    'derive_km', 'classement',
  ].join(',');
  const body = rows.map((r) =>
    [
      r.section, r.id, r.label, r.city, r.canonical, r.postalCode, r.fsa, r.rural ? 'oui' : 'non',
      r.lat, r.lng, r.source, r.cityLat, r.cityLng,
      r.driftKm == null ? '' : r.driftKm.toFixed(2), r.verdict,
    ].map(esc).join(',')
  );
  fs.writeFileSync(OUT_CSV, '﻿' + [header, ...body].join('\n'), 'utf-8');
}

// ── Main ──────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('\n🔎 Audit du placement des villes — LECTURE SEULE (aucune écriture)\n');
  if (OFFLINE) console.log('   mode --offline : seed + cache DB seulement, aucun appel réseau\n');

  await loadDbCache();
  const raw = await loadRows();
  console.log(`   fiches lues            : ${raw.length}\n`);

  // Résolution des villes distinctes d'abord (Nominatim throttlé ~1 req/s).
  const distinct = new Map<string, string>();
  for (const r of raw) {
    const k = normalizeCityKey(r.city);
    if (k && !distinct.has(k)) distinct.set(k, r.city || '');
  }
  const toResolve = [...distinct.entries()].filter(([k]) => !seed.has(k) && !cityCache.has(k));
  if (!OFFLINE && toResolve.length > 0) {
    console.log(`   ${toResolve.length} ville(s) inconnue(s) à résoudre via Nominatim (~1/s, ≈${Math.ceil((toResolve.length * 1.1) / 60)} min)…`);
    let i = 0;
    for (const [, city] of toResolve) {
      await resolveCity(city);
      if (++i % 25 === 0) console.log(`      ${i}/${toResolve.length}…`);
    }
    console.log('');
  }

  const rows: AuditRow[] = [];
  for (const r of raw) {
    const fsa = postalToFSA(r.postalCode);
    const rural = isRuralFSA(r.postalCode);
    const cc = await resolveCity(r.city);
    const driftKm =
      r.lat != null && r.lng != null && cc
        ? Math.round(haversineKm({ lat: r.lat, lng: r.lng }, cc) * 10) / 10
        : null;
    rows.push({
      ...r,
      canonical: canonicalCity(r.city),
      fsa,
      rural,
      cityLat: cc?.lat ?? null,
      cityLng: cc?.lng ?? null,
      driftKm,
      verdict: verdictOf({ ...r, rural, fsa, cityKnown: !!cc, driftKm }),
    });
  }

  sectionA(rows);
  sectionB(rows);
  sectionC(rows);
  sectionD(rows);
  sectionE(rows);

  console.log('═'.repeat(78));
  console.log('RÉCAPITULATIF');
  console.log('═'.repeat(78) + '\n');
  const byVerdict = new Map<Verdict, number>();
  for (const r of rows) byVerdict.set(r.verdict, (byVerdict.get(r.verdict) ?? 0) + 1);
  for (const [v, n] of [...byVerdict.entries()].sort((a, b) => b[1] - a[1])) {
    const bad = v === 'DÉRIVE_FSA_RURAL' || v === 'FSA_RURAL_VILLE_INCONNUE' || v === 'HORS_QUÉBEC';
    console.log(`   ${bad ? '⚠️ ' : '   '}${pad(v, 28)} ${String(n).padStart(6)}`);
  }

  writeCsv(rows);
  console.log(`\n   CSV détaillé : backend/${OUT_CSV}  (${rows.length} lignes, gitignoré — contient du PII)`);
  console.log('   Aucune écriture effectuée en base.\n');
}

main()
  .catch((e) => {
    console.error('[audit-city-placement] échec :', e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
