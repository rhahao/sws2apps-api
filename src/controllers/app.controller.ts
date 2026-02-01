import { Request, Response } from 'express';
import Service from '../services/index.js';
import Utility from '../utils/index.js';

export const getFeatureFlags = async (req: Request, res: Response) => {
  try {
    const installationId = req.headers['installation'] as string;

    let userId = req.headers['user'] as string | undefined;

    const knownInstallation = Service.API.installations.find(
      (i) => i.id === installationId
    );

    // installation not found, save it
    if (!knownInstallation) {
      const installations = [...Service.API.installations];

      installations.push({
        id: installationId,
        last_used: new Date().toISOString(),
        user: userId ?? '',
      });

      await Service.API.saveInstallations(installations);
    }

    userId = knownInstallation?.user || userId;

    const result = await Service.API.evaluateFeatureFlags(
      installationId,
      userId
    );

    Utility.Logger.info(`Feature flags fetched for installation ${installationId}`);

    res.status(200).json(result);
  } catch (error) {
    Utility.Logger.error('Error fetching feature flags:', error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Internal server error',
        code: 'api.server.internal_error',
      },
    });
  }
};
