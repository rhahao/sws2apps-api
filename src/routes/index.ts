import { Router } from 'express';
import v4Routes from './v4/index.js';

const router = Router();

// Mount v4 routes
router.use('/v4', v4Routes);

export default router;
