/**
 * Résolution des coordonnées d'une ville pour la carte des candidats potentiels.
 *
 * Ordre : seed statique (instantané) → cache DB (city_geocodes) → géocodage
 * Nominatim (OpenStreetMap) EN ARRIÈRE-PLAN (non bloquant). Une ville inconnue
 * est géocodée une seule fois puis mémorisée ; les résultats négatifs sont aussi
 * mémorisés (found=false) pour ne pas re-questionner les mauvaises données.
 */
import axios from 'axios';
import { prisma } from '../config/database';
import logger from '../config/logger';
import { quebecCitiesCoordinates } from '../data/quebecCities';
import { quebecFSACentroids } from '../data/quebecFSACentroids';
import { normalizeCityKey, seedCanonicalName } from '../utils/cityNormalize';

// Seed normalisé (clé normalisée → coords) construit une fois au chargement.
const seed = new Map<string, { lat: number; lng: number }>();
for (const [name, coords] of Object.entries(quebecCitiesCoordinates)) {
  seed.set(normalizeCityKey(name), coords);
}

export interface ResolvedCity {
  lat: number | null;
  lng: number | null;
}

// Anti-doublon en mémoire + throttle Nominatim (politique : ~1 req/s).
const inFlight = new Set<string>();
let lastNominatimAt = 0;
const NOMINATIM_MIN_INTERVAL_MS = 1100;
const MAX_GEOCODE_PER_CYCLE = 20;

/**
 * Réserve le prochain créneau d'appel Nominatim de façon ATOMIQUE (pas de yield
 * entre lire et écrire lastNominatimAt) puis attend jusqu'à ce créneau. Sérialise
 * correctement les appels concurrents (contrôleur fire-and-forget + backfill) :
 * sans ça, deux chaînes pouvaient lire la même valeur périmée et taper l'API
 * simultanément, violant la politique OSM ~1 req/s.
 */
async function throttleNominatim(): Promise<void> {
  const now = Date.now();
  const slot = Math.max(now, lastNominatimAt + NOMINATIM_MIN_INTERVAL_MS);
  lastNominatimAt = slot; // réservé AVANT tout await
  const wait = slot - now;
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
}

// Bornes approximatives du QUÉBEC — filet pour rejeter tout résultat hors-QC
// (villes étrangères ET villes canadiennes hors-Québec : on reste au Québec).
const QC_BOUNDS = { latMin: 44.9, latMax: 62.7, lngMin: -79.9, lngMax: -57.0 };
// On n'accepte que de vrais lieux (ville/village/limite admin), pas des rues.
const PLACE_CLASSES = new Set(['place', 'boundary']);

/**
 * Appel Nominatim PARTAGÉ (utilisé aussi par addressGeocode.service) : throttle
 * global au process (~1 req/s, politique OSM), User-Agent identifiant, timeout
 * 8 s. Retourne le premier résultat brut, ou null (erreur → warn + null).
 */
export async function nominatimSearch(
  params: Record<string, string | number>
): Promise<any | null> {
  await throttleNominatim();

  try {
    const res = await axios.get('https://nominatim.openstreetmap.org/search', {
      params: { format: 'json', limit: 1, addressdetails: 1, ...params },
      headers: { 'User-Agent': 'TalentSecure/1.0 (nick@darkhorseads.com)' },
      timeout: 8000,
    });
    return Array.isArray(res.data) ? res.data[0] || null : null;
  } catch (e: any) {
    logger.warn(`[geocode] échec Nominatim (${JSON.stringify(params)}): ${e?.message}`);
    return null;
  }
}

/**
 * Géocodage INVERSE Nominatim (lat/lng → adresse structurée) — même throttle
 * partagé (~1 req/s). Retourne l'objet brut avec `.address`, ou null.
 */
export async function nominatimReverse(lat: number, lng: number): Promise<any | null> {
  await throttleNominatim();

  try {
    const res = await axios.get('https://nominatim.openstreetmap.org/reverse', {
      params: { lat, lon: lng, format: 'json', addressdetails: 1, zoom: 18 },
      headers: { 'User-Agent': 'TalentSecure/1.0 (nick@darkhorseads.com)' },
      timeout: 8000,
    });
    return res.data && res.data.address ? res.data : null;
  } catch (e: any) {
    logger.warn(`[geocode] échec Nominatim reverse (${lat},${lng}): ${e?.message}`);
    return null;
  }
}

/** Vrai si (lat,lng) tombe dans les bornes approximatives du Québec. */
export function isInQuebecBounds(lat: number, lng: number): boolean {
  return (
    lat >= QC_BOUNDS.latMin &&
    lat <= QC_BOUNDS.latMax &&
    lng >= QC_BOUNDS.lngMin &&
    lng <= QC_BOUNDS.lngMax
  );
}

