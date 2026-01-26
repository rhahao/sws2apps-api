import { Request, Response } from 'express';
import { logger } from '../utils/index.js';
import { appService } from '../services/index.js';

export const getFeatureFlags = async (req: Request, res: Response) => {
  try {
    const installationId = req.headers['installation'] as string;
    let userId = req.headers['user'] as string | undefined;

    const knownInstallation = appService.installations.all.find(
      (i) => i.id === installationId
    );
    userId = userId || knownInstallation?.user;

    const result = await appService.evaluateFeatureFlags(
      installationId,
      userId
    );
    await appService.updateInstallationRegistry(installationId, userId);

    logger.info(`Feature flags fetched for installation ${installationId}`);
    res.status(200).json(result);
  } catch (error) {
    logger.error('Error fetching feature flags:', error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Internal server error',
        code: 'api.server.internal_error',
      },
    });
  }
};
