/**
 * Utilitaires géographiques pour la recherche par rayon (Québec).
 * Pas de PostGIS : pré-filtre bounding-box (SQL) + haversine exact (Node).
 */

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
