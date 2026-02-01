import express, { Express } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import v4Router from './routes/index.js';
import Middleware from './middleware/index.js';
import Service from './services/index.js';
import Config from './config/index.js';
import Utility from './utils/index.js';

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
  app.use(cookieParser(Config.ENV.secEncryptKey));

  // Security middleware
  app.use(helmet());

  app.use(
    cors({
      origin: Config.ENV.cors.allowedOrigins,
      credentials: true,
    })
  );

  // Body parsing middleware (Limited to 5MB)
  app.use(express.json({ limit: '5mb' }));
  app.use(express.urlencoded({ extended: true, limit: '5mb' }));

  // i18n middleware (Language detection & 't' function attachment)
  app.use(Service.i18n.middleware);

  // Serve static files
  app.use(express.static('public'));

  // Rate limiting
  const limiter = rateLimit({
    windowMs: Config.ENV.rateLimit.windowMs,
    max: Config.ENV.rateLimit.max,
    message: 'Too many requests from this IP, please try again later.',
  });

  app.use(limiter);

  // Health check endpoints (Unprotected)
  app.get('/health', (_req, res) => {
    const status = Service.API.isReady ? 'READY' : 'STARTING';
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
  app.use(Middleware.readinessGuard);

  // Mount API versions
  app.use('/api', v4Router);

  // Error handlers (must be last)
  app.use(Middleware.notFoundHandler);
  app.use(Middleware.errorHandler);

  Utility.Logger.info('Express app configured successfully');

  return app;
};

const app = createApp();

export default app;
