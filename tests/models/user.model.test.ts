import { describe, it, expect, beforeEach, vi, Mock } from 'vitest';
import { User } from '../../src/models/user.model.js';
import { s3Service } from '../../src/services/index.js';
import {
  DelegatedFieldServiceReportUpdate,
  UserBibleStudiesUpdate,
  UserChange,
  UserFieldServiceReportsUpdate,
  UserProfileClientUpdate,
  UserProfileServerUpdate,
  UserSettingsUpdate,
} from '../../src/types/index.js';

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

describe('User Model', () => {
  let user: User;
  const userId = 'test-user-id';
  const newTimestamp = new Date().toISOString();

  beforeEach(() => {
    user = new User(userId);
    vi.clearAllMocks();

    // Setup base S3 mocks
    (s3Service.getFile as Mock).mockImplementation(async (key: string) => {
      if (key.includes('profile.json')) {
        return JSON.stringify({
          firstname: { value: 'Old', updatedAt: '2026-01-01T00:00:00Z' },
        });
      }
      if (key.includes('settings.json')) {
        return JSON.stringify({});
      }
      if (
        key.includes('mutations.json') ||
        key.includes('field_service_reports.json') ||
        key.includes('bible_studies.json') ||
        key.includes('delegated_field_service_reports.json')
      ) {
        return JSON.stringify([]);
      }
      return null;
    });

    (s3Service.getObjectMetadata as Mock).mockResolvedValue({ etag: 'v0' });
    (s3Service.uploadFile as Mock).mockResolvedValue({});
  });

  describe('applyServerProfilePatch', () => {
    it('should apply a server profile patch without bumping ETag or saving history', async () => {
      await user.load();
      const serverPatch: UserProfileServerUpdate = { role: 'vip' };
      await user.applyServerProfilePatch(serverPatch);

      const { calls } = (s3Service.uploadFile as Mock).mock;

      expect(calls.length).toBe(1);

      const realUploads = calls.map((c) => c[0]) as string[];

      expect(realUploads[0].endsWith('profile.json')).toBe(true);
      expect(user.ETag).toBe('v0');
    });
  });

  describe('applyBatchedChanges (Engine)', () => {
    it('should process multiple scopes and trigger all required S3 uploads', async () => {
      await user.load();

      const batch: UserChange['changes'] = [
        {
          scope: 'profile',
          patch: { lastname: { value: 'Doe', updatedAt: newTimestamp } },
        },
        {
          scope: 'field_service_reports',
          patch: {
            report_date: '2026-02',
            updatedAt: newTimestamp,
            hours: '10',
          },
        },
      ];

      await user.applyBatchedChanges(batch);

      const { calls } = (s3Service.uploadFile as Mock).mock;
      // It saves: 1. mutations, 2. profile, 3. field_service_reports, 4. ETag
      expect(calls.length).toBe(4);

      const realUploads = calls.map((c) => c[0]) as string[];

      expect(realUploads[1].endsWith('mutations.json')).toBe(true);
      expect(realUploads[2].endsWith('profile.json')).toBe(true);
      expect(realUploads[3].endsWith('field_service_reports.json')).toBe(true);

      expect(user.ETag).toBe('v1');
    });

    it('should ignore stale updates and skip all S3 uploads', async () => {
      await user.load();

      const staleBatch: UserChange['changes'] = [
        {
          scope: 'profile',
          patch: {
            firstname: {
              value: 'Stale Name',
              updatedAt: '2025-12-31T23:59:59Z',
            },
          },
        },
      ];

      await user.applyBatchedChanges(staleBatch);

      expect(s3Service.uploadFile).not.toHaveBeenCalled();
      expect(user.ETag).toBe('v0');
    });

    it('should apply a profile patch and trigger the correct S3 uploads', async () => {
      await user.load();

      const patch: UserProfileClientUpdate = {
        firstname: { value: 'Patched', updatedAt: newTimestamp },
      };

      await user.applyBatchedChanges([{ scope: 'profile', patch }]);

      const { calls } = (s3Service.uploadFile as Mock).mock;

      expect(calls.length).toBe(3);

      const realUploads = calls.map((c) => c[0]) as string[];

      expect(realUploads[1].endsWith('mutations.json')).toBe(true);
      expect(realUploads[2].endsWith('profile.json')).toBe(true);
      expect(user.ETag).toBe('v1');
    });

    it('should apply a settings patch and trigger the correct S3 uploads', async () => {
      await user.load();

      const patch: UserSettingsUpdate = {
        data_view: { value: 'table', updatedAt: newTimestamp },
      };

      await user.applyBatchedChanges([{ scope: 'settings', patch }]);

      const { calls } = (s3Service.uploadFile as Mock).mock;

      expect(calls.length).toBe(3);

      const realUploads = calls.map((c) => c[0]) as string[];

      expect(realUploads[1].endsWith('mutations.json')).toBe(true);
      expect(realUploads[2].endsWith('settings.json')).toBe(true);
      expect(user.ETag).toBe('v1');
    });

    it('should apply a field_service_reports patch and trigger the correct S3 uploads', async () => {
      await user.load();

      const patch: UserFieldServiceReportsUpdate = {
        report_date: '2026-03',
        hours: '5',
        updatedAt: newTimestamp,
      };

      await user.applyBatchedChanges([
        { scope: 'field_service_reports', patch },
      ]);

      const { calls } = (s3Service.uploadFile as Mock).mock;

      expect(calls.length).toBe(3);

      const realUploads = calls.map((c) => c[0]) as string[];

      expect(realUploads[1].endsWith('mutations.json')).toBe(true);
      expect(realUploads[2].endsWith('field_service_reports.json')).toBe(true);
      expect(user.ETag).toBe('v1');
    });

    it('should apply a bible_studies patch and trigger the correct S3 uploads', async () => {
      await user.load();

      const patch: UserBibleStudiesUpdate = {
        person_uid: 'study-patch',
        person_name: 'Bible Student',
        updatedAt: newTimestamp,
      };

      await user.applyBatchedChanges([{ scope: 'bible_studies', patch }]);

      const { calls } = (s3Service.uploadFile as Mock).mock;

      expect(calls.length).toBe(3);

      const realUploads = calls.map((c) => c[0]) as string[];

      expect(realUploads[1].endsWith('mutations.json')).toBe(true);
      expect(realUploads[2].endsWith('bible_studies.json')).toBe(true);
      expect(user.ETag).toBe('v1');
    });

    it('should apply a delegated_field_service_reports patch and trigger the correct S3 uploads', async () => {
      await user.load();

      const patch: DelegatedFieldServiceReportUpdate = {
        report_id: 'delegated-patch',
        person_uid: 'p1',
        report_date: '2026/01',
        updatedAt: newTimestamp,
      };

      await user.applyBatchedChanges([
        { scope: 'delegated_field_service_reports', patch },
      ]);

      const { calls } = (s3Service.uploadFile as Mock).mock;

      expect(calls.length).toBe(3);

      const realUploads = calls.map((c) => c[0]) as string[];

      expect(realUploads[1].endsWith('mutations.json')).toBe(true);
      expect(
        realUploads[2].endsWith('delegated_field_service_reports.json')
      ).toBe(true);
      expect(user.ETag).toBe('v1');
    });
  });

  describe('Convenience Wrappers (Plumbing)', () => {
    it('applyProfilePatch should route correctly to batched engine', async () => {
      const spy = vi.spyOn(user, 'applyBatchedChanges');

      const patch: UserProfileClientUpdate = {
        firstname: { value: 'Jane', updatedAt: newTimestamp },
      };

      await user.applyProfilePatch(patch);

      expect(spy).toHaveBeenCalledWith([{ scope: 'profile', patch }]);
    });

    it('applyFieldServiceReportPatch should route correctly to batched engine', async () => {
      const spy = vi.spyOn(user, 'applyBatchedChanges');

      const patch: UserFieldServiceReportsUpdate = {
        report_date: '2026/03',
        updatedAt: newTimestamp,
        hours: '10',
      };

      await user.applyFieldServiceReportPatch(patch);

      expect(spy).toHaveBeenCalledWith([
        { scope: 'field_service_reports', patch },
      ]);
    });

    it('applyBibleStudyPatch should route correctly to batched engine', async () => {
      const spy = vi.spyOn(user, 'applyBatchedChanges');

      const patch: UserBibleStudiesUpdate = {
        person_uid: 'study-1',
        updatedAt: newTimestamp,
        person_name: 'New Student Name',
      };

      await user.applyBibleStudyPatch(patch);

      expect(spy).toHaveBeenCalledWith([{ scope: 'bible_studies', patch }]);
    });

    it('applyDelegatedFieldServiceReporPatch should route correctly to batched engine', async () => {
      const spy = vi.spyOn(user, 'applyBatchedChanges');

      const patch: DelegatedFieldServiceReportUpdate = {
        report_id: 'delegated-1',
        person_uid: 'p1',
        report_date: '2026/01',
        updatedAt: newTimestamp,
      };

      await user.applyDelegatedFieldServiceReporPatch(patch);

      expect(spy).toHaveBeenCalledWith([
        { scope: 'delegated_field_service_reports', patch },
      ]);
    });
  });
});
