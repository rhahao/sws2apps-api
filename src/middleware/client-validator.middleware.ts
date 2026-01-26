import { Request, Response, NextFunction } from 'express';
import { appService } from '../services/index.js';
import { isVersionSupported, logger } from '../utils/index.js';

/**
 * Middleware to enforce minimum version requirements for the 'Organized' app.
 * Relies on global HeaderSchema validation for initial type/presence checks.
 */
export const clientValidator = (
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  const appClient = req.headers['appclient'] as string;
  const appVersion = req.headers['appversion'] as string;

  // HeaderSchema already ensures appversion is present if appclient is 'Organized'
  if (appClient === 'Organized') {
    const isSupported = isVersionSupported(
      appVersion,
      appService.clientMinimumVersion,
    );

    if (!isSupported) {
      logger.warn(
        `Rejected outdated client: ${appVersion} (Minimum: ${appService.clientMinimumVersion})`,
      );

      res.status(426).json({
        success: false,
        error: {
          message: 'A newer version of the app is required to continue.',
          code: 'api.client.upgrade_required',
          minimumVersion: appService.clientMinimumVersion,
        },
      });
      return;
    }
  }

  next();
};
