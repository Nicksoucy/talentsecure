/**
 * AUDIT « l'épingle est-elle au bon endroit ? » — Candidats Potentiels + Candidats.
 * LECTURE SEULE : n'écrit rien en base, ni dans le cache city_geocodes.
 *
 * Différence avec audit-city-placement.ts : celui-là fait confiance à la SOURCE
 * (source='address' ⇒ réputé bon). Ici on ne fait confiance à rien — on prend la
 * coordonnée stockée, on demande à Nominatim « qu'est-ce qu'il y a À CET ENDROIT ? »
 * (géocodage inverse) et on compare la réponse à la ville écrite sur la fiche.
 * C'est le seul test qui attrape l'épingle posée dans la mauvaise ville alors que
 * la fiche a l'air parfaite (homonyme de rue, mauvaise province, code postal d'un
 * ancien logement…).
 *
 * Économie d'appels : les fiches partagent massivement les mêmes coordonnées
 * (centroïde FSA). On inverse chaque ÉPINGLE DISTINCTE une seule fois (~450),
 * pas chaque fiche (~3 300). Throttle OSM ~1 req/s hérité de cityGeocode.service.
 *
 *   npx ts-node src/scripts/audit-pins-people.ts            # complet (~9 min)
 *   npx ts-node src/scripts/audit-pins-people.ts --limit 40 # échantillon rapide
 *
 * ⚠️ Ne JAMAIS lancer en parallèle d'un autre script Nominatim (429 garanti).
 */
import * as fs from 'fs';
import { prisma } from '../config/database';
import {
  isInQuebecBounds,
  isRuralFSA,
  nominatimReverse,
  postalToFSA,
} from '../services/cityGeocode.service';
import { canonicalCity, normalizeCityKey, provinceFromPostalCode } from '../utils/cityNormalize';
import { haversineKm } from '../utils/geo';
import { quebecCitiesCoordinates } from '../data/quebecCities';

const argLimit = (() => {
  const i = process.argv.indexOf('--limit');
  return i >= 0 ? parseInt(process.argv[i + 1], 10) : null;
})();
const OUT_CSV = 'pins-prospects-candidats-review.csv'; // suffixe -review.csv → gitignoré (PII)

/**
 * Écart toléré entre l'épingle et le centre de la ville écrite AVANT de crier.
 * Généreux : une vraie adresse à Montréal peut être à 20 km du centre-ville
 * (l'île fait ~50 km). Sert à hiérarchiser, pas à condamner.
 */
const FAR_FROM_CITY_KM = 25;

type Verdict =
  | 'OK'
  | 'NON_PLACÉ'
  | 'PIN_HORS_QUÉBEC'
  | 'VILLE_DIFFÉRENTE'
  | 'PIN_DANS_LE_VIDE'
  | 'COORD_ABERRANTE';

interface PinInfo {
  lat: number;
  lng: number;
  /** Noms de lieu renvoyés par le géocodage inverse (ville, arrondissement…). */
  names: string[];
  /** Libellé lisible du lieu réel. */
  place: string | null;
  state: string | null;
  postcode: string | null;
  country: string | null;
  ok: boolean; // le reverse a répondu
}

interface Row {
  section: 'prospect' | 'candidat';
  id: string;
  label: string;
  city: string | null;
  canonical: string;
  street: string | null;
  postalCode: string | null;
  province: string | null;
  fsa: string | null;
  rural: boolean;
  lat: number | null;
  lng: number | null;
  source: string | null;
  pinPlace: string | null;
  pinState: string | null;
  pinPostal: string | null;
  distCityKm: number | null;
  verdict: Verdict;
  detail: string;
}

// ── Référentiel des centres-villes (seed statique + cache DB) ──────────────

const cityCenter = new Map<string, { lat: number; lng: number }>();
for (const [name, c] of Object.entries(quebecCitiesCoordinates)) {
  cityCenter.set(normalizeCityKey(name), c);
}
async function loadDbCityCache(): Promise<void> {
  const rows = await prisma.cityGeocode.findMany({ where: { found: true } });
  for (const r of rows) {
    if (r.lat == null || r.lng == null) continue;
    if (!cityCenter.has(r.cityKey)) cityCenter.set(r.cityKey, { lat: r.lat, lng: r.lng });
  }
  console.log(`   centres-villes connus  : ${cityCenter.size}`);
}

// ── Lecture des fiches (les deux tables de la question) ────────────────────

