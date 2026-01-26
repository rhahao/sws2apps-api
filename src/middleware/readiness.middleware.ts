import { Request, Response, NextFunction } from 'express';
import { appService } from '../services/index.js';

/**
 * Middleware that guards API endpoints until the system is fully initialized.
 */
export const readinessGuard = (
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  // Always permit health checks
  if (req.path === '/health' || req.path === '/') {
    return next();
  }

  if (!appService.isReady) {
    res.status(503).json({
      success: false,
      error: {
        message: 'System is initializing storage and i18n. Please try again.',
        code: 'api.server.not_ready',
      },
    });
    return;
  }

  next();
};
