import { describe, it, expect, vi, beforeEach, Mock } from 'vitest';
import { User } from '../../src/models/user.model.js';
import Storage from '../../src/storages/index.js';
import Service from '../../src/services/index.js';
import type API from '../../src/types/index.js';
import mockData from '../mocks/data.json' with { type: 'json' };

vi.mock('../../src/storages/index.js');
vi.mock('../../src/services/index.js');

vi.mock('../../src/utils/index.js', async () => {
  const original = await vi.importActual<
    typeof import('../../src/utils/index.js')
  >('../../src/utils/index.js');

  return {
    default: {
      ...original.default,
      Logger: {
        info: vi.fn(),
        error: vi.fn(),
        warn: vi.fn(),
      },
    },
  };
});

describe('User Model', () => {
  const userId = 'test-user-id';
  let user: User;

  beforeEach(() => {
    user = new User(userId);
    vi.clearAllMocks();

    // Setup mock implementations for Storage using mockData
    const profileData = JSON.parse(
      JSON.stringify(mockData.users['profile.json'])
    );

    profileData.auth_uid = 'auth-uid-from-mock';

    (Storage.Users.getProfile as Mock).mockResolvedValue(profileData);
    (Storage.Users.getSettings as Mock).mockResolvedValue(
      mockData.users['settings.json']
    );
    (Storage.Users.getSessions as Mock).mockResolvedValue([
      {
        session_id: 's1',
        last_seen: new Date().toISOString(),
        ip: '',
        user_agent: '',
      },
    ]);
    (Storage.Users.getETag as Mock).mockResolvedValue('v1');
    (Storage.Users.getMutations as Mock).mockResolvedValue(
      mockData.users['mutations.json']
    );
    (Storage.Users.getFieldServiceReports as Mock).mockResolvedValue(
      mockData.users['field_service_reports.json']
    );
    (Storage.Users.getBibleStudies as Mock).mockResolvedValue(
      mockData.users['bible_studies.json']
    );
    (Storage.Users.getDelegatedFieldServiceReports as Mock).mockResolvedValue(
      mockData.users['delegated_field_service_reports.json']
    );

    (Service.Auth.getUserInfo as Mock).mockResolvedValue({
      email: 'test@example.com',
      provider: 'google.com',
    });
  });

  it('should be initialized with an id', () => {
    expect(user.id).toBe(userId);
    expect(user.profile).toEqual({});
    expect(user.settings).toEqual({});
    expect(user.sessions).toEqual([]);
    expect(user.ETag).toBe('v0');
  });

  describe('load', () => {
    it('should load user data and auth info from mock', async () => {
      await user.load();

      expect(user.profile.firstname.value).toBe('Old');
      expect(user.profile.auth_uid).toBe('auth-uid-from-mock');
      expect(user.settings).toEqual(mockData.users['settings.json']);
      expect(user.sessions).toHaveLength(1);
      expect(user.ETag).toBe('v1');
      expect(user.email).toBe('test@example.com');
      expect(user.auth_provider).toBe('google.com');
      expect(Storage.Users.getProfile).toHaveBeenCalledWith(userId);
      expect(Service.Auth.getUserInfo).toHaveBeenCalledWith(
        'auth-uid-from-mock'
      );
    });
  });

  describe('applyBatchedChanges', () => {
    beforeEach(async () => {
      await user.load();
      user['_ETag'] = 'v1';
    });

    it('should apply a single profile patch and save it', async () => {
      const profilePatch = {
        lastname: { value: 'Smith', updatedAt: new Date().toISOString() },
      };
      const changes: API.UserChange['changes'] = [
        { scope: 'profile', patch: profilePatch },
      ];

      await user.applyBatchedChanges(changes);

      expect(Storage.Users.saveMutations).toHaveBeenCalled();
      const savedProfile = (Storage.Users.saveProfile as Mock).mock.calls[0][1];
      expect(savedProfile.lastname.value).toBe('Smith');
      expect(Storage.Users.updateETag).toHaveBeenCalledWith(userId, 'v2');
    });

    it('should handle field service report updates using mock data', async () => {
      const reportPatch = {
        report_date: '2026/01',
        placements: 10,
        updatedAt: new Date().toISOString(),
      };
      const changes: API.UserChange['changes'] = [
        { scope: 'field_service_reports', patch: reportPatch },
      ];

      await user.applyBatchedChanges(changes);

      expect(Storage.Users.getFieldServiceReports).toHaveBeenCalledWith(userId);
      const savedReports = (Storage.Users.saveFieldServiceReports as Mock).mock
        .calls[0][1];
      expect(savedReports).toContainEqual(
        expect.objectContaining({
          report_date: '2026/01',
          hours: '10',
          placements: 10,
        })
      );
      expect(Storage.Users.updateETag).toHaveBeenCalledWith(userId, 'v2');
    });
  });
});
