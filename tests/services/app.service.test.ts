import { describe, it, expect, beforeEach, vi, Mock } from 'vitest';
import { AppService } from '../../src/services/app.service.js';
import { s3Service } from '../../src/services/s3.service.js';
import { FeatureFlag, Installation } from '../../src/types/index.js';
import {
  congregationRegistry,
  userRegistry,
} from '../../src/services/index.js';
import { Congregation, User } from '../../src/models/index.js';
import mockData from '../mocks/data.json';

// Mock func
vi.mock('../../src/services/s3.service.js');
vi.mock('../../src/services/user_registry.service.js');
vi.mock('../../src/utils/logger.js');

describe('AppService - evaluateFeatureFlags', () => {
  let service: AppService;

  beforeEach(() => {
    service = new AppService();
    vi.clearAllMocks();

    // Setup base S3 mocks
    (s3Service.getFile as Mock).mockImplementation(async (key: string) => {
      const finalKey = key.split('/').at(-1)!;

      const data = mockData.api[finalKey];

      if (data) {
        return JSON.stringify(data);
      }

      return null;
    });

    (s3Service.fileExists as Mock).mockResolvedValue(true);
  });

  describe('app availability', () => {
    it('should just enable a flag without saving if coverage is 100%', async () => {
      await service.load();

      // Spy on the save method
      const saveSpy = vi.spyOn(service, 'saveFlags');

      const result = await service.evaluateFeatureFlags('inst-1');

      // coverage 100% should not trigger a saveFlags
      expect(saveSpy).not.toHaveBeenCalled();

      expect(result.FLAG_NAME).toBe(true);
    });

    it('should draft a user into a rollout if current coverage is below target', async () => {
      // 0 existing installations, 0 currently have the flag.
      // Target is 50%. The first user to hit this should get drafted.
      const mockApi = structuredClone(mockData.api);

      const mockFlags = mockApi['flags.json'] as FeatureFlag[];
      mockFlags.at(0)!.coverage = 50;

      // 1. Mock the S3 data
      (s3Service.getFile as Mock).mockImplementation(async (key: string) => {
        const finalKey = key.split('/').at(-1)!;

        const data = mockApi[finalKey];

        if (data) {
          return JSON.stringify(data);
        }

        return null;
      });

      await service.load();

      // Spy on the save method
      const saveSpy = vi.spyOn(service, 'saveFlags');

      const result = await service.evaluateFeatureFlags('inst-1', 'user-1');

      expect(result.FLAG_NAME).toBe(true);

      // Verify it saved the new "drafted" user back to S3
      expect(saveSpy).toHaveBeenCalled();

      const updatedFlags = saveSpy.mock.calls[0][0];
      expect(updatedFlags[0].installations).toContain('inst-1');
      expect(updatedFlags[0].users).toContain('user-1');
    });

    it('should NOT enable flag if coverage target is already met', async () => {
      // We mock that there are only 2 total installations.
      // 1 has it, so 50% coverage. Target is 10%.
      // Therefore, inst-2 should NOT get it.
      const mockApi = structuredClone(mockData.api);
      const installationId = 'other-inst';

      const mockFlags = mockApi['flags.json'] as FeatureFlag[];

      mockFlags.at(0)!.coverage = 10;
      mockFlags.at(0)!.installations = [installationId] as string[];

      const mockInstallations = mockApi['installations.json'] as Installation[];

      mockInstallations.push({
        id: installationId,
        user: 'other-user-id',
        last_used: new Date().toISOString(),
      });

      // 1. Mock the S3 data
      (s3Service.getFile as Mock).mockImplementation(async (key: string) => {
        const finalKey = key.split('/').at(-1)!;

        const data = mockApi[finalKey];

        if (data) {
          return JSON.stringify(data);
        }

        return null;
      });

      await service.load();

      // Spy on the save method
      const saveSpy = vi.spyOn(service, 'saveFlags');

      const result = await service.evaluateFeatureFlags('inst-2');

      // saveFlags should not be triggered
      expect(saveSpy).not.toHaveBeenCalled();

      expect(result.FLAG_NAME).toBeUndefined();
    });
  });

  describe('congregation availability', () => {
    let user: User;
    let congregation: Congregation;

    const userId = 'test-user-id';
    const congregationId = 'test-congregation-id';
    const insllationId = 'test-installation-id';

    beforeEach(async () => {
      user = new User(userId);

      (s3Service.getFile as Mock).mockImplementation(async (key: string) => {
        const finalKey = key.split('/').at(-1)!;

        const data = mockData.users[finalKey];

        if (data) {
          return JSON.stringify(data);
        }

        return null;
      });

      await user.load();

      user.profile!.congregation = {
        id: congregationId,
        account_type: 'vip',
        cong_role: ['admin'],
      };

      congregation = new Congregation(congregationId);
    });

    it('should just enable a flag without saving if coverage is 100%', async () => {
      const mockApi = structuredClone(mockData.api);

      const mockFlags = mockApi['flags.json'] as FeatureFlag[];

      const flag = mockFlags.at(0)!;

      flag.availability = 'congregation';
      flag.coverage = 100;
      flag.congregations = [];

      // 1. Mock the S3 data
      (s3Service.getFile as Mock).mockImplementation(async (key: string) => {
        const finalKey = key.split('/').at(-1)!;

        const data = mockApi[finalKey];

        if (data) {
          return JSON.stringify(data);
        }

        return null;
      });

      await service.load();

      // 2. Mock Registry Lookups
      vi.spyOn(userRegistry, 'findById').mockReturnValue(user);

      // Mock total congregation count for the percentage math
      vi.spyOn(congregationRegistry, 'findById').mockReturnValue(congregation);
      vi.spyOn(congregationRegistry, 'count', 'get').mockReturnValue(10);

      const saveSpy = vi.spyOn(service, 'saveFlags');

      const result = await service.evaluateFeatureFlags(insllationId, userId);

      // Verify logic
      expect(result.FLAG_NAME).toBe(true);
      expect(saveSpy).not.toHaveBeenCalled();
    });

    it('should draft a user into a rollout if current coverage is below target', async () => {
      const mockApi = structuredClone(mockData.api);

      const mockFlags = mockApi['flags.json'] as FeatureFlag[];

      const flag = mockFlags.at(0)!;

      flag.availability = 'congregation';
      flag.coverage = 50;
      flag.congregations = ['existing-cong-id'];

      // 1. Mock the S3 data
      (s3Service.getFile as Mock).mockImplementation(async (key: string) => {
        const finalKey = key.split('/').at(-1)!;

        const data = mockApi[finalKey];

        if (data) {
          return JSON.stringify(data);
        }

        return null;
      });

      await service.load();

      // 2. Mock Registry Lookups
      vi.spyOn(userRegistry, 'findById').mockReturnValue(user);

      // Mock total congregation count for the percentage math
      vi.spyOn(congregationRegistry, 'findById').mockReturnValue(congregation);
      vi.spyOn(congregationRegistry, 'count', 'get').mockReturnValue(5);

      const saveSpy = vi.spyOn(service, 'saveFlags');

      const result = await service.evaluateFeatureFlags(insllationId, userId);

      // Verify logic
      expect(result.FLAG_NAME).toBe(true);
      expect(saveSpy).toHaveBeenCalled();

      // Verify the congregation ID was the one persisted
      const updatedFlags = saveSpy.mock.calls[0][0];
      expect(updatedFlags[0].congregations).toContain(congregationId);
    });

    it('should NOT enable flag if coverage target is already met', async () => {
      const mockApi = structuredClone(mockData.api);

      const mockFlags = mockApi['flags.json'] as FeatureFlag[];

      const flag = mockFlags.at(0)!;

      flag.availability = 'congregation';
      flag.coverage = 50;
      flag.congregations = ['existing-cong-id'];

      // 1. Mock the S3 data
      (s3Service.getFile as Mock).mockImplementation(async (key: string) => {
        const finalKey = key.split('/').at(-1)!;

        const data = mockApi[finalKey];

        if (data) {
          return JSON.stringify(data);
        }

        return null;
      });

      await service.load();

      // 2. Mock Registry Lookups
      vi.spyOn(userRegistry, 'findById').mockReturnValue(user);

      // Mock total congregation count for the percentage math
      vi.spyOn(congregationRegistry, 'findById').mockReturnValue(congregation);
      vi.spyOn(congregationRegistry, 'count', 'get').mockReturnValue(2);

      const saveSpy = vi.spyOn(service, 'saveFlags');

      const result = await service.evaluateFeatureFlags(insllationId, userId);

      // Verify logic
      expect(result.FLAG_NAME).toBe(undefined);
      expect(saveSpy).not.toHaveBeenCalled();
    });
  });

  describe('user availability', () => {
    let user: User;

    const userId = 'test-user-id';
    const insllationId = 'test-installation-id';

    beforeEach(async () => {
      user = new User(userId);

      (s3Service.getFile as Mock).mockImplementation(async (key: string) => {
        const finalKey = key.split('/').at(-1)!;

        const data = mockData.users[finalKey];

        if (data) {
          return JSON.stringify(data);
        }

        return null;
      });

      await user.load();
    });

    it('should just enable a flag without saving if coverage is 100%', async () => {
      const mockApi = structuredClone(mockData.api);

      const mockFlags = mockApi['flags.json'] as FeatureFlag[];

      const flag = mockFlags.at(0)!;

      flag.availability = 'user';
      flag.coverage = 100;
      flag.congregations = [];

      // 1. Mock the S3 data
      (s3Service.getFile as Mock).mockImplementation(async (key: string) => {
        const finalKey = key.split('/').at(-1)!;

        const data = mockApi[finalKey];

        if (data) {
          return JSON.stringify(data);
        }

        return null;
      });

      await service.load();

      // 2. Mock Registry Lookups
      vi.spyOn(userRegistry, 'findById').mockReturnValue(user);

      // Mock total congregation count for the percentage math
      vi.spyOn(userRegistry, 'count', 'get').mockReturnValue(10);

      const saveSpy = vi.spyOn(service, 'saveFlags');

      const result = await service.evaluateFeatureFlags(insllationId, userId);

      // Verify logic
      expect(result.FLAG_NAME).toBe(true);
      expect(saveSpy).not.toHaveBeenCalled();
    });

    it('should draft a user into a rollout if current coverage is below target', async () => {
      const mockApi = structuredClone(mockData.api);

      const mockFlags = mockApi['flags.json'] as FeatureFlag[];

      const flag = mockFlags.at(0)!;

      flag.availability = 'user';
      flag.coverage = 50;
      flag.users = ['existing-user-id'];

      // 1. Mock the S3 data
      (s3Service.getFile as Mock).mockImplementation(async (key: string) => {
        const finalKey = key.split('/').at(-1)!;

        const data = mockApi[finalKey];

        if (data) {
          return JSON.stringify(data);
        }

        return null;
      });

      await service.load();

      // 2. Mock Registry Lookups
      vi.spyOn(userRegistry, 'findById').mockReturnValue(user);

      // Mock total congregation count for the percentage math
      vi.spyOn(userRegistry, 'count', 'get').mockReturnValue(5);

      const saveSpy = vi.spyOn(service, 'saveFlags');

      const result = await service.evaluateFeatureFlags(insllationId, userId);

      // Verify logic
      expect(result.FLAG_NAME).toBe(true);
      expect(saveSpy).toHaveBeenCalled();

      // Verify the congregation ID was the one persisted
      const updatedFlags = saveSpy.mock.calls[0][0];
      expect(updatedFlags[0].users).toContain(userId);
    });

    it('should NOT enable flag if coverage target is already met', async () => {
      const mockApi = structuredClone(mockData.api);

      const mockFlags = mockApi['flags.json'] as FeatureFlag[];

      const flag = mockFlags.at(0)!;

      flag.availability = 'user';
      flag.coverage = 50;
      flag.users = ['existing-user-id'];

      // 1. Mock the S3 data
      (s3Service.getFile as Mock).mockImplementation(async (key: string) => {
        const finalKey = key.split('/').at(-1)!;

        const data = mockApi[finalKey];

        if (data) {
          return JSON.stringify(data);
        }

        return null;
      });

      await service.load();

      // 2. Mock Registry Lookups
      vi.spyOn(userRegistry, 'findById').mockReturnValue(user);

      // Mock total congregation count for the percentage math
      vi.spyOn(userRegistry, 'count', 'get').mockReturnValue(2);

      const saveSpy = vi.spyOn(service, 'saveFlags');

      const result = await service.evaluateFeatureFlags(insllationId, userId);

      // Verify logic
      expect(result.FLAG_NAME).toBe(undefined);
      expect(saveSpy).not.toHaveBeenCalled();
    });
  });
});
