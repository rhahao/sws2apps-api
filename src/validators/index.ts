import * as AppSchema from './app.schema.js';
import * as AuthSchema from './auth.schema.js';
import * as CommonSchema from './common.schema.js';

export default { ...AppSchema, ...AuthSchema, ...CommonSchema };
