import z from 'zod';

export const AuthHeaderSchema = z
  .string()
  .regex(/^Bearer .+$/, 'Invalid Authorization header format');