/**
 * Géocode une ville en requête STRUCTURÉE limitée au QUÉBEC (city + state=Québec
 * + country=Canada). Ne renvoie un résultat que s'il existe une ville de ce nom
 * AU QUÉBEC ; sinon null (villes étrangères ou hors-QC → non placées).
 */
async function geocodeNominatim(city: string): Promise<{ lat: number; lng: number } | null> {
  const hit = await nominatimSearch({ city, state: 'Québec', country: 'Canada' });
  if (!hit || !hit.lat || !hit.lon) return null;
  if (hit.class && !PLACE_CLASSES.has(hit.class)) return null; // pas une rue
  const lat = parseFloat(hit.lat);
  const lng = parseFloat(hit.lon);
  if (!isInQuebecBounds(lat, lng)) return null; // hors Québec → rejeté
  return { lat, lng };
}

// ───────────────────────────────────────────────────────────────────────────
// Classification de province (pour le tri hors-Québec). Indépendant du cache
// de coordonnées : on lit address.state via addressdetails.
// ───────────────────────────────────────────────────────────────────────────
export type ProvinceClass = 'QC' | 'ON' | 'other-CA' | 'foreign' | 'unknown';
const provinceCache = new Map<string, ProvinceClass>();

function mapState(state: string | undefined): ProvinceClass | null {
  if (!state) return null;
  const s = state.toLowerCase();
  if (s.includes('quebec') || s.includes('québec')) return 'QC';
  if (s.includes('ontario')) return 'ON';
  return 'other-CA';
}

const nominatimFirstHit = nominatimSearch;

/**
 * Classe une ville : QC / ON / other-CA / foreign / unknown.
 *  - seed connu → QC (les rares limites comme Ottawa sont gardées de toute façon).
 *  - sinon Canada → address.state ; sinon recherche mondiale → foreign si ça
 *    résout ailleurs, unknown si rien.
 * Résultat mémorisé le temps du run.
 */
export async function classifyProvince(city: string): Promise<ProvinceClass> {
  const key = normalizeCityKey(city);
  if (!key) return 'unknown';
  const cached = provinceCache.get(key);
  if (cached) return cached;

  let result: ProvinceClass;
  if (seedCanonicalName(key)) {
    result = 'QC';
  } else {
    const ca = await nominatimFirstHit({ city, country: 'Canada' });
    const prov = mapState(ca?.address?.state);
    if (prov) {
      result = prov;
    } else {
      const world = await nominatimFirstHit({ city });
      result = world ? 'foreign' : 'unknown';
    }
  }
  provinceCache.set(key, result);
  return result;
}

/**
 * Maintenance : re-évalue toutes les entrées géocodées via Nominatim avec la
 * logique stricte courante (corrige les anciens faux-positifs hors-QC).
 * Retourne un récap. À lancer ponctuellement via script.
 */
export async function refreshNominatimCache(): Promise<{
  rechecked: number;
  found: number;
  unplaced: number;
  fixed: string[];
}> {
  const rows = await prisma.cityGeocode.findMany({ where: { source: 'nominatim' } });
  let found = 0;
  let unplaced = 0;
  const fixed: string[] = [];
  for (const row of rows) {
    const coords = await geocodeNominatim(row.city);
    if (!coords && row.found) fixed.push(row.city); // était placée à tort
    await prisma.cityGeocode.update({
      where: { id: row.id },
      data: { lat: coords?.lat ?? null, lng: coords?.lng ?? null, found: !!coords },
    });
    if (coords) found++;
    else unplaced++;
  }
  return { rechecked: rows.length, found, unplaced, fixed };
}

/** Géocode (en tâche de fond) les villes inconnues, plafonné par cycle. */
async function geocodeUnknownsInBackground(unknown: { key: string; city: string }[]) {
  const batch = unknown.filter((u) => !inFlight.has(u.key)).slice(0, MAX_GEOCODE_PER_CYCLE);
  batch.forEach((u) => inFlight.add(u.key));

  for (const u of batch) {
    try {
      const coords = await geocodeNominatim(u.city);
      await prisma.cityGeocode.upsert({
        where: { cityKey: u.key },
        update: {
          lat: coords?.lat ?? null,
          lng: coords?.lng ?? null,
          found: !!coords,
          source: 'nominatim',
          city: u.city,
        },
        create: {
          cityKey: u.key,
          city: u.city,
          lat: coords?.lat ?? null,
          lng: coords?.lng ?? null,
          found: !!coords,
          source: 'nominatim',
        },
      });
      if (coords) {
        logger.info(`[geocode] "${u.city}" → ${coords.lat},${coords.lng}`);
      }
    } catch (e: any) {
      logger.warn(`[geocode] persistance échouée pour "${u.city}": ${e?.message}`);
    } finally {
      inFlight.delete(u.key);
    }
  }
}

