import { Request, Response, NextFunction } from 'express';
import { prisma } from '../config/database';
import { getCache, setCache } from '../config/cache';
import { buildGeoMapPoints, GeoPersonRow } from '../utils/geo';
import {
  contractMapPointsCacheKey,
  listContractSummaries,
  loadContractPersonIds,
  normalizeContractCode,
} from '../services/contractLeads.service';

/**
 * Points carte des personnes taguées sur un contrat (ex. « PSB »), toutes
 * sections confondues — prospects, candidats ET employés remontent dans une
 * seule couche, puisqu'un lead de contrat peut vivre à n'importe quelle étape
 * du cycle de vie.
 *
 * Le libellé d'un point = le ou les NOMS des personnes, quelle que soit la
 * source (adresse/postal/ville) : ces pins sont posés sur des personnes, pas
 * sur des secteurs — « Adresse exacte · Montréal » n'apprendrait rien.
 *
 * Un tag périmé (personne déplacée de section, donc nouvel id) est absorbé
 * sans bruit : les filtres isDeleted / isConverted ci-dessous excluent la
 * vieille fiche, donc aucun pin fantôme.
 */
export const getContractMapPoints = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const code = normalizeContractCode(req.params.code);
    const cacheKey = contractMapPointsCacheKey(code);

    const cached = await getCache<{ success: boolean; data: any }>(cacheKey);
    if (cached) {
      return res.json(cached);
    }

    const ids = await loadContractPersonIds(code);

    const select = {
      lat: true,
      lng: true,
      geocodeSource: true,
      postalCode: true,
      city: true,
      firstName: true,
      lastName: true,
    };

    const [prospects, candidates, employees] = await Promise.all([
      ids.prospect.length
        ? prisma.prospectCandidate.findMany({
            where: { id: { in: ids.prospect }, isDeleted: false, isConverted: false },
            select,
          })
        : Promise.resolve([]),
      ids.candidate.length
        ? prisma.candidate.findMany({
            where: { id: { in: ids.candidate }, isDeleted: false },
            select,
          })
        : Promise.resolve([]),
      ids.employee.length
        ? prisma.employee.findMany({
            where: { id: { in: ids.employee }, isDeleted: false },
            select,
          })
        : Promise.resolve([]),
    ]);

    const rows: GeoPersonRow[] = [...prospects, ...candidates, ...employees].map((p) => ({
      lat: p.lat,
      lng: p.lng,
      geocodeSource: p.geocodeSource,
      postalCode: p.postalCode,
      city: p.city,
      name: `${p.firstName} ${p.lastName}`.trim(),
    }));

    const { points, unplaced } = buildGeoMapPoints(rows, {
      nameLabelSources: ['address', 'postal', 'city'],
    });

    const payload = { success: true, data: { points, unplaced } };
    await setCache(cacheKey, payload, 300);

    res.json(payload);
  } catch (error) {
    next(error);
  }
};

/**
 * Liste des contrats ayant au moins un lead actif, avec les décomptes par
 * section. Alimente le filtre « Contrat » des listes côté frontend.
 */
export const listContracts = async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const contracts = await listContractSummaries();
    res.json({ success: true, data: { contracts } });
  } catch (error) {
    next(error);
  }
};
