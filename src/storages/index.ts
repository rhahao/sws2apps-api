import * as API from './api.storage.js';
import * as Congregations from './congregation.storage.js';
import * as Default from './storage.js';
import * as Users from './user.storage.js';

export default { ...Default, API, Congregations, Users };
