// dependency
import 'dotenv/config';

// app import
import app from './src/app.js';

// load utils
import { logger } from './src/utils/logger.js';

// load classes
import { users } from './src/classes/Users.js';
import { congregations } from './src/classes/Congregations.js';
import { initializeAPI } from './src/config/cpe.db-config.js';

const PORT = process.env.PORT || 8000;
const APP_VERSION = process.env.npm_package_version;

// define global variables
global.requestTracker = [];
global.isServerReady = false;

await initializeAPI();
logger('info', JSON.stringify({ details: `API: minimum CPE client version set to ${global.minimumVersionCPE}` }));

app.listen(PORT, async () => {
	logger('info', JSON.stringify({ details: `server up and running on port ${PORT} (v${APP_VERSION})` }));

	logger('info', JSON.stringify({ details: `loading Firebase data ...` }));

	await users.loadAll();
	await congregations.loadAll();

	logger('info', JSON.stringify({ details: `loading completed.` }));
	global.isServerReady = true;
});

export { app as api };
