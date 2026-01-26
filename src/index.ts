import dotenv from 'dotenv';
import { logger } from './utils/index.js';
import { initializeStorage, initI18n, appService } from './services/index.js';
import { initializeFirebaseAdmin } from './config/index.js'; // New import
import app from './app.js';

// Load environment variables
dotenv.config();

// Initialize logger with config - NO LONGER NEEDED as logger initializes directly

const PORT = process.env.PORT || 8000;

// Start server immediately (Non-blocking)
app.listen(PORT, async () => {
  logger.info(`🚀 Server is running on port ${PORT}`);

  try {
    // 1. Initialize i18n
    await initI18n();

    // 2. Initialize Firebase Admin
    initializeFirebaseAdmin();

    // 3. Perform background storage initialization
    await initializeStorage();

    appService.isReady = true;
    logger.info('System initialized and ready to serve traffic');
  } catch (err) {
    logger.error('Critical failure during initialization:', err);
  }
});