/**
 * Résout les coordonnées pour une liste de villes. NON BLOQUANT : renvoie tout
 * de suite ce qui est connu (seed) ou déjà en cache DB ; déclenche le géocodage
 * en arrière-plan des inconnues (qui apparaîtront au prochain chargement).
 * Clé du Map retourné = ville d'origine.
 */
export async function resolveCityCoordinates(
  cities: string[]
): Promise<Map<string, ResolvedCity>> {
  const result = new Map<string, ResolvedCity>();
  const needDbLookup: { key: string; city: string }[] = [];

  // 1) Seed statique
  for (const city of cities) {
    const key = normalizeCityKey(city);
    if (!key) {
      result.set(city, { lat: null, lng: null });
      continue;
    }
    const s = seed.get(key);
    if (s) {
      result.set(city, { lat: s.lat, lng: s.lng });
    } else {
      needDbLookup.push({ key, city });
    }
  }

  // 2) Cache DB
  const unknown = new Map<string, string>(); // key → ville d'origine
  if (needDbLookup.length > 0) {
    const keys = [...new Set(needDbLookup.map((n) => n.key))];
    const rows = await prisma.cityGeocode.findMany({ where: { cityKey: { in: keys } } });
    const byKey = new Map(rows.map((r) => [r.cityKey, r]));

    for (const n of needDbLookup) {
      const row = byKey.get(n.key);
      if (row) {
        result.set(n.city, { lat: row.lat ?? null, lng: row.lng ?? null });
      } else {
        result.set(n.city, { lat: null, lng: null });
        unknown.set(n.key, n.city);
      }
    }
  }

  // 3) Géocodage en arrière-plan (non awaité) des villes jamais vues.
  if (unknown.size > 0) {
    const list = [...unknown.entries()].map(([key, city]) => ({ key, city }));
    void geocodeUnknownsInBackground(list);
  }

  return result;
}

// ───────────────────────────────────────────────────────────────────────────
// Géocodage PAR PROSPECT (recherche par point + rayon). « Code postal d'abord » :
// code postal → FSA (3 premiers car.) → centroïde FSA QC (offline, instantané) ;
// sinon repli sur le centre de la ville saisie. Voir quebecFSACentroids.ts.
// ───────────────────────────────────────────────────────────────────────────

export type GeocodeSource = 'postal' | 'city';
export interface ProspectGeocode {
  lat: number;
  lng: number;
  source: GeocodeSource;
}

/** FSA (3 premiers car.) normalisé d'un code postal canadien, sinon null. */
export function postalToFSA(postalCode?: string | null): string | null {
  if (!postalCode) return null;
  const fsa = postalCode.replace(/\s+/g, '').toUpperCase().slice(0, 3);
  return /^[A-Z]\d[A-Z]$/.test(fsa) ? fsa : null;
}

/** Coordonnées du centroïde FSA d'un code postal (offline, QC), sinon null. */
export function resolvePostalCoordinates(
  postalCode?: string | null
): { lat: number; lng: number } | null {
  const fsa = postalToFSA(postalCode);
  if (!fsa) return null;
  const hit = quebecFSACentroids[fsa];
  return hit ? { lat: hit.lat, lng: hit.lng } : null;
}

/**
 * Coordonnées d'un prospect : code postal (FSA, précis) d'abord, sinon centre de
 * la ville saisie. Retourne null si rien ne résout (ni code postal QC ni ville
 * géocodable) → le prospect ne sera pas placé sur la carte / absent du « nearby ».
 * Note : pour une ville jamais vue, resolveCityCoordinates lance un géocodage en
 * arrière-plan et renvoie null pour l'instant ; un futur backfill la résoudra.
 */
export async function resolveProspectCoordinates(input: {
  postalCode?: string | null;
  city?: string | null;
}): Promise<ProspectGeocode | null> {
  const byPostal = resolvePostalCoordinates(input.postalCode);
  if (byPostal) return { ...byPostal, source: 'postal' };

  const city = (input.city || '').trim();
  if (city) {
    const coords = (await resolveCityCoordinates([city])).get(city);
    if (coords && coords.lat != null && coords.lng != null) {
      return { lat: coords.lat, lng: coords.lng, source: 'city' };
    }
  }
  return null;
}
