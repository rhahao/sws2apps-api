import { Request, Response, NextFunction } from 'express';
import Service from '../services/index.js';
import Utility from '../utils/index.js';

/**
 * Middleware to enforce minimum version requirements for the 'Organized' app.
 * This middleware is designed to be robust and handle cases where headers might be missing.
 */
export const clientValidator = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const appClient = req.headers['appclient'] as string;
  const appVersion = req.headers['appversion'] as string;

  if (appClient === 'Organized') {
    // First, ensure the appVersion header exists, then check if it is supported.
    const isSupported = appVersion && Utility.Version.isSupported(
      appVersion,
      Service.API.settings.clientMinimumVersion
    );

    if (!isSupported) {
      Utility.Logger.warn(
        `Rejected client with missing or outdated version: ${appVersion} (Minimum: ${Service.API.settings.clientMinimumVersion})`
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
