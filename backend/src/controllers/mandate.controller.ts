import { Request, Response, NextFunction } from 'express';
import { prisma } from '../config/database';
import { getCache, setCache } from '../config/cache';
import { buildGeoMapPoints } from '../utils/geo';
import { MANDATE_MAPPOINTS_CACHE_KEY } from '../services/mandateGeocode.service';
import { successResponse } from '../utils/response';
import * as mandateService from '../services/mandate.service';
import type { MandateFilters, UpdateMandateProfileInput } from '../validation/mandate.validation';

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

/** Liste paginée des mandats, avec leur profil. Écran de répartition. */
export const listMandates = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { mandates, total, page, limit } = await mandateService.listMandates(
      req.query as unknown as MandateFilters
    );
    return successResponse(res, mandates, {
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    next(error);
  }
};

/** Détail d'un mandat (profil complet). */
export const getMandate = async (req: Request, res: Response, next: NextFunction) => {
  try {
    return successResponse(res, await mandateService.getMandateById(req.params.id));
  } catch (error) {
    next(error);
  }
};

/**
 * Saisie du profil par la répartition. Ne touche jamais l'identité ni l'adresse
 * — celles-ci restent la propriété de l'import Agendrix.
 */
export const updateMandateProfile = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const updated = await mandateService.updateMandateProfile(
      req.params.id,
      req.body as UpdateMandateProfileInput,
      req.user?.id ?? null
    );
    return successResponse(res, updated, { message: 'Profil du mandat mis à jour' });
  } catch (error) {
    next(error);
  }
};

/**
 * Candidats classés pour un mandat.
 *
 * `meta.excludedBy` accompagne toujours la liste : sans lui, une liste courte
 * ressemble à un bogue, alors qu'elle dit en général « 42 candidats n'ont pas
 * de BSP ». C'est aussi ce qui rend le classement contestable — donc défendable.
 */
export const getMandateCandidates = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { limit, includeIneligible } = req.query as unknown as {
      limit?: number;
      includeIneligible?: boolean;
    };
    const { mandate, candidates, meta } = await mandateService.findCandidatesForMandate(
      req.params.id,
      { limit, includeIneligible }
    );
    return successResponse(res, { mandate, candidates }, { meta });
  } catch (error) {
    next(error);
  }
};
