import { Request, Response } from 'express';
import { prisma } from '../config/database';
import { getStripe, getWebhookSecret } from '../services/stripe.service';
import logger from '../config/logger';

/**
 * Webhook Stripe — SOURCE DE VÉRITÉ de l'achat.
 * Doit recevoir le body BRUT (express.raw) pour vérifier la signature.
 * Sur checkout.session.completed → crée le ClientPurchase (idempotent).
 */
export const handleStripeWebhook = async (req: Request, res: Response) => {
  const sig = req.headers['stripe-signature'] as string;
  const secret = getWebhookSecret();

  let event: any;
  try {
    event = getStripe().webhooks.constructEvent(req.body, sig, secret);
  } catch (err: any) {
    logger.error(`[stripe] signature invalide: ${err.message}`);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      const md = session.metadata || {};
      const clientId = md.clientId;
      const candidateId = md.candidateId;
      const city = md.city || '';
      // S5 — source de vérité = montant réellement encaissé (amount_total, en cents).
      // On retombe sur metadata.price seulement si amount_total est absent.
      const price = typeof session.amount_total === 'number'
        ? session.amount_total / 100
        : (Number(md.price) || 0);

      if (clientId && candidateId) {
        await prisma.clientPurchase.upsert({
          where: { clientId_candidateId: { clientId, candidateId } },
          update: {},
          create: { clientId, candidateId, type: 'EVALUATED', city, price },
        });
        logger.info(`[stripe] achat enregistré client=${clientId} candidat=${candidateId}`);
      }
    }
  } catch (e: any) {
    logger.error(`[stripe] erreur traitement webhook: ${e.message}`);
    // On renvoie 200 quand même si la signature était valide, pour éviter les
    // retries en boucle ; l'erreur est loggée pour investigation.
  }

  res.json({ received: true });
};
