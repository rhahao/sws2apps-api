import { Router } from 'express';
import { validateRequest } from '../../middleware/index.js';
import { FeatureFlagsHeaderSchema } from '../../validators/index.js';
import { appController } from '../../controllers/index.js';

const router = Router();

/**
 * Public endpoint to fetch feature flags.
 * Requires installation_id header.
 */
router.get('/feature-flags', validateRequest({ headers: FeatureFlagsHeaderSchema }), appController.getFeatureFlags);

export default router;
