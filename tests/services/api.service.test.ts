import { describe, it, expect, vi, beforeEach, afterEach, Mock } from 'vitest';
import ApiService from '../../src/services/api.service.js';
import Storage from '../../src/storages/index.js';
import Users from '../../src/services/users.service.js';
import Congregations from '../../src/services/congregations.service.js';
import type API from '../../src/types/index.js';

// Mock dependencies
vi.mock('../../src/storages');
vi.mock('../../src/services/users.service', () => ({
  default: {
    get count() {
      return 0;
    },
    findById: vi.fn(),
    performHistoryMaintenance: vi.fn(),
    loadIndex: vi.fn(),
  },
}));
vi.mock('../../src/services/congregations.service', () => ({
  default: {
    get count() {
      return 0;
    },
    loadIndex: vi.fn(),
  },
}));
vi.mock('../../src/services/seeder.service');
vi.mock('../../src/services/scheduler.service');
vi.mock('../../src/utils', () => ({
  default: {
    Logger: {
      info: vi.fn(),
      error: vi.fn(),
    },
  },
}));

describe('ApiService', () => {
  beforeEach(() => {
    // Reset mocks before each test
    vi.resetAllMocks();

    // @ts-expect-error - Accessing private field for test setup
    ApiService._installations = [];
    // @ts-expect-error - Accessing private field for test setup
    ApiService._flags = [];
    // @ts-expect-error - Accessing private field for test setup
    ApiService._settings = { clientMinimumVersion: '1.0.0' };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('evaluateFeatureFlags', () => {
    it('should return an empty object if there are no flags', async () => {
      // @ts-expect-error - Accessing private field for test setup
      ApiService._flags = [];
      const result = await ApiService.evaluateFeatureFlags('install-1');
      expect(result).toEqual({});
    });

    it('should not return a flag if it is disabled', async () => {
      const mockFlags: API.FeatureFlag[] = [
        {
          id: 'flag-id',
          name: 'FEATURE_A',
          description: '',
          status: false,
          coverage: 100,
          availability: 'app',
          installations: [],
          users: [],
          congregations: [],
        },
      ];
      // @ts-expect-error - Accessing private field for test setup
      ApiService._flags = mockFlags;

      const result = await ApiService.evaluateFeatureFlags('install-1');
      expect(result).toEqual({});
    });

    it('should not return a flag if coverage is 0', async () => {
      const mockFlags: API.FeatureFlag[] = [
        {
          id: 'flag-id',
          name: 'FEATURE_A',
          description: '',
          status: true,
          coverage: 0,
          availability: 'app',
          installations: [],
          users: [],
          congregations: [],
        },
      ];
      // @ts-expect-error - Accessing private field for test setup
      ApiService._flags = mockFlags;

      const result = await ApiService.evaluateFeatureFlags('install-1');
      expect(result).toEqual({});
    });

    it('should return a flag if coverage is 100', async () => {
      const mockFlags: API.FeatureFlag[] = [
        {
          id: 'flag-id',
          name: 'FEATURE_A',
          description: '',
          status: true,
          coverage: 100,
          availability: 'app',
          installations: [],
          users: [],
          congregations: [],
        },
      ];
      // @ts-expect-error - Accessing private field for test setup
      ApiService._flags = mockFlags;

      const result = await ApiService.evaluateFeatureFlags('install-1');
      expect(result).toEqual({ FEATURE_A: true });
    });

    it('should assign a flag based on coverage for "app" availability', async () => {
      const mockFlags: API.FeatureFlag[] = [
        {
          id: 'flag-id',
          name: 'FEATURE_A',
          description: '',
          status: true,
          coverage: 50,
          availability: 'app',
          installations: [],
          users: [],
          congregations: [],
        },
      ];
      // @ts-expect-error - Accessing private field for test setup
      ApiService._flags = mockFlags;
      // @ts-expect-error - Accessing private field for test setup
      ApiService._installations = [
        { id: 'install-1', user: 'user-1', last_used: '' },
        { id: 'install-2', user: 'user-2', last_used: '' },
      ];
      vi.spyOn(Storage.API, 'saveFlags').mockResolvedValue();

      const result = await ApiService.evaluateFeatureFlags('install-1');
      expect(result).toEqual({ FEATURE_A: true });
      expect(Storage.API.saveFlags).toHaveBeenCalledOnce();
      const savedFlags = (Storage.API.saveFlags as Mock).mock.calls[0][0];
      expect(savedFlags[0].installations).toContain('install-1');
    });

    it('should not re-assign a flag if already present', async () => {
      const mockFlags: API.FeatureFlag[] = [
        {
          id: 'flag-id',
          name: 'FEATURE_A',
          description: '',
          status: true,
          coverage: 50,
          availability: 'app',
          installations: ['install-1'],
          users: [],
          congregations: [],
        },
      ];
      // @ts-expect-error - Accessing private field for test setup
      ApiService._flags = mockFlags;
      // @ts-expect-error - Accessing private field for test setup
      ApiService._installations = [
        { id: 'install-1', user: 'user-1', last_used: '' },
        { id: 'install-2', user: 'user-2', last_used: '' },
      ];

      const result = await ApiService.evaluateFeatureFlags('install-1');
      expect(result).toEqual({ FEATURE_A: true });
      expect(Storage.API.saveFlags).not.toHaveBeenCalled();
    });

    it('should not assign a "user" flag if userId is not provided', async () => {
      const mockFlags: API.FeatureFlag[] = [
        {
          id: 'flag-id',
          name: 'FEATURE_A',
          description: '',
          status: true,
          coverage: 50,
          availability: 'user',
          installations: [],
          users: [],
          congregations: [],
        },
      ];
      // @ts-expect-error - Accessing private field for test setup
      ApiService._flags = mockFlags;

      const result = await ApiService.evaluateFeatureFlags('install-1');
      expect(result).toEqual({});
      expect(Storage.API.saveFlags).not.toHaveBeenCalled();
    });

    it('should assign a "user" flag if userId is provided', async () => {
      const mockFlags: API.FeatureFlag[] = [
        {
          id: 'flag-id',
          name: 'FEATURE_A',
          description: '',
          status: true,
          coverage: 50,
          availability: 'user',
          installations: [],
          users: [],
          congregations: [],
        },
      ];
      // @ts-expect-error - Accessing private field for test setup
      ApiService._flags = mockFlags;
      Object.defineProperty(Users, 'count', { get: () => 2 });
      vi.spyOn(Storage.API, 'saveFlags').mockResolvedValue();

      const result = await ApiService.evaluateFeatureFlags(
        'install-1',
        'user-1'
      );
      expect(result).toEqual({ FEATURE_A: true });
      expect(Storage.API.saveFlags).toHaveBeenCalledOnce();
      const savedFlags = (Storage.API.saveFlags as Mock).mock.calls[0][0];
      expect(savedFlags[0].users).toContain('user-1');
    });

    it('should not assign a "congregation" flag if user is not in a congregation', async () => {
      const mockFlags: API.FeatureFlag[] = [
        {
          id: 'flag-id',
          name: 'FEATURE_A',
          description: '',
          status: true,
          coverage: 50,
          availability: 'congregation',
          installations: [],
          users: [],
          congregations: [],
        },
      ];
      // @ts-expect-error - Accessing private field for test setup
      ApiService._flags = mockFlags;
      (Users.findById as Mock).mockReturnValue({}); // User without congregation

      const result = await ApiService.evaluateFeatureFlags(
        'install-1',
        'user-1'
      );
      expect(result).toEqual({});
      expect(Storage.API.saveFlags).not.toHaveBeenCalled();
    });

    it('should assign a "congregation" flag if user is in a congregation', async () => {
      const mockFlags: API.FeatureFlag[] = [
        {
          id: 'flag-id',
          name: 'FEATURE_A',
          description: '',
          status: true,
          coverage: 50,
          availability: 'congregation',
          installations: [],
          users: [],
          congregations: [],
        },
      ];
      // @ts-expect-error - Accessing private field for test setup
      ApiService._flags = mockFlags;
      (Users.findById as Mock).mockReturnValue({
        profile: { congregation: { id: 'cong-1' } },
      });
      Object.defineProperty(Congregations, 'count', { get: () => 2 });
      vi.spyOn(Storage.API, 'saveFlags').mockResolvedValue();

      const result = await ApiService.evaluateFeatureFlags(
        'install-1',
        'user-1'
      );
      expect(result).toEqual({ FEATURE_A: true });
      expect(Storage.API.saveFlags).toHaveBeenCalledOnce();
      const savedFlags = (Storage.API.saveFlags as Mock).mock.calls[0][0];
      expect(savedFlags[0].congregations).toContain('cong-1');
    });
  });
});
