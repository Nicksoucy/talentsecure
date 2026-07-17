/**
 * Utilitaires géographiques pour la recherche par rayon (Québec).
 * Pas de PostGIS : pré-filtre bounding-box (SQL) + haversine exact (Node).
 */
import { canonicalCity } from './cityNormalize';

export interface LatLng {
  lat: number;
  lng: number;
}

const EARTH_RADIUS_KM = 6371;
const toRad = (deg: number): number => (deg * Math.PI) / 180;

/** Distance en km entre deux points (formule haversine). */
export function haversineKm(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(x));
}

export interface BBox {
  latMin: number;
  latMax: number;
  lngMin: number;
  lngMax: number;
}

/**
 * Carré lat/lng englobant le cercle (centre, rayon km). Sert de PRÉ-FILTRE SQL
 * bon marché (index sur lat/lng) avant le haversine exact qui affine le cercle.
 * 1° lat ≈ 111 km ; 1° lng ≈ 111·cos(lat) km.
 */
export function boundingBox(center: LatLng, radiusKm: number): BBox {
  const dLat = radiusKm / 111;
  const cos = Math.cos(toRad(center.lat));
  const dLng = radiusKm / (111 * Math.max(Math.abs(cos), 1e-6));
  return {
    latMin: center.lat - dLat,
    latMax: center.lat + dLat,
    lngMin: center.lng - Math.abs(dLng),
    lngMax: center.lng + Math.abs(dLng),
  };
}

// ───────────────────────────────────────────────────────────────────────────
// Points carte « réels » : personnes regroupées par coordonnées individuelles.
// Partagé entre prospects et candidats (même affichage côté admin).
// ───────────────────────────────────────────────────────────────────────────

export interface GeoPersonRow {
  lat: number | null;
  lng: number | null;
  geocodeSource: string | null;
  postalCode: string | null;
  city: string | null;
  /** Nom affichable — requis seulement pour les libellés par noms (employés). */
  name?: string | null;
}

export interface GeoMapPoint {
  lat: number;
  lng: number;
  count: number;
  source: string; // 'address' | 'postal' | 'city'
  label: string;
}

export interface GeoMapPointsOptions {
  /**
   * Sources dont le libellé du point = noms des personnes (ex. ['address'] pour
   * la carte des agents : un pin à l'adresse exacte porte le nom de l'agent).
   */
  nameLabelSources?: string[];
  /** Nombre max de noms affichés avant « +N » (défaut 3). */
  maxNames?: number;
}

/**
 * Regroupe des personnes géocodées par coordonnées EXACTES — adresse (source
 * 'address'), centroïde du secteur postal (FSA, source 'postal') ou centre-ville
 * (source 'city') — et produit les points de la carte (libellé = secteur FSA ·
 * ville dominante, ou noms des personnes pour les sources de opts.nameLabelSources).
 * Renvoie aussi le nombre de personnes non géolocalisées.
 */
export function buildGeoMapPoints(
  rows: GeoPersonRow[],
  opts?: GeoMapPointsOptions
): {
  points: GeoMapPoint[];
  unplaced: number;
} {
  const nameSources = new Set(opts?.nameLabelSources ?? []);
  const maxNames = opts?.maxNames ?? 3;

  interface PointGroup {
    lat: number;
    lng: number;
    count: number;
    source: string;
    fsa: string | null;
    cities: Map<string, number>;
    names: string[];
  }
  const groups = new Map<string, PointGroup>();
  let unplaced = 0;

  for (const p of rows) {
    if (p.lat == null || p.lng == null) {
      unplaced++;
      continue;
    }
    const key = `${p.lat}|${p.lng}`;
    let g = groups.get(key);
    if (!g) {
      g = {
        lat: p.lat,
        lng: p.lng,
        count: 0,
        source: p.geocodeSource || 'city',
        fsa: null,
        cities: new Map(),
        names: [],
      };
      groups.set(key, g);
    }
    g.count++;
    if (nameSources.size > 0 && p.name) g.names.push(p.name);
    const ville = canonicalCity(p.city || '');
    if (ville) g.cities.set(ville, (g.cities.get(ville) || 0) + 1);
    if (!g.fsa && p.postalCode) {
      const f = p.postalCode.trim().toUpperCase().slice(0, 3);
      if (/^[A-Z]\d[A-Z]$/.test(f)) g.fsa = f;
    }
  }

  const points = [...groups.values()]
    .map((g) => {
      // Ville dominante du groupe → libellé lisible du point.
      let topCity = '';
      let topN = 0;
      for (const [c, n] of g.cities) {
        if (n > topN) {
          topCity = c;
          topN = n;
        }
      }
      let label: string;
      if (nameSources.has(g.source) && g.names.length > 0) {
        const shown = g.names.slice(0, maxNames);
        const rest = g.count - shown.length;
        label = rest > 0 ? `${shown.join(', ')} +${rest}` : shown.join(', ');
      } else if (g.source === 'postal') {
        label = `Secteur ${g.fsa ?? '?'}${topCity ? ` · ${topCity}` : ''}`;
      } else if (g.source === 'address') {
        label = topCity ? `Adresse exacte · ${topCity}` : 'Adresse exacte';
      } else {
        label = `${topCity || 'Ville inconnue'} (centre-ville approx.)`;
      }
      return { lat: g.lat, lng: g.lng, count: g.count, source: g.source, label };
    })
    .sort((a, b) => b.count - a.count);

  return { points, unplaced };
}
