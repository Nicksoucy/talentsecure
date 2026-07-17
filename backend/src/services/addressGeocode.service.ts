/**
 * Géocodage NIVEAU ADRESSE pour les employés (carte des agents actifs).
 *
 * Contrairement à cityGeocode.service (villes/limites admin seulement, filtre
 * PLACE_CLASSES anti-rues), on veut ici la précision RUE : requête Nominatim
 * structurée street/city/postalcode (country=Canada), repli free-form, borne QC
 * conservée. Chaîne de repli : adresse exacte → centroïde FSA (offline) →
 * centre-ville. Résultat persisté sur la ligne employé — pas de table cache
 * (volume faible ; re-géocodage seulement si l'adresse change ou lat manquant).
 */
import { prisma } from '../config/database';
import logger from '../config/logger';
import { invalidateCaches } from '../utils/cacheInvalidation';
import { canonicalCity } from '../utils/cityNormalize';
import {
  isInQuebecBounds,
  nominatimReverse,
  nominatimSearch,
  resolveCityCoordinates,
  resolvePostalCoordinates,
} from './cityGeocode.service';

export const EMPLOYEE_MAPPOINTS_CACHE_KEY = 'employees:map-points';

export type EmployeeGeocodeSource = 'address' | 'postal' | 'city';

export interface EmployeeGeoInput {
  address?: string | null;
  city?: string | null;
  postalCode?: string | null;
}

export interface EmployeeGeocode {
  lat: number;
  lng: number;
  source: EmployeeGeocodeSource;
}

/** Premier hit Nominatim → coordonnées valides dans les bornes QC, sinon null. */
function parseHit(hit: any): { lat: number; lng: number } | null {
  if (!hit || !hit.lat || !hit.lon) return null;
  const lat = parseFloat(hit.lat);
  const lng = parseFloat(hit.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (!isInQuebecBounds(lat, lng)) return null; // carte QC seulement
  return { lat, lng };
}

/**
 * Précision rue : requête structurée (street/city/postalcode) puis repli
 * free-form « <adresse>, <ville>, Québec, Canada » pour les adresses
 * incomplètes ou mal découpées que la requête structurée rate.
 */
export async function geocodeStreetAddress(input: {
  address: string;
  city?: string | null;
  postalCode?: string | null;
}): Promise<{ lat: number; lng: number } | null> {
  const street = input.address.trim();
  if (!street) return null;

  const structured: Record<string, string> = { street, country: 'Canada' };
  const city = (input.city || '').trim();
  const postalCode = (input.postalCode || '').trim();
  if (city) structured.city = city;
  if (postalCode) structured.postalcode = postalCode;
  const byStructured = parseHit(await nominatimSearch(structured));
  if (byStructured) return byStructured;

  const q = [street, city || null, 'Québec', 'Canada'].filter(Boolean).join(', ');
  return parseHit(await nominatimSearch({ q }));
}

/** Chaîne employé : adresse exacte → centroïde FSA (offline) → centre-ville. */
export async function resolveEmployeeCoordinates(
  input: EmployeeGeoInput
): Promise<EmployeeGeocode | null> {
  const address = (input.address || '').trim();
  if (address) {
    const exact = await geocodeStreetAddress({
      address,
      city: input.city,
      postalCode: input.postalCode,
    });
    if (exact) return { ...exact, source: 'address' };
  }

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

const CANADIAN_POSTAL_RE = /^[A-Za-z]\d[A-Za-z]\s?\d[A-Za-z]\d$/;

/**
 * Complète la ville et le code postal MANQUANTS d'un employé géolocalisé, par
 * géocodage INVERSE de ses coordonnées (cas : adresse Agendrix sans ville
 * détectable, mais point exact trouvé). N'écrase JAMAIS une valeur existante.
 * Retourne les champs écrits, ou null si rien à faire / rien trouvé.
 */
export async function fillMissingContactFieldsFromCoords(
  employeeId: string
): Promise<{ city?: string; postalCode?: string } | null> {
  const emp = await prisma.employee.findUnique({
    where: { id: employeeId },
    select: { lat: true, lng: true, city: true, postalCode: true },
  });
  if (!emp || emp.lat == null || emp.lng == null) return null;

  const needCity = !(emp.city || '').trim();
  const needPostal = !(emp.postalCode || '').trim();
  if (!needCity && !needPostal) return null;

  const rev = await nominatimReverse(emp.lat, emp.lng);
  const addr = rev?.address;
  if (!addr) return null;

  const data: { city?: string; postalCode?: string } = {};
  if (needCity) {
    const raw = addr.city || addr.town || addr.village || addr.municipality || addr.suburb || '';
    const city = canonicalCity(raw);
    if (city) data.city = city;
  }
  if (needPostal && addr.postcode && CANADIAN_POSTAL_RE.test(String(addr.postcode).trim())) {
    const compact = String(addr.postcode).trim().toUpperCase().replace(/\s+/g, '');
    data.postalCode = `${compact.slice(0, 3)} ${compact.slice(3)}`;
  }
  if (Object.keys(data).length === 0) return null;

  await prisma.employee.update({ where: { id: employeeId }, data });
  return data;
}

/**
 * Géocode un employé et persiste lat/lng/geocodedAt/geocodeSource, puis invalide
 * le cache des points de carte. Complète aussi ville/code postal manquants par
 * géocodage inverse quand un point a été trouvé. Ne throw jamais → sûr en
 * fire-and-forget depuis les contrôleurs (la réponse HTTP n'attend pas Nominatim).
 */
export async function geocodeEmployeeById(employeeId: string): Promise<EmployeeGeocode | null> {
  try {
    const employee = await prisma.employee.findUnique({
      where: { id: employeeId },
      select: { address: true, city: true, postalCode: true },
    });
    if (!employee) return null;

    const geo = await resolveEmployeeCoordinates(employee);
    await prisma.employee.update({
      where: { id: employeeId },
      data: {
        lat: geo?.lat ?? null,
        lng: geo?.lng ?? null,
        geocodedAt: new Date(),
        geocodeSource: geo?.source ?? null,
      },
    });
    if (geo) {
      await fillMissingContactFieldsFromCoords(employeeId).catch(() => null);
    }
    await invalidateCaches({ statKeys: [EMPLOYEE_MAPPOINTS_CACHE_KEY] });
    return geo;
  } catch (e: any) {
    logger.warn(`[geocode] employé ${employeeId} non géocodé: ${e?.message}`);
    return null;
  }
}
