import { beforeEach, describe, expect, it, Mock, vi } from 'vitest';
import { CongregationSettingsServerUpdate } from '../../src/types/index.js';
import { Congregation } from '../../src/models/congregation.model.js';
import { s3Service } from '../../src/services/index.js';

// Mock the config for logger
vi.mock('../../src/config/index.js', () => ({
  ENV: { nodeEnv: 'development' },
}));

// Mock s3Service
vi.mock('../../src/services/s3.service.js', () => ({
  s3Service: {
    getFile: vi.fn(),
    uploadFile: vi.fn(),
    getObjectMetadata: vi.fn(),
  },
}));

// Mock logger
vi.mock('../../src/utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
}));

describe('Congregation Model', () => {
  let congregation: Congregation;
  const congId = 'test-congregation-id';

  beforeEach(() => {
    congregation = new Congregation(congId);

    // Setup base S3 mocks
    (s3Service.getFile as Mock).mockImplementation(async (key: string) => {
      if (key.includes('mutations.json') || key.includes('persons.json')) {
        return JSON.stringify([]);
      }
      return null;
    });

    (s3Service.getObjectMetadata as Mock).mockResolvedValue({ etag: 'v0' });
    (s3Service.uploadFile as Mock).mockResolvedValue({});
  });

  // --- SERVER ONLY PATCH TESTS ---
  describe('applyServerSettingsPatch', () => {
    it('should apply a server settings patch without bumping ETag or saving history', async () => {
      await congregation.load(); // ETag is 'v0' after load

      const serverPatch: CongregationSettingsServerUpdate = {
        cong_name: 'New Congregation Name',
        country_code: 'MDG',
        cong_prefix: 'ABCDEFGHIJ',
        country_guid: '1234567890',
      };

      await congregation.applyServerSettingsPatch(serverPatch);

      expect(congregation.settings!.cong_name).toBe(serverPatch.cong_name);
      expect(congregation.settings!.country_code).toBe(
        serverPatch.country_code
      );
      expect(congregation.settings!.cong_prefix).toBe(serverPatch.cong_prefix);
      expect(congregation.settings!.country_guid).toBe(
        serverPatch.country_guid
      );

      const uploadFileCalls = (s3Service.uploadFile as Mock).mock.calls;

      expect(uploadFileCalls).toHaveLength(1); // settings only, no mutations, no ETag

      const settingsCall = uploadFileCalls.find((call) =>
        call[0].includes('settings.json')
      );

      expect(settingsCall).toBeDefined();

      expect(congregation.ETag).toBe('v0'); // ETag should remain unchanged
    });
  });
});
