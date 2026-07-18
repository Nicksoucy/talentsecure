import { Request, Response, NextFunction } from 'express';
import { prisma } from '../config/database';
import { getCache, setCache } from '../config/cache';
import { buildGeoMapPoints } from '../utils/geo';
import { MANDATE_MAPPOINTS_CACHE_KEY } from '../services/mandateGeocode.service';

/**
 * Points carte des mandats (sites XGuard), regroupés par coordonnées — libellé =
 * nom(s) du/des mandat(s) à cette adresse, quelle que soit la source
 * (adresse/postal/ville). Même enveloppe que les cartes candidats/employés
 * (GeoPointsMap côté frontend, rendus en ROSE via la couche « mandats »).
 * La colonne Description (secrets) n'est PAS stockée → rien de sensible ici.
 */
export const getMandatesMapPoints = async (
  _req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const cached = await getCache<{ success: boolean; data: any }>(MANDATE_MAPPOINTS_CACHE_KEY);
    if (cached) {
      return res.json(cached);
    }

    const mandates = await prisma.mandate.findMany({
      where: { isDeleted: false },
      select: { lat: true, lng: true, geocodeSource: true, postalCode: true, city: true, name: true },
    });

    const { points, unplaced } = buildGeoMapPoints(mandates, {
      nameLabelSources: ['address', 'postal', 'city'],
    });

    const payload = { success: true, data: { points, unplaced } };
    await setCache(MANDATE_MAPPOINTS_CACHE_KEY, payload, 300);

    res.json(payload);
  } catch (error) {
    next(error);
  }
};
