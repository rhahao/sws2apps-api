import { z } from 'zod';

/**
 * Validator for Feature Flags endpoint headers
 */
export const FeatureFlagsHeaderSchema = z
  .object({
    installation: z.string({
      message: 'Installation ID is required',
    }),
    user: z.string().optional(),
  })
  .loose();
