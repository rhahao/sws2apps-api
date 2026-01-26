
import { describe, it, expect, vi } from 'vitest';
import { HeaderSchema } from '../../src/validators/common.schema.js';

// Mock the config to have a predictable set of languages
vi.mock('../../src/config/index.js', () => ({
  ALL_LANGUAGES: [
    { threeLettersCode: 'eng', name: 'English' },
    { threeLettersCode: 'spa', name: 'Spanish' },
  ],
}));

describe('HeaderSchema', () => {
  it('should pass validation for a valid header', () => {
    const validHeader = {
      appclient: 'TestClient',
      appversion: '1.0.0',
      applanguage: 'eng',
    };

    const result = HeaderSchema.safeParse(validHeader);

    expect(result.success).toBe(true);
  });

  it('should fail validation for an unsupported applanguage', () => {
    const invalidHeader = {
      appclient: 'TestClient',
      appversion: '1.0.0',
      applanguage: 'fra', // Not in ALL_LANGUAGES
    };

    const result = HeaderSchema.safeParse(invalidHeader);

    expect(result.success).toBe(false);
  });

  it('should fail if appclient is Organized and appversion is missing', () => {
    const invalidHeader = {
      appclient: 'Organized',
      applanguage: 'eng',
    };

    const result = HeaderSchema.safeParse(invalidHeader);

    expect(result.success).toBe(false);
  });

  it('should pass if appclient is Organized and appversion is present', () => {
    const validHeader = {
      appclient: 'Organized',
      appversion: '1.0.0',
      applanguage: 'eng',
    };

    const result = HeaderSchema.safeParse(validHeader);

    expect(result.success).toBe(true);
  });
});
