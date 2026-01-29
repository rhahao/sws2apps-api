import { ENV } from '../config/index.js';
import { logger } from '../utils/index.js';
import { appService } from './app.service.js';
import { congregationRegistry } from './congregation_registry.service.js';
import { s3Service } from './s3.service.js';
import { schedulerService } from './scheduler.service.js';
import { seederService } from './seeder.service.js';
import { userRegistry } from './user_registry.service.js';

export const initializeStorage = async () => {
  const bucketName = ENV.S3.bucketName;

  try {
    // Ensure the bucket exists (useful for MinIO dev)
    await s3Service.ensureBucketExists();

    logger.info(`Initializing storage for bucket: ${bucketName}...`);

    await appService.load()

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
