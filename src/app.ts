import express, { Express } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import v4Router from './routes/index.js';
import {
  errorHandler,
  notFoundHandler,
  readinessGuard,
} from './middleware/index.js';
import { i18nMiddleware, appService } from './services/index.js';
import { ENV } from './config/index.js';
import { logger } from './utils/index.js';

/**
 * Create and configure Express application
 */
const createApp = (): Express => {
  const app = express();

  // Trust the first proxy (reverse proxy/load balancer)
  // This ensures req.ip and rate limiting work correctly
  app.set('trust proxy', 1);

  // Enable response compression (gzip/deflate)
  app.use(compression());

  // Enable cookie parsing with cryptographic signing
  app.use(cookieParser(ENV.secEncryptKey));

  // Security middleware
  app.use(helmet());

  app.use(
    cors({
      origin: ENV.cors.allowedOrigins,
      credentials: true,
    })
  );

  // Body parsing middleware (Limited to 5MB)
  app.use(express.json({ limit: '5mb' }));
  app.use(express.urlencoded({ extended: true, limit: '5mb' }));

  // i18n middleware (Language detection & 't' function attachment)
  app.use(i18nMiddleware);

  // Serve static files
  app.use(express.static('public'));

  // Rate limiting
  const limiter = rateLimit({
    windowMs: ENV.rateLimit.windowMs,
    max: ENV.rateLimit.max,
    message: 'Too many requests from this IP, please try again later.',
  });

  app.use(limiter);

  // Health check endpoints (Unprotected)
  app.get('/health', (_req, res) => {
    const status = appService.isReady ? 'READY' : 'STARTING';
    res.json({
      status,
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    });
  });

  app.get('/', (_req, res) => {
    res.json({
      success: true,
      message: 'sws2apps-api is running',
      timestamp: new Date().toISOString(),
    });
  });

  // Readiness Guard (Protects all routes below)
  app.use(readinessGuard);

  // Mount API versions
  app.use('/api', v4Router);

  // Error handlers (must be last)
  app.use(notFoundHandler);
  app.use(errorHandler);

  logger.info('Express app configured successfully');

  return app;
};

const app = createApp();

export default app;
