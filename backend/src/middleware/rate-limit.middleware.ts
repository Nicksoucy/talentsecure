/**
 * Rate limiters dédiés pour endpoints sensibles.
 *
 * En complément du rate limit global sur `/api` (defined in server.ts), ces
 * limiteurs serrés protègent les endpoints d'authentification (brute force)
 * et les endpoints publics (énumération de tokens).
 */

import rateLimit from 'express-rate-limit';

// Disable rate limiting under jest so unit tests can hit auth endpoints
// repeatedly without hitting limits. Production and dev keep full enforcement.
const skipInTests = () => process.env.NODE_ENV === 'test';

// 5 tentatives de login par fenêtre de 15 min, par IP.
// Le `keyGenerator` par défaut utilise l'IP. On ne combine pas avec l'email
// pour éviter qu'un attaquant qui connaît un email valide bloque l'utilisateur
// légitime (account lockout DoS).
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Trop de tentatives de connexion. Réessayez dans 15 minutes.',
  skipSuccessfulRequests: true,
  skip: skipInTests,
});

// 10 refresh / heure / IP — généreux pour les SPA mais bloque les abus.
export const refreshLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Trop de demandes de rafraîchissement. Réessayez plus tard.',
  skip: skipInTests,
});

// 30 vues / minute / IP sur le partage public de catalogue. Bloque
// l'énumération brute-force des shareTokens (même si crypto-random les rend
// déjà très difficiles à deviner — defense in depth).
export const publicShareLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Trop de requêtes. Réessayez dans une minute.',
  skip: skipInTests,
});