async function loadRows(): Promise<Row[]> {
  const [prospects, candidates] = await Promise.all([
    prisma.prospectCandidate.findMany({
      where: { isDeleted: false },
      select: {
        id: true, firstName: true, lastName: true, city: true, streetAddress: true,
        postalCode: true, province: true, lat: true, lng: true, geocodeSource: true,
      },
    }),
    prisma.candidate.findMany({
      where: { isDeleted: false },
      select: {
        id: true, firstName: true, lastName: true, city: true, address: true,
        postalCode: true, province: true, lat: true, lng: true, geocodeSource: true,
      },
    }),
  ]);

  const base = (section: 'prospect' | 'candidat', p: any, street: string | null): Row => ({
    section,
    id: p.id,
    label: `${p.firstName ?? ''} ${p.lastName ?? ''}`.trim(),
    city: p.city,
    canonical: canonicalCity(p.city),
    street,
    postalCode: p.postalCode,
    province: p.province,
    fsa: postalToFSA(p.postalCode),
    rural: isRuralFSA(p.postalCode),
    lat: p.lat,
    lng: p.lng,
    source: p.geocodeSource,
    pinPlace: null, pinState: null, pinPostal: null,
    distCityKm: null, verdict: 'OK', detail: '',
  });

  return [
    ...prospects.map((p) => base('prospect', p, p.streetAddress)),
    ...candidates.map((c) => base('candidat', c, c.address)),
  ];
}

// ── Géocodage inverse des épingles distinctes ─────────────────────────────

/** Tous les noms de lieu utiles renvoyés par Nominatim, du plus fin au plus large. */
function placeNames(a: any): string[] {
  return [
    a.city, a.town, a.village, a.municipality, a.hamlet,
    a.city_district, a.borough, a.suburb, a.quarter, a.neighbourhood,
    a.county, a.region,
  ].filter((x): x is string => typeof x === 'string' && x.length > 0);
}

async function reversePins(pins: string[]): Promise<Map<string, PinInfo>> {
  const out = new Map<string, PinInfo>();
  const eta = Math.ceil((pins.length * 1.15) / 60);
  console.log(`   ${pins.length} épingle(s) distincte(s) à inverser (~1/s, ≈${eta} min)…\n`);

  let i = 0;
  for (const key of pins) {
    const [latS, lngS] = key.split('|');
    const lat = parseFloat(latS);
    const lng = parseFloat(lngS);
    const res = await nominatimReverse(lat, lng);
    const a = res?.address ?? null;
    out.set(key, {
      lat, lng,
      names: a ? placeNames(a) : [],
      place: a ? (placeNames(a)[0] ?? null) : null,
      state: a?.state ?? null,
      postcode: a?.postcode ?? null,
      country: a?.country ?? null,
      ok: !!a,
    });
    if (++i % 25 === 0 || i === pins.length) {
      console.log(`      ${i}/${pins.length}…`);
    }
  }
  console.log('');
  return out;
}

// ── Classement d'une fiche ────────────────────────────────────────────────

function classify(r: Row, pin: PinInfo | undefined): { verdict: Verdict; detail: string } {
  if (r.lat == null || r.lng == null) {
    return { verdict: 'NON_PLACÉ', detail: 'aucune coordonnée — absente de la carte' };
  }
  if (r.lng > 0 || r.lat === 0 || r.lng === 0 || !Number.isFinite(r.lat) || !Number.isFinite(r.lng)) {
    return { verdict: 'COORD_ABERRANTE', detail: `lat/lng invalides (${r.lat}, ${r.lng})` };
  }
  if (!pin || !pin.ok) {
    // Le reverse ne répond rien : point en pleine eau / hors couverture OSM.
    return {
      verdict: isInQuebecBounds(r.lat, r.lng) ? 'PIN_DANS_LE_VIDE' : 'PIN_HORS_QUÉBEC',
      detail: 'géocodage inverse sans réponse (point hors terre ferme ?)',
    };
  }

  const state = (pin.state || '').toLowerCase();
  const isQc = state.includes('québec') || state.includes('quebec');
  if (!isQc) {
    return {
      verdict: 'PIN_HORS_QUÉBEC',
      detail: `l'épingle tombe en « ${pin.state ?? pin.country ?? '?'} »`,
    };
  }

  // La ville écrite correspond-elle à UN des noms de lieu du point ?
  const wanted = normalizeCityKey(r.city);
  if (!wanted) {
    return { verdict: 'OK', detail: 'aucune ville écrite — rien à contredire' };
  }
  const found = pin.names.map((n) => normalizeCityKey(n));
  if (found.includes(wanted)) return { verdict: 'OK', detail: '' };

  // Tolérance : ville écrite contenue dans un nom de lieu (ou l'inverse) —
  // « Montréal » vs « Ville de Montréal », « Québec » vs « Ville de Québec ».
  if (found.some((f) => f.includes(wanted) || wanted.includes(f))) {
    return { verdict: 'OK', detail: `variante de nom (${pin.place})` };
  }

  return {
    verdict: 'VILLE_DIFFÉRENTE',
    detail: `écrit « ${r.canonical || r.city} », épingle posée à « ${pin.names.slice(0, 3).join(' / ') || '?'} »`,
  };
}

