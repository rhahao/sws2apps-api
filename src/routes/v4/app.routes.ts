import { Router } from 'express';
import Controller from '../../controllers/index.js';
import Middleware from '../../middleware/index.js';
import Validator from '../../validators/index.js';

const router = Router();

/**
 * Public endpoint to fetch feature flags.
 * Requires installation_id header.
 */
router.get(
  '/feature-flags',
  Middleware.validateRequest({
    headers: Validator.FeatureFlagsHeaderSchema,
  }),
  Controller.App.getFeatureFlags
);

export default router;
