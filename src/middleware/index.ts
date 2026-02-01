import * as Auth from './auth.middleware.js';
import * as ClientValidator from './client-validator.middleware.js';
import * as Error from './error.middleware.js';
import * as Readiness from './readiness.middleware.js';
import * as Validate from './validate.middleware.js';

export default { ...Auth, ...ClientValidator, ...Error, ...Readiness, ...Validate };
