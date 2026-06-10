// CRITICAL: env validation must run before any other app import.
// It loads dotenv and throws if JWT_SECRET / JWT_REFRESH_SECRET / DATABASE_URL
// are missing or use insecure defaults — preventing boot with a known secret.
import './config/env';

// Initialize Sentry early (no-op if SENTRY_DSN unset) so boot-time errors
// are captured before they crash the process.
import { Sentry, sentryEnabled } from './config/sentry';

import express, { Application, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import * as path from 'path';
import { randomUUID } from 'crypto';

// Import passport configuration
import passport from './config/passport';
import logger from './config/logger';
import { httpLoggerWithSkip } from './middleware/logging.middleware';
import { sanitizeRequest } from './middleware/sanitize.middleware';
import { ApiError } from './utils/apiError';
import { errorResponse } from './utils/response';

// Import routes
import authRoutes from './routes/auth.routes';
import clientAuthRoutes from './routes/client-auth.routes';
import candidateRoutes from './routes/candidate.routes';
import catalogueRoutes from './routes/catalogue.routes';
import clientRoutes from './routes/client.routes';
import prospectRoutes from './routes/prospect.routes';
import geoRoutes from './routes/geo.routes';
import employeeRoutes from './routes/employee.routes';
import contactLifecycleRoutes from './routes/contact-lifecycle.routes';
import webhookRoutes from './routes/webhook.routes';
import adminRoutes from './routes/admin.routes';
import wishlistRoutes from './routes/wishlist.routes';
import exportRoutes from './routes/export.routes';
import skillsRoutes from './routes/skills.routes';
import extractionRoutes from './routes/extraction.routes';
import marketplaceRoutes from './routes/talent-marketplace.routes';
import uniformRoutes from './routes/uniform.routes';
import notificationRoutes from './routes/notification.routes';
import dashboardRoutes from './routes/dashboard.routes';
import userRoutes from './routes/user.routes';
import { startScheduler } from './jobs/scheduler';

const app: Application = express();
const PORT = parseInt(process.env.PORT || '8080', 10);

// S8 — derrière le proxy Cloud Run (un seul hop), faire confiance au premier
// X-Forwarded-For pour que `req.ip` soit l'IP réelle du client. Sans cela les
// rate-limiters (login, global) keyent sur l'IP du proxy = compteurs partagés
// par tous les utilisateurs (429 collectifs) et IP d'audit fausses.
app.set('trust proxy', 1);

// Security middleware
app.use(helmet());

// CORS configuration
// S8 — liste blanche d'origines exactes (ports dev usuels + FRONTEND_URL).
// On retire l'ancien joker dev `localhost:*` qui acceptait n'importe quel port.
// Pour un autre port de dev, l'ajouter ici (dev-only, aucun impact prod).
const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:3000',
  process.env.FRONTEND_URL,
].filter(Boolean) as string[];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);

    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    return callback(new Error('Origine non autorisee par la politique CORS'));
  },
  credentials: true,
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10),
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100', 10),
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Trop de requetes depuis cette IP, veuillez reessayer plus tard.',
});
app.use('/api', limiter);
app.use(httpLoggerWithSkip);

// Webhook Stripe : doit recevoir le body BRUT (avant express.json) pour
// vérifier la signature.
import { handleStripeWebhook } from './controllers/stripe-webhook.controller';
app.post('/api/webhooks/stripe', express.raw({ type: 'application/json' }), handleStripeWebhook);

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(sanitizeRequest);

// Initialize Passport
app.use(passport.initialize());

// Static files (for uploads)
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Serve videos with proper headers for streaming
app.use('/uploads/videos', express.static(path.join(__dirname, '../uploads/videos'), {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.mp4')) {
      res.setHeader('Content-Type', 'video/mp4');
    }
  },
}));

// Health check endpoints.
// /health and /health/live: liveness — fast, no dependency checks (Cloud Run probes).
// /health/ready: readiness — verifies DB, Redis, R2; returns 503 if degraded.
import { livenessHandler, readinessHandler } from './controllers/health.controller';
app.get('/health', livenessHandler);
app.get('/health/live', livenessHandler);
app.get('/health/ready', readinessHandler);

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/client-auth', clientAuthRoutes);
app.use('/api/candidates', candidateRoutes);
app.use('/api/catalogues', catalogueRoutes);
app.use('/api/clients', clientRoutes);
app.use('/api/prospects', prospectRoutes);
app.use('/api/geo', geoRoutes);
app.use('/api/employees', employeeRoutes);
app.use('/api/contacts', contactLifecycleRoutes);
app.use('/api/webhooks', webhookRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/wishlist', wishlistRoutes);
app.use('/api/exports', exportRoutes);
app.use('/api/skills', skillsRoutes);
app.use('/api/extraction', extractionRoutes);
app.use('/api/marketplace', marketplaceRoutes);
app.use('/api/uniforms', uniformRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/users', userRoutes);

// 404 handler
app.use((req: Request, res: Response, next: NextFunction) => {
  next(new ApiError(404, 'Route non trouvee', 'ROUTE_NON_TROUVEE', [
    {
      field: 'path',
      message: `La ressource ${req.method} ${req.path} est introuvable`,
    },
  ]));
});

// Sentry request handler must be registered AFTER routes (Sentry v8 pattern).
// We capture only 5xx via the global handler below so noisy 4xx doesn't
// drown alerts.

// Global error handler
app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
  const apiError = ApiError.fromUnknown(err);
  const requestId = (req.headers['x-request-id'] as string) || randomUUID();
  res.setHeader('X-Request-ID', requestId);

  logger.error('Erreur API', {
    requestId,
    path: req.path,
    method: req.method,
    statusCode: apiError.statusCode,
    stack: err instanceof Error ? err.stack : undefined,
  });

  // Forward 5xx (and unknown 0/undefined) to Sentry; skip 4xx noise.
  if (sentryEnabled && apiError.statusCode >= 500) {
    Sentry.withScope((scope) => {
      scope.setTag('requestId', requestId);
      scope.setExtra('path', req.path);
      scope.setExtra('method', req.method);
      Sentry.captureException(err);
    });
  }

  errorResponse(res, apiError, requestId);
});

// Start server
const HOST = '0.0.0.0'; // CRITICAL for Cloud Run - must bind to all interfaces
app.listen(PORT, HOST, () => {
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

export default app;

