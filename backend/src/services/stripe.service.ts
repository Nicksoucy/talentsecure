import Stripe from 'stripe';

type StripeClient = InstanceType<typeof Stripe>;
let _stripe: StripeClient | null = null;

/**
 * Client Stripe initialisé paresseusement. Lève une erreur 503 explicite si
 * la clé n'est pas configurée (Stripe est optionnel au boot).
 */
export function getStripe(): StripeClient {
  if (!_stripe) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) {
      throw Object.assign(new Error('Paiement indisponible : Stripe non configuré.'), { status: 503 });
    }
    _stripe = new Stripe(key);
  }
  return _stripe;
}

export function getWebhookSecret(): string {
  return process.env.STRIPE_WEBHOOK_SECRET || '';
}

export function getClientAppUrl(): string {
  return (
    process.env.CLIENT_APP_URL ||
    'https://talentsecure-frontend-572017163659.northamerica-northeast1.run.app'
  );
}
