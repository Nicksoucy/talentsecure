import { Request, Response, NextFunction } from 'express';
import { resolveProspectCoordinates } from '../services/cityGeocode.service';

/**
 * Résout une saisie (code postal OU ville, Québec) en coordonnées
 * { lat, lng, source } pour la barre de recherche de la carte (recentrer +
 * déposer un point). Accepte soit un champ unique `q` (détection automatique
 * code postal vs ville), soit `postalCode` / `city` explicites.
 *
 * GET /api/geo/resolve?q=H2X 1Y4   | ?postalCode=H2X1Y4 | ?city=Laval
 */
export const resolveLocation = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const q = (typeof req.query.q === 'string' ? req.query.q : '').trim();
    const explicitPostal = typeof req.query.postalCode === 'string' ? req.query.postalCode : '';
    const explicitCity = typeof req.query.city === 'string' ? req.query.city : '';

    // `q` ressemblant à un code postal canadien (L-C-L…) → traité comme code postal.
    const looksPostal = /^[A-Za-z]\d[A-Za-z]/.test(q.replace(/\s+/g, ''));
    const postalCode = explicitPostal || (looksPostal ? q : '');
    const city = explicitCity || (looksPostal ? '' : q);

    if (!postalCode && !city) {
      return res.status(400).json({ success: false, error: 'Fournir q, postalCode ou city.' });
    }

    const geo = await resolveProspectCoordinates({ postalCode, city });
    if (geo) {
      return res.json({ success: true, data: geo });
    }
    return res.status(404).json({
      success: false,
      error: 'Localisation introuvable au Québec (code postal ou ville).',
    });
  } catch (error) {
    next(error);
  }
};
