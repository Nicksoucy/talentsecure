import express, { Application, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import path from 'path';
import { randomUUID } from 'crypto';

// Load environment variables
dotenv.config();

// Import passport configuration
import passport from './config/passport';
import logger from './config/logger';
import { httpLoggerWithSkip } from './middleware/logging.middleware';
// import { sanitizeRequest } from './middleware/sanitize.middleware'; // Temporarily disabled - missing xss dependency
import { ApiError } from './utils/apiError';
import { errorResponse } from './utils/response';

// Import routes
import authRoutes from './routes/auth.routes';
import clientAuthRoutes from './routes/client-auth.routes';
import candidateRoutes from './routes/candidate.routes';
import catalogueRoutes from './routes/catalogue.routes';
import clientRoutes from './routes/client.routes';
import prospectRoutes from './routes/prospect.routes';
import webhookRoutes from './routes/webhook.routes';
import adminRoutes from './routes/admin.routes';
import wishlistRoutes from './routes/wishlist.routes';
import skillsRoutes from './routes/skills.routes';

const app: Application = express();
const PORT = parseInt(process.env.PORT || '8080', 10);

// Security middleware
app.use(helmet());

// CORS configuration
const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:5174',
  process.env.FRONTEND_URL,
].filter(Boolean) as string[];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);

    if (process.env.NODE_ENV === 'development' && origin.startsWith('http://localhost:')) {
      return callback(null, true);
    }

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

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
// app.use(sanitizeRequest); // Temporarily disabled - missing xss dependency

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

// Health check endpoint
app.get('/health', (req: Request, res: Response) => {
  res.status(200).json({
    status: 'OK',
    message: 'TalentSecure API en ligne',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
  });
});

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/client-auth', clientAuthRoutes);
app.use('/api/candidates', candidateRoutes);
app.use('/api/catalogues', catalogueRoutes);
app.use('/api/clients', clientRoutes);
app.use('/api/prospects', prospectRoutes);
app.use('/api/webhooks', webhookRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/wishlist', wishlistRoutes);
app.use('/api/skills', skillsRoutes);
// app.use('/api/users', userRoutes);

// 404 handler
app.use((req: Request, res: Response, next: NextFunction) => {
  next(new ApiError(404, 'Route non trouvee', 'ROUTE_NON_TROUVEE', [
    {
      field: 'path',
      message: `La ressource ${req.method} ${req.path} est introuvable`,
    },
  ]));
});

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

  errorResponse(res, apiError, requestId);
});

// Start server
const HOST = '0.0.0.0'; // CRITICAL for Cloud Run - must bind to all interfaces
app.listen(PORT, HOST, () => {
  logger.info(`TalentSecure API demarree sur http://${HOST}:${PORT}`);
  logger.info(`Environnement: ${process.env.NODE_ENV || 'development'}`);
  logger.info(`CORS active pour: ${process.env.FRONTEND_URL || 'http://localhost:5173'}`);
});

export default app;
