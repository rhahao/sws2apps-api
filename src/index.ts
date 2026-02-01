import dotenv from 'dotenv';
import http from 'node:http';
import app from './app.js';
import Service from './services/index.js';
import Storage from './storages/index.js';
import Utility from './utils/index.js';

// Load environment variables
dotenv.config();

const PORT = process.env.PORT || 8000;

const server = http.createServer(app);

// Initialize Socket.IO
const io = Service.Socket.init(server);

// Start server immediately (Non-blocking)
server.listen(PORT, async () => {
  Utility.Logger.info(`🚀 Server is running on port ${PORT}`);

  try {
    // 1. Initialize i18n
    await Service.i18n.init();

    // 2. Initialize Firebase Admin
    Service.Auth.initialize();

    // 3. Perform background storage initialization
    await Storage.initialize();

    app.set('io', io);

    Service.API.isReady = true;

    Utility.Logger.info('System initialized and ready to serve traffic');
  } catch (err) {
    Utility.Logger.error('Critical failure during initialization:', err);
  }
});
