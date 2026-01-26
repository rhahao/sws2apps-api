import { z } from 'zod';

export const FeatureFlagsHeaderSchema = z
  .object({
    installation: z
      .string({
        message: 'Installation ID is required',
      })
      .nonempty({
        message: 'Installation ID must be a non-empty string',
      }),
    user: z.string().optional(),
  })
  .loose();
