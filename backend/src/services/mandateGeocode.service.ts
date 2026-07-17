/**
 * Géocodage des mandats (sites XGuard) pour la couche rose des cartes.
 *
 * Réutilise la chaîne de résolution des employés (resolveEmployeeCoordinates :
 * adresse exacte → centroïde FSA → centre-ville), agnostique à l'entité. Pas de
 * reverse-fill : le libellé d'un pin de mandat = le NOM du mandat, pas la ville.
 */
import { prisma } from '../config/database';
import logger from '../config/logger';
import { invalidateCaches } from '../utils/cacheInvalidation';
import { EmployeeGeocode, resolveEmployeeCoordinates } from './addressGeocode.service';

export const MANDATE_MAPPOINTS_CACHE_KEY = 'mandates:map-points';

/** Invalidation du cache des points de carte des mandats. */
export const invalidateMandateCaches = () =>
  invalidateCaches({ statKeys: [MANDATE_MAPPOINTS_CACHE_KEY] });

/**
 * Géocode un mandat et persiste lat/lng/geocodedAt/geocodeSource, puis invalide
 * le cache des points. Ne throw jamais → sûr en fire-and-forget / en boucle
 * d'import.
 */
export async function geocodeMandateById(mandateId: string): Promise<EmployeeGeocode | null> {
  try {
    const mandate = await prisma.mandate.findUnique({
      where: { id: mandateId },
      select: { address: true, city: true, postalCode: true },
    });
    if (!mandate) return null;

    const geo = await resolveEmployeeCoordinates(mandate);
    await prisma.mandate.update({
      where: { id: mandateId },
      data: {
        lat: geo?.lat ?? null,
        lng: geo?.lng ?? null,
        geocodedAt: new Date(),
        geocodeSource: geo?.source ?? null,
      },
    });
    await invalidateMandateCaches();
    return geo;
  } catch (e: any) {
    logger.warn(`[geocode] mandat ${mandateId} non géocodé: ${e?.message}`);
    return null;
  }
}
