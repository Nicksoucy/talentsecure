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

// Bornes approximatives du Québec — filet pour rejeter tout résultat hors-QC.
const QC_BOUNDS = { latMin: 44.9, latMax: 62.7, lngMin: -79.9, lngMax: -57.0 };
// On n'accepte que de vrais lieux (ville/village/limite admin), pas des rues.
const PLACE_CLASSES = new Set(['place', 'boundary']);

async function geocodeNominatim(city: string): Promise<{ lat: number; lng: number } | null> {
  const wait = lastNominatimAt + NOMINATIM_MIN_INTERVAL_MS - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastNominatimAt = Date.now();

  try {
    // Requête STRUCTURÉE (city/state/country) : ne renvoie un résultat que s'il
    // existe une ville de ce nom AU QUÉBEC. Évite les faux-positifs des villes
    // étrangères (Dakar, Regina, Moknine… → aucun résultat → non placées).
    const res = await axios.get('https://nominatim.openstreetmap.org/search', {
      params: {
        city,
        state: 'Québec',
        country: 'Canada',
        format: 'json',
        limit: 1,
        addressdetails: 1,
      },
      headers: { 'User-Agent': 'TalentSecure/1.0 (nick@darkhorseads.com)' },
      timeout: 8000,
    });
    const hit = Array.isArray(res.data) ? res.data[0] : null;
    if (!hit || !hit.lat || !hit.lon) return null;
    // Rejeter les correspondances qui ne sont pas un lieu (ex. une rue).
    if (hit.class && !PLACE_CLASSES.has(hit.class)) return null;
    const lat = parseFloat(hit.lat);
    const lng = parseFloat(hit.lon);
    // Filet final : hors des bornes du Québec → rejeté.
    if (lat < QC_BOUNDS.latMin || lat > QC_BOUNDS.latMax || lng < QC_BOUNDS.lngMin || lng > QC_BOUNDS.lngMax) {
      return null;
    }
    return { lat, lng };
  } catch (e: any) {
    logger.warn(`[geocode] échec Nominatim pour "${city}": ${e?.message}`);
    return null;
  }
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
