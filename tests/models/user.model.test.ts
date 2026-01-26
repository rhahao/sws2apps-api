import { describe, it, expect, beforeEach, vi, Mock } from 'vitest';
import {
  UserProfileServerUpdate,
  UserFieldServiceReport,
  UserFieldServiceReportsUpdate,
} from '../../src/types/index.js';
import { User } from '../../src/models/user.model.js';
import { s3Service } from '../../src/services/s3.service.js';

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

// Mock the config for logger
vi.mock('../../src/config/index.js', () => ({
  ENV: {
    nodeEnv: 'development',
    logtailSourceToken: 'test-token',
    logtailEndpoint: 'test-endpoint',
  },
}));

describe('User Model', () => {
  let user: User;
  const userId = 'test-user-id';

  beforeEach(() => {
    user = new User(userId);
    vi.clearAllMocks();

    // Mock default file content
    (s3Service.getFile as Mock).mockImplementation(async (key: string) => {
      if (key.includes('profile.json')) {
        return JSON.stringify({
          firstname: { value: 'Original', updatedAt: '2026-01-01T00:00:00Z' },
          lastname: { value: 'Original', updatedAt: '2026-01-01T00:00:00Z' },
          congregation: {
            id: 'cong-000',
            name: 'Original Congregation',
            updatedAt: '2026-01-01T00:00:00Z',
          },
        });
      }
      if (key.includes('settings.json')) {
        return JSON.stringify({
          backup_automatic: {
            value: 'enabled',
            updatedAt: '2026-01-01T00:00:00Z',
          },
          theme_follow_os_enabled: {
            value: 'true',
            updatedAt: '2026-01-01T00:00:00Z',
          },
          hour_credits_enabled: {
            value: 'true',
            updatedAt: '2026-01-01T00:00:00Z',
          },
          data_view: { value: 'default', updatedAt: '2026-01-01T00:00:00Z' },
        });
      }
      if (
        key.includes('mutations.json') ||
        key.includes('field_service_reports.json')
      ) {
        return JSON.stringify([]);
      }
      return null;
    });

    (s3Service.getObjectMetadata as Mock).mockResolvedValue({ etag: 'v0' });
    (s3Service.uploadFile as Mock).mockResolvedValue({});
  });

  describe('applyBatchedChanges', () => {
    it('should apply a single profile patch and save with history', async () => {
      await user.load(); // Load initial data

      const patch = {
        firstname: { value: 'Updated', updatedAt: '2026-01-25T00:00:00Z' },
      };
      await user.applyBatchedChanges([{ scope: 'profile', patch: patch }]);

      expect(user.profile?.firstname.value).toBe('Updated');
      expect(s3Service.uploadFile).toHaveBeenCalledWith(
        `users/${userId}/mutations.json`,
        expect.any(String),
        'application/json'
      );
      expect(s3Service.uploadFile).toHaveBeenCalledWith(
        `users/${userId}/profile.json`,
        expect.any(String),
        'application/json'
      );
      expect(user.ETag).toBe('v1'); // ETag should be bumped
    });

    it('should apply a single settings patch and save with history', async () => {
      await user.load();

      const patch = {
        theme_follow_os_enabled: {
          value: 'disabled',
          updatedAt: '2026-01-25T00:00:00Z',
        },
      };
      await user.applyBatchedChanges([{ scope: 'settings', patch: patch }]);

      expect(user.settings?.theme_follow_os_enabled.value).toBe('disabled');
      expect(s3Service.uploadFile).toHaveBeenCalledWith(
        `users/${userId}/mutations.json`,
        expect.any(String),
        'application/json'
      );
      expect(s3Service.uploadFile).toHaveBeenCalledWith(
        `users/${userId}/settings.json`,
        expect.any(String),
        'application/json'
      );
      expect(user.ETag).toBe('v1');
    });

    it('should apply multiple patches across different scopes and save with history', async () => {
      await user.load();

      const profilePatch = {
        firstname: { value: 'John', updatedAt: '2026-01-25T01:00:00Z' },
      };
      const settingsPatch = {
        hour_credits_enabled: {
          value: 'false',
          updatedAt: '2026-01-25T02:00:00Z',
        },
      };

      await user.applyBatchedChanges([
        { scope: 'profile', patch: profilePatch },
        { scope: 'settings', patch: settingsPatch },
      ]);

      expect(user.profile?.firstname.value).toBe('John');
      expect(user.settings?.hour_credits_enabled.value).toBe('false');

      expect(s3Service.uploadFile).toHaveBeenCalledWith(
        `users/${userId}/mutations.json`,
        expect.any(String),
        'application/json'
      );
      expect(s3Service.uploadFile).toHaveBeenCalledWith(
        `users/${userId}/profile.json`,
        expect.any(String),
        'application/json'
      );
      expect(s3Service.uploadFile).toHaveBeenCalledWith(
        `users/${userId}/settings.json`,
        expect.any(String),
        'application/json'
      );
      expect(user.ETag).toBe('v1');
    });

    it('should not save if no actual changes are made by patches', async () => {
      await user.load();
      const initialProfile = { ...user.profile };
      const initialSettings = { ...user.settings };

      const profilePatch = {
        firstname: { value: 'Original', updatedAt: '2026-01-01T00:00:00Z' },
      }; // Older timestamp, no change
      const settingsPatch = {
        backup_automatic: {
          value: 'enabled',
          updatedAt: '2026-01-01T00:00:00Z',
        },
      }; // Same value and timestamp, no change

      await user.applyBatchedChanges([
        { scope: 'profile', patch: profilePatch },
        { scope: 'settings', patch: settingsPatch },
      ]);

      expect(user.profile).toEqual(initialProfile);
      expect(user.settings).toEqual(initialSettings);
      expect(s3Service.uploadFile).not.toHaveBeenCalled();
      expect(user.ETag).toBe('v0'); // ETag should not be bumped
    });

    it('should handle partial updates in profile patch', async () => {
      await user.load();

      const patch = {
        firstname: { value: 'NewFName', updatedAt: '2026-01-25T00:00:00Z' },
        lastname: { value: 'NewLName', updatedAt: '2026-01-25T00:00:00Z' },
      };
      await user.applyBatchedChanges([{ scope: 'profile', patch: patch }]);

      expect(user.profile?.firstname.value).toBe('NewFName');
      expect(user.profile?.lastname?.value).toBe('NewLName');
      expect(user.ETag).toBe('v1');
    });

    it('should handle partial updates in settings patch', async () => {
      await user.load();

      const patch = {
        theme_follow_os_enabled: {
          value: 'true',
          updatedAt: '2026-01-25T00:00:00Z',
        },
      };
      await user.applyBatchedChanges([{ scope: 'settings', patch: patch }]);

      expect(user.settings?.theme_follow_os_enabled.value).toBe('true');
      expect(user.ETag).toBe('v1');
    });
  });

  describe('applyServerProfilePatch', () => {
    it('should apply a server profile patch without bumping ETag or saving history', async () => {
      await user.load(); // ETag is 'v0' after load

      const serverPatch: UserProfileServerUpdate = {
        role: 'vip',
        createdAt: '2026-01-26T00:00:00Z',
        congregation: {
          id: 'cong-123',
          account_type: 'vip',
          cong_role: ['admin'],
        },
      };

      await user.applyServerProfilePatch(serverPatch);

      expect(user.profile!.role).toBe(serverPatch.role);
      expect(user.profile!.createdAt).toBe(serverPatch.createdAt);
      expect(user.profile).toHaveProperty('congregation');

      expect(s3Service.uploadFile).toHaveBeenCalledTimes(1);
      expect(s3Service.uploadFile).toHaveBeenCalledWith(
        `users/${userId}/profile.json`,
        expect.stringContaining('"id":"cong-123"'),
        'application/json'
      );

      expect(s3Service.uploadFile).not.toHaveBeenCalledWith(
        `users/${userId}/mutations.json`,
        expect.any(String),
        'application/json'
      );

      expect(user.ETag).toBe('v0');
    });
  });

  describe('applyFieldServiceReportPatch', () => {
    describe('when no existing report exists', () => {
      it('should add a new field service report', async () => {
        await user.load();

        const patch: UserFieldServiceReportsUpdate = {
          report_date: '2026/01/01',
          updatedAt: '2026-02-01T00:00:00Z',
          hours: '10',
          bible_studies: '5',
        };

        await user.applyFieldServiceReportPatch(patch);

        const uploadFileCalls = (s3Service.uploadFile as Mock).mock.calls;
        const reportCall = uploadFileCalls.find((call) =>
          call[0].includes('field_service_reports.json')
        );
        const mutationCall = uploadFileCalls.find((call) =>
          call[0].includes('mutations.json')
        );

        expect(mutationCall).toBeDefined();
        expect(reportCall).toBeDefined();

        const merged = reportCall![1] as string;
        const savedReports = JSON.parse(merged) as UserFieldServiceReport[];

        expect(savedReports).toHaveLength(1);
        expect(savedReports[0].hours).toBe('10');
        expect(savedReports[0].bible_studies).toBe('5');
        expect(user.ETag).toBe('v1');
      });
    });

    describe('when an existing report exists', () => {
      const existingReport: UserFieldServiceReport = {
        report_date: '2026/01/01',
        _deleted: false,
        updatedAt: '2026-01-15T00:00:00Z',
        shared_ministry: '',
        hours: '10',
        bible_studies: '5',
        comments: '',
        record_type: 'report',
        status: 'submitted',
        person_uid: userId,
      };

      beforeEach(() => {
        (s3Service.getFile as Mock).mockImplementation(async (key: string) => {
          if (key.includes('field_service_reports.json')) {
            return JSON.stringify([existingReport]);
          }
          return JSON.stringify([]);
        });
      });

      it('should update an existing field service report', async () => {
        await user.load();

        const patch: UserFieldServiceReportsUpdate = {
          report_date: existingReport.report_date,
          updatedAt: '2026-02-01T00:00:00Z',
          hours: '12',
        };

        await user.applyFieldServiceReportPatch(patch);

        const uploadFileCalls = (s3Service.uploadFile as Mock).mock.calls;
        const reportCall = uploadFileCalls.find((call) =>
          call[0].includes('field_service_reports.json')
        );
        const mutationCall = uploadFileCalls.find((call) =>
          call[0].includes('mutations.json')
        );

        expect(mutationCall).toBeDefined();
        expect(reportCall).toBeDefined();

        const merged = reportCall![1] as string;
        const savedReports = JSON.parse(merged) as UserFieldServiceReport[];

        expect(savedReports).toHaveLength(1);
        expect(savedReports[0].hours).toBe(patch.hours);
        expect(savedReports[0].bible_studies).toBe(
          existingReport.bible_studies
        );
        expect(user.ETag).toBe('v1');
      });

      it('should not save if patch timestamp is not newer', async () => {
        await user.load();

        const patch: UserFieldServiceReportsUpdate = {
          report_date: existingReport.report_date,
          updatedAt: '2026-01-15T00:00:00Z',
          hours: '12',
        };

        await user.applyFieldServiceReportPatch(patch);

        expect(s3Service.uploadFile).not.toHaveBeenCalled();
        expect(user.ETag).toBe('v0');
      });
    });
  });
});
