import dotenv from 'dotenv';
import http from 'node:http';
import { logger } from './utils/index.js';
import {
  initializeStorage,
  initI18n,
  appService,
  initSocketIO,
} from './services/index.js';
import { initializeFirebaseAdmin } from './config/index.js';
import app from './app.js';

// Load environment variables
dotenv.config();

const PORT = process.env.PORT || 8000;

const server = http.createServer(app);

// Initialize Socket.IO
const io = initSocketIO(server);

// Start server immediately (Non-blocking)
server.listen(PORT, async () => {
  logger.info(`🚀 Server is running on port ${PORT}`);

  try {
    // 1. Initialize i18n
    await initI18n();

    // 2. Initialize Firebase Admin
    initializeFirebaseAdmin();

    // 3. Perform background storage initialization
    await initializeStorage();

    app.set('io', io);

    appService.isReady = true;
    logger.info('System initialized and ready to serve traffic');
  } catch (err) {
    logger.error('Critical failure during initialization:', err);
  }
});
