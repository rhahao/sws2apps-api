
import { describe, it, expect } from 'vitest';
import { FeatureFlagsHeaderSchema } from '../../src/validators/app.schema.js';

describe('FeatureFlagsHeaderSchema', () => {
  it('should pass validation for a header with installation and user', () => {
    const validHeader = {
      installation: 'test-installation-id',
      user: 'test-user-id',
    };

    const result = FeatureFlagsHeaderSchema.safeParse(validHeader);

    expect(result.success).toBe(true);
  });

  it('should pass validation for a header with only an installation', () => {
    const validHeader = {
      installation: 'test-installation-id',
    };

    const result = FeatureFlagsHeaderSchema.safeParse(validHeader);

    expect(result.success).toBe(true);
  });

  it('should fail validation if installation is missing', () => {
    const invalidHeader = {
      user: 'test-user-id',
    };

    const result = FeatureFlagsHeaderSchema.safeParse(invalidHeader);

    expect(result.success).toBe(false);
  });

  it('should fail validation if installation is an empty string', () => {
    const invalidHeader = {
      installation: '',
      user: 'test-user-id',
    };

    const result = FeatureFlagsHeaderSchema.safeParse(invalidHeader);

    expect(result.success).toBe(false);
  });
});
