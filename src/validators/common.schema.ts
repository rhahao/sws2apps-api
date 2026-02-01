import { z } from 'zod';
import Config from '../config/index.js';

const languageCodes = Config.Languages.map((l) => l.threeLettersCode);

/**
 * Standard Header Schema for all API requests.
 * Uses .loose() (v4) to allow auxiliary headers without strict stripping.
 */
export const HeaderSchema = z
  .object({
    appclient: z.string().optional(),
    appversion: z.string().optional(),
    applanguage: z
      .string()
      .refine((val) => languageCodes.includes(val.toLowerCase()), {
        message: 'Unsupported language code',
      })
      .optional(),
  })
  .loose()
  .refine(
    (data) => {
      if (data.appclient === 'Organized') {
        return !!data.appversion;
      }
      return true;
    },
    {
      message: 'Client version is required for Organized app',
      path: ['appversion'],
    }
  );
