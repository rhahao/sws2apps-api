import { Request, Response } from 'express';
import { logger } from '../utils/index.js';
import { appService } from '../services/index.js';

export const getFeatureFlags = async (req: Request, res: Response) => {
  try {
    const installationId = req.headers['installation'] as string;

    let userId = req.headers['user'] as string | undefined;

    const knownInstallation = appService.installations.find(
      (i) => i.id === installationId
    );

    // installation not found, save it
    if (!knownInstallation) {
      const installations = [...appService.installations];

      installations.push({
        id: installationId,
        last_used: new Date().toISOString(),
        user: userId ?? '',
      });

      await appService.saveInstallations(installations);
    }

    userId = knownInstallation?.user || userId;

    const result = await appService.evaluateFeatureFlags(
      installationId,
      userId
    );

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
