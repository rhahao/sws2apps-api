import { beforeEach, describe, expect, it, Mock, vi } from 'vitest';
import {
  CongregationChange,
  CongregationPersonUpdate,
  CongregationSettingsServerUpdate,
} from '../../src/types/index.js';
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
      if (key.includes('settings.json')) {
        return JSON.stringify({
          cong_name: 'New Congregation Name',
          country_code: 'MDG',
          cong_prefix: 'ABCDEFGHIJ',
          country_guid: '1234567890',
        });
      }

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
        cong_name: 'Updated Congregation Name',
      };

      await congregation.applyServerSettingsPatch(serverPatch);

      expect(congregation.settings.cong_name).toBe(serverPatch.cong_name);

      const uploadFileCalls = (s3Service.uploadFile as Mock).mock.calls;

      expect(uploadFileCalls).toHaveLength(1); // settings only, no mutations, no ETag

      const settingsCall = uploadFileCalls.find((call) =>
        call[0].includes('settings.json')
      );

      expect(settingsCall).toBeDefined();

      expect(congregation.ETag).toBe('v0'); // ETag should remain unchanged
    });
  });

  // --- CORE ENGINE TESTS ---
  describe('applyBatchedChanges (Engine)', () => {
    // Clear mock calls to s3Service.uploadFile before starting the batched changes
    beforeEach(() => {
      (s3Service.uploadFile as Mock).mockClear();
    });

    it('should process multiple scopes in one S3 transaction', async () => {
      await congregation.load();

      const batch: CongregationChange['changes'] = [
        {
          scope: 'settings',
          patch: {
            data_sync: { value: true, updatedAt: '2026-01-26T00:00:00Z' },
          },
        },
        {
          scope: 'persons',
          patch: {
            person_uid: 'person-1',
            person_firstname: {
              value: 'Jane',
              updatedAt: '2026-01-26T12:00:00Z',
            },
          },
        },
      ];

      await congregation.applyBatchedChanges(batch);

      // Verify state updates
      expect(congregation.settings).toHaveProperty('data_sync');

      const uploadFileCalls = (s3Service.uploadFile as Mock).mock.calls;

      // Verify SaveWithHistory orchestration
      // 1. Mutations, 2. ETag, 3. Settings, 4. Persons
      expect(uploadFileCalls).toHaveLength(4);

      const settingsCall = uploadFileCalls.find((call) =>
        call[0].includes('settings.json')
      );

      const mutationCall = uploadFileCalls.find((call) =>
        call[0].includes('mutations.json')
      );

      const personsCall = uploadFileCalls.find((call) =>
        call[0].includes('persons.json')
      );

      expect(mutationCall).toBeDefined();
      expect(settingsCall).toBeDefined();
      expect(personsCall).toBeDefined();

      expect(congregation.ETag).toBe('v1');
    });
  });

  // --- CONVENIENCE WRAPPER TESTS ---
  describe('Convenience Wrappers (Plumbing)', () => {
    it('applyPersonPatch should route correctly to batched engine', async () => {
      const spy = vi.spyOn(congregation, 'applyBatchedChanges');

      const patch: CongregationPersonUpdate = {
        person_uid: 'person-1',
        person_firstname: { value: 'John', updatedAt: '2026-01-26T12:00:00Z' },
        person_lastname: { value: 'Doe', updatedAt: '2026-01-26T12:00:00Z' },
      };

      await congregation.applyPersonPatch(patch);

      expect(spy).toHaveBeenCalledWith([{ scope: 'persons', patch }]);
    });
  });
});