// ── Rapport ───────────────────────────────────────────────────────────────

const pad = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + '…' : s.padEnd(n));
const km = (n: number | null) => (n == null ? '—' : `${n.toFixed(1)} km`);

function report(rows: Row[], pins: Map<string, PinInfo>): void {
  const bad = (v: Verdict) => rows.filter((r) => r.verdict === v);

  console.log('═'.repeat(80));
  console.log('RÉCAPITULATIF — Candidats Potentiels + Candidats');
  console.log('═'.repeat(80) + '\n');
  const byV = new Map<Verdict, number>();
  for (const r of rows) byV.set(r.verdict, (byV.get(r.verdict) ?? 0) + 1);
  for (const [v, n] of [...byV.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`   ${v === 'OK' ? '  ' : '⚠️'} ${pad(v, 22)} ${String(n).padStart(5)}`);
  }

  for (const v of ['PIN_HORS_QUÉBEC', 'COORD_ABERRANTE', 'PIN_DANS_LE_VIDE', 'VILLE_DIFFÉRENTE'] as Verdict[]) {
    const list = bad(v);
    if (list.length === 0) continue;
    console.log('\n' + '─'.repeat(80));
    console.log(`${v} — ${list.length} fiche(s)`);
    console.log('─'.repeat(80));
    // Regroupé par (ville écrite → lieu réel) : une même cause fait souvent N fiches.
    const groups = new Map<string, Row[]>();
    for (const r of list) {
      const k = `${r.canonical || '(vide)'} → ${r.pinPlace ?? '?'}`;
      const g = groups.get(k);
      if (g) g.push(r);
      else groups.set(k, [r]);
    }
    for (const [k, g] of [...groups.entries()].sort((a, b) => b[1].length - a[1].length).slice(0, 30)) {
      const ex = g[0];
      console.log(`\n   ${g.length} fiche(s)  ${k}`);
      console.log(`      épingle ${ex.lat}, ${ex.lng}  (source ${ex.source ?? '?'}, CP ${ex.postalCode ?? '—'})`);
      console.log(`      écart au centre de la ville écrite : ${km(ex.distCityKm)}`);
      for (const r of g.slice(0, 6)) {
        console.log(`        · ${pad(r.section, 9)} ${pad(r.label, 30)} ${pad(r.city ?? '—', 22)} ${r.postalCode ?? '—'}`);
      }
      if (g.length > 6) console.log(`        … +${g.length - 6} autre(s)`);
    }
    if (groups.size > 30) console.log(`\n   … et ${groups.size - 30} autre(s) groupe(s). Détail dans le CSV.`);
  }

  // Épingles empilant PLUSIEURS villes différentes (l'une d'elles est fausse,
  // ou elles sont toutes écrasées sur un centroïde commun).
  console.log('\n' + '─'.repeat(80));
  console.log('ÉPINGLES QUI EMPILENT PLUSIEURS VILLES');
  console.log('─'.repeat(80));
  const byPin = new Map<string, Row[]>();
  for (const r of rows) {
    if (r.lat == null || r.lng == null) continue;
    const k = `${r.lat}|${r.lng}`;
    const g = byPin.get(k);
    if (g) g.push(r);
    else byPin.set(k, [r]);
  }
  const mixed = [...byPin.entries()]
    .map(([k, rs]) => ({ k, rs, cities: new Set(rs.map((r) => r.canonical).filter(Boolean)) }))
    .filter((g) => g.cities.size >= 2)
    .sort((a, b) => b.cities.size - a.cities.size);
  console.log(`\n   ${mixed.length} épingle(s) portent des villes différentes.\n`);
  for (const g of mixed.slice(0, 20)) {
    const info = pins.get(g.k);
    console.log(`   📍 ${g.k.replace('|', ', ')} — lieu réel : ${info?.place ?? '?'} (${g.rs.length} fiches)`);
    const counts = new Map<string, number>();
    for (const r of g.rs) counts.set(r.canonical || '(vide)', (counts.get(r.canonical || '(vide)') ?? 0) + 1);
    for (const [c, n] of [...counts.entries()].sort((a, b) => b[1] - a[1])) {
      const match = info ? info.names.map(normalizeCityKey).includes(normalizeCityKey(c)) : false;
      console.log(`        ${match ? ' ·' : ' ⚠️'} ${pad(c, 34)} ${String(n).padStart(3)} fiche(s)`);
    }
  }
  if (mixed.length > 20) console.log(`   … et ${mixed.length - 20} autre(s). Détail dans le CSV.`);
  console.log('');
}

