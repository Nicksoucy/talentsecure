// CRITICAL: env validation must run before any other app import.
// It loads dotenv and throws if JWT_SECRET / JWT_REFRESH_SECRET / DATABASE_URL
// are missing or use insecure defaults — preventing boot with a known secret.
import './config/env';

import { createApp } from './app';
import logger from './config/logger';
import { disconnectDatabase } from './config/database';
import { startScheduler } from './jobs/scheduler';

const app = createApp();
const PORT = parseInt(process.env.PORT || '8080', 10);

// Start server
const HOST = '0.0.0.0'; // CRITICAL for Cloud Run - must bind to all interfaces
const server = app.listen(PORT, HOST, () => {
  logger.info(`TalentSecure API demarree sur http://${HOST}:${PORT}`);
  logger.info(`Environnement: ${process.env.NODE_ENV || 'development'}`);
  logger.info(`CORS active pour: ${process.env.FRONTEND_URL || 'http://localhost:5173'}`);

  // Démarre les jobs cron uniquement si désactivé explicitement (test/dev)
  if (process.env.DISABLE_SCHEDULER !== 'true') {
    startScheduler();
  } else {
    logger.info('[scheduler] désactivé (DISABLE_SCHEDULER=true)');
  }
});

// O4 (audit) — timeouts keep-alive alignés au-delà de l'idle du load balancer
// Cloud Run pour éviter des resets de connexion sporadiques côté client.
server.keepAliveTimeout = 620000;
server.headersTimeout = 630000;

// O4 — arrêt gracieux : Cloud Run envoie SIGTERM avant de tuer l'instance. On
// cesse d'accepter de NOUVELLES connexions, on laisse les requêtes en vol se
// terminer (exports/PDF longs), puis on ferme Prisma. Filet : sortie après 10 s.
const gracefulShutdown = (signal: string) => {
  logger.info(`[shutdown] ${signal} reçu — arrêt gracieux en cours`);
  server.close(async () => {
    try {
      await disconnectDatabase();
    } catch (e) {
      logger.error('[shutdown] erreur fermeture Prisma', { error: (e as Error).message });
    }
    process.exit(0);
  });
  setTimeout(() => {
    logger.error('[shutdown] délai de drain dépassé — arrêt forcé');
    process.exit(0);
  }, 10000).unref();
};
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

export default app;
