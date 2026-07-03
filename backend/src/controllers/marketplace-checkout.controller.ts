import { Request, Response, NextFunction } from 'express';
import { prisma } from '../config/database';
import { getStripe, getClientAppUrl } from '../services/stripe.service';
import { ApiError } from '../utils/apiError';

const MARKETPLACE_WHERE = {
  isActive: true,
  isDeleted: false,
  isArchived: false,
};

/**
 * Crée une session Stripe Checkout pour acheter UN candidat évalué.
 * Prix issu de CityPricing (évalué) pour la ville du candidat (défaut 30 $).
 */
export const createCandidateCheckout = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const clientId = (req as any).client?.id;
    if (!clientId) throw new ApiError(401, 'Non authentifié');

    const candidate = await prisma.candidate.findFirst({
      where: { id, ...MARKETPLACE_WHERE },
      select: { id: true, firstName: true, city: true },
    });
    if (!candidate) throw new ApiError(404, 'Candidat non disponible');

    // Déjà acheté ?
    const existing = await prisma.clientPurchase
      .findUnique({ where: { clientId_candidateId: { clientId, candidateId: id } } })
      .catch(() => null);
    if (existing) throw new ApiError(400, 'Ce candidat est déjà acheté.');

    // Prix (CityPricing évalué, sinon défaut)
    const cityPricing = candidate.city
      ? await prisma.cityPricing.findUnique({ where: { city: candidate.city } }).catch(() => null)
      : null;
    const price = cityPricing ? Number(cityPricing.evaluatedCandidatePrice) : 30;

    const stripe = getStripe();
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [
        {
          price_data: {
            currency: 'cad',
            product_data: { name: `Candidat ${candidate.firstName} (${candidate.city || 'N/A'})` },
            unit_amount: Math.round(price * 100),
          },
          quantity: 1,
        },
      ],
      metadata: { clientId, candidateId: id, city: candidate.city || '', price: String(price) },
      success_url: `${getClientAppUrl()}/client/talents?purchase=success`,
      cancel_url: `${getClientAppUrl()}/client/talents?purchase=cancel`,
    });

    res.json({ url: session.url });
  } catch (error: any) {
    if (error?.status) return res.status(error.status).json({ error: error.message });
    next(error);
  }
};