function writeCsv(rows: Row[]): void {
  const esc = (v: unknown) => {
    const s = v == null ? '' : String(v);
    return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = [
    'section', 'id', 'nom', 'ville_ecrite', 'ville_canonique', 'rue', 'code_postal',
    'province', 'fsa', 'fsa_rurale', 'lat', 'lng', 'source',
    'lieu_reel_du_pin', 'province_du_pin', 'cp_du_pin', 'ecart_ville_km', 'verdict', 'detail',
  ].join(',');
  const body = rows.map((r) =>
    [
      r.section, r.id, r.label, r.city, r.canonical, r.street, r.postalCode,
      r.province, r.fsa, r.rural ? 'oui' : 'non', r.lat, r.lng, r.source,
      r.pinPlace, r.pinState, r.pinPostal,
      r.distCityKm == null ? '' : r.distCityKm.toFixed(1), r.verdict, r.detail,
    ].map(esc).join(',')
  );
  fs.writeFileSync(OUT_CSV, '﻿' + [header, ...body].join('\n'), 'utf-8');
}

// ── Main ──────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('\n🔎 Audit des épingles — Candidats Potentiels + Candidats (LECTURE SEULE)\n');
  await loadDbCityCache();

  const rows = await loadRows();
  const placed = rows.filter((r) => r.lat != null && r.lng != null);
  console.log(`   fiches lues            : ${rows.length} (${placed.length} placées)`);

  let pinKeys = [...new Set(placed.map((r) => `${r.lat}|${r.lng}`))];
  if (argLimit) {
    console.log(`   ⚠️  --limit ${argLimit} : échantillon, audit PARTIEL`);
    pinKeys = pinKeys.slice(0, argLimit);
  }
  const pins = await reversePins(pinKeys);

  for (const r of rows) {
    const pin = r.lat != null && r.lng != null ? pins.get(`${r.lat}|${r.lng}`) : undefined;
    if (argLimit && r.lat != null && !pin) continue; // hors échantillon
    if (pin) {
      r.pinPlace = pin.place;
      r.pinState = pin.state;
      r.pinPostal = pin.postcode;
    }
    const center = cityCenter.get(normalizeCityKey(r.city));
    r.distCityKm =
      center && r.lat != null && r.lng != null
        ? Math.round(haversineKm({ lat: r.lat, lng: r.lng }, center) * 10) / 10
        : null;
    const c = classify(r, pin);
    r.verdict = c.verdict;
    r.detail = c.detail;

    // Signal secondaire : code postal d'une autre province que la province écrite.
    const pProv = provinceFromPostalCode(r.postalCode);
    if (pProv && pProv !== 'QC' && r.verdict === 'OK') {
      r.detail = `code postal ${pProv} (${r.postalCode}) sur une fiche placée au Québec`;
    }
    // Signal secondaire : épingle très loin du centre de la ville écrite.
    if (r.verdict === 'OK' && (r.distCityKm ?? 0) > FAR_FROM_CITY_KM) {
      r.detail = `épingle à ${km(r.distCityKm)} du centre de ${r.canonical}`;
    }
  }

  const audited = argLimit ? rows.filter((r) => r.pinPlace || r.lat == null) : rows;
  report(audited, pins);
  writeCsv(audited);
  console.log(`   CSV : backend/${OUT_CSV}  (${audited.length} lignes — PII, gitignoré)`);
  console.log('   Aucune écriture en base.\n');
}

main()
  .catch((e) => {
    console.error('[audit-pins-people] échec :', e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
