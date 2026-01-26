import { Router } from 'express';
import { clientValidator } from '../../middleware/index.js';
import appRoutes from './app.routes.js';

const router = Router();

router.use('/public', appRoutes);

// Client version validation (Enforces Organized app minimum version)
router.use(clientValidator);

export default router;
