import { config } from '../config/index.js';
import { logger } from '../utils/index.js';
import { appService } from './app.service.js';
import { congregationRegistry } from './congregation_registry.service.js';
import { s3Service } from './s3.service.js';
import { schedulerService } from './scheduler.service.js';
import { seederService } from './seeder.service.js';
import { userRegistry } from './user_registry.service.js';

export const initializeStorage = async () => {
  const bucketName = config.S3.bucketName;
  const settingsKey = 'api/settings.json';
  const flagsKey = 'api/flags.json';
  const installationsKey = 'api/installations.json';

  try {
    // Ensure the bucket exists (useful for MinIO dev)
    await s3Service.ensureBucketExists();

    logger.info(`Initializing storage for bucket: ${bucketName}...`);

    let settingsExists = false;

    // Check if settings.json exists
    try {
      settingsExists = await s3Service.fileExists(settingsKey);
    } catch (error) {
      logger.error(`Error checking for ${settingsKey}:`, error);
      throw error;
    }

    if (!settingsExists) {
      logger.info(`${settingsKey} not found. Creating default settings...`);

      const defaultSettings = {
        client_minimum_version: '1.0.0',
      };

      await s3Service.uploadFile(
        settingsKey,
        JSON.stringify(defaultSettings),
        'application/json'
      );

      logger.info(`${settingsKey} created successfully.`);
      settingsExists = true;
    }

    if (settingsExists) {
      // Read the settings from S3
      const content = await s3Service.getFile(settingsKey);
      if (content) {
        try {
          const settings = JSON.parse(content);
          if (settings.client_minimum_version) {
            appService.clientMinimumVersion = settings.client_minimum_version;
            logger.info(
              `Loaded client minimum version: ${appService.clientMinimumVersion}`
            );
          }
        } catch (parseError) {
          logger.error(`Error parsing ${settingsKey}:`, parseError);
        }
      }
    }

    // --- Feature Flags Initialization ---
    let flagsExists = false;
    try {
      flagsExists = await s3Service.fileExists(flagsKey);
    } catch (error) {
      logger.error(`Error checking for ${flagsKey}:`, error);
    }

    if (!flagsExists) {
      logger.info(`${flagsKey} not found. Creating default flags...`);
      await s3Service.uploadFile(
        flagsKey,
        JSON.stringify([]),
        'application/json'
      );
      flagsExists = true;
    }

    if (flagsExists) {
      const content = await s3Service.getFile(flagsKey);
      if (content) {
        try {
          appService.flags = JSON.parse(content);
          logger.info(`Loaded ${appService.flags.length} feature flags`);
        } catch (parseError) {
          logger.error(`Error parsing ${flagsKey}:`, parseError);
        }
      }
    }

    // --- Installations Initialization ---
    let installationsExists = false;
    try {
      installationsExists = await s3Service.fileExists(installationsKey);
    } catch (error) {
      logger.error(`Error checking for ${installationsKey}:`, error);
    }

    if (!installationsExists) {
      logger.info(`${installationsKey} not found. Creating default storage...`);
      const defaultInstallations = {
        linked: [],
        pending: [],
      };
      await s3Service.uploadFile(
        installationsKey,
        JSON.stringify(defaultInstallations),
        'application/json'
      );
      installationsExists = true;
    }

    if (installationsExists) {
      const content = await s3Service.getFile(installationsKey);
      if (content) {
        try {
          appService.installations = JSON.parse(content);
          appService.processInstallations();
          logger.info(
            `Loaded ${appService.installations.all.length} total installations`
          );
        } catch (parseError) {
          logger.error(`Error parsing ${installationsKey}:`, parseError);
        }
      }
    }

    // Index users and congregations
    await userRegistry.loadIndex();
    await congregationRegistry.loadIndex();

    // Run development seeder (skips in production)
    await seederService.runDevelopmentSeeder();

    // Register Background Tasks
    schedulerService.register({
      name: 'User History Maintenance',
      interval: 24 * 60 * 60 * 1000, // 24 Hours
      runOnInit: true,
      run: () => userRegistry.performHistoryMaintenance(),
    });

    logger.info('Storage initialization completed successfully.');
  } catch (error) {
    logger.error('Error during storage initialization:', error);
  }
};
