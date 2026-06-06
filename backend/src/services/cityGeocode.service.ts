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
import { normalizeCityKey } from '../utils/cityNormalize';

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

// Bornes approximatives du CANADA — filet pour rejeter tout résultat étranger
// (les villes d'origine étrangères : Abidjan, Conakry, Moknine… → non placées).
const CA_BOUNDS = { latMin: 41.5, latMax: 83.5, lngMin: -141.5, lngMax: -52.0 };
// On n'accepte que de vrais lieux (ville/village/limite admin), pas des rues.
const PLACE_CLASSES = new Set(['place', 'boundary']);

/** Une requête structurée Nominatim + validation (lieu + bornes Canada). */
async function queryNominatim(
  params: Record<string, string>
): Promise<{ lat: number; lng: number } | null> {
  const wait = lastNominatimAt + NOMINATIM_MIN_INTERVAL_MS - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastNominatimAt = Date.now();

  try {
    const res = await axios.get('https://nominatim.openstreetmap.org/search', {
      params: { ...params, format: 'json', limit: 1, addressdetails: 1 },
      headers: { 'User-Agent': 'TalentSecure/1.0 (nick@darkhorseads.com)' },
      timeout: 8000,
    });
    const hit = Array.isArray(res.data) ? res.data[0] : null;
    if (!hit || !hit.lat || !hit.lon) return null;
    if (hit.class && !PLACE_CLASSES.has(hit.class)) return null; // pas une rue
    const lat = parseFloat(hit.lat);
    const lng = parseFloat(hit.lon);
    if (lat < CA_BOUNDS.latMin || lat > CA_BOUNDS.latMax || lng < CA_BOUNDS.lngMin || lng > CA_BOUNDS.lngMax) {
      return null; // hors Canada → rejeté (ville étrangère)
    }
    return { lat, lng };
  } catch (e: any) {
    logger.warn(`[geocode] échec Nominatim (${JSON.stringify(params)}): ${e?.message}`);
    return null;
  }
}

/**
 * Géocode une ville en requête STRUCTURÉE : d'abord au Québec (précis), puis
 * dans le reste du Canada (villes hors-QC : Sudbury, Edmonton, Edmundston…).
 * Les villes étrangères ne matchent dans aucun des deux → non placées.
 */
async function geocodeNominatim(city: string): Promise<{ lat: number; lng: number } | null> {
  const inQuebec = await queryNominatim({ city, state: 'Québec', country: 'Canada' });
  if (inQuebec) return inQuebec;
  return queryNominatim({ city, country: 'Canada' });
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
