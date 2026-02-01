import { Request, Response, NextFunction } from 'express';
import Service from '../services/index.js';
import Utility from '../utils/index.js';

/**
 * Middleware to enforce minimum version requirements for the 'Organized' app.
 * Relies on global HeaderSchema validation for initial type/presence checks.
 */
export const clientValidator = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const appClient = req.headers['appclient'] as string;
  const appVersion = req.headers['appversion'] as string;

  // HeaderSchema already ensures appversion is present if appclient is 'Organized'
  if (appClient === 'Organized') {
    const isSupported = Utility.Version.isSupported(
      appVersion,
      Service.API.settings.clientMinimumVersion
    );

    if (!isSupported) {
      Utility.Logger.warn(
        `Rejected outdated client: ${appVersion} (Minimum: ${Service.API.settings.clientMinimumVersion})`
      );

      res.status(426).json({
        success: false,
        error: {
          message: 'A newer version of the app is required to continue.',
          code: 'api.client.upgrade_required',
          minimumVersion: Service.API.settings.clientMinimumVersion,
        },
      });
      return;
    }
  }

  next();
};
