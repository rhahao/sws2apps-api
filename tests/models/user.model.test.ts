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
      if (key.endsWith('profile.json')) {
        return JSON.stringify({
          firstname: { value: 'Old', updatedAt: '2026-01-01T00:00:00Z' },
        });
      }

      if (key.endsWith('settings.json')) {
        return JSON.stringify({});
      }

      if (key.endsWith('delegated_field_service_reports.json')) {
        return JSON.stringify([
          {
            report_id: 'delegated-1',
            person_uid: 'p1',
            report_date: '2026/01',
            updatedAt: '2026-01-15T00:00:00Z',
          },
        ]);
      }

      if (key.endsWith('field_service_reports.json')) {
        return JSON.stringify([
          {
            report_date: '2026-01',
            hours: '10',
            updatedAt: '2026-01-15T00:00:00Z',
          },
        ]);
      }

      if (key.endsWith('bible_studies.json')) {
        return JSON.stringify([
          {
            person_uid: 'study-1',
            person_name: 'Old Name',
            updatedAt: '2026-01-15T00:00:00Z',
          },
        ]);
      }

      if (key.includes('mutations.json')) {
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

      const realUploads = calls.map((c) => c[0]) as string[];

      expect(realUploads).toContain(`users/${userId}/profile.json`);
      expect(realUploads).not.toContain(`users/${userId}/mutations.json`);

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

      expect(realUploads).toContain(`users/${userId}/mutations.json`);
      expect(realUploads).toContain(`users/${userId}/profile.json`);
      expect(realUploads).toContain(
        `users/${userId}/field_service_reports.json`
      );

      expect(user.ETag).toBe('v1');
    });

    it('should not update ETag if S3 upload fails during batch', async () => {
      await user.load();

      (s3Service.uploadFile as Mock)
        .mockResolvedValueOnce({}) // ETag bump succeeds
        .mockRejectedValueOnce(new Error('S3 Upload Failed')); // mutations.json fails

      const patch: UserProfileClientUpdate = {
        firstname: { value: 'Patched', updatedAt: newTimestamp },
      };

      await expect(
        user.applyBatchedChanges([{ scope: 'profile', patch }])
      ).rejects.toThrow('S3 Upload Failed');

      // ETag should not be updated in the user object if the process fails.
      expect(user.profile!.firstname.value).toBe('Old');
      expect(user.ETag).toBe('v0');
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

    it('should apply a field_service_reports patch and increase array length', async () => {
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

      const reportUploadCall = calls.find((call) =>
        call[0].endsWith('field_service_reports.json')
      );

      expect(reportUploadCall).toBeDefined();

      const uploadedReports = JSON.parse(reportUploadCall![1]);
      expect(uploadedReports.length).toBe(2);
    });

    it('should update an existing item in field_service_reports array and not change the length', async () => {
      await user.load();

      const patch: UserFieldServiceReportsUpdate = {
        report_date: '2026-01',
        hours: '15',
        updatedAt: newTimestamp,
      };

      await user.applyBatchedChanges([
        { scope: 'field_service_reports', patch },
      ]);

      const { calls } = (s3Service.uploadFile as Mock).mock;

      const reportUploadCall = calls.find((call) =>
        call[0].endsWith('field_service_reports.json')
      );

      expect(reportUploadCall).toBeDefined();

      const uploadedReports = JSON.parse(reportUploadCall![1]);
      expect(uploadedReports.length).toBe(1);
    });

    it('should apply a bible_studies patch and increase array length', async () => {
      await user.load();

      const patch: UserBibleStudiesUpdate = {
        person_uid: 'study-new',
        person_name: 'New Student',
        updatedAt: newTimestamp,
      };

      await user.applyBatchedChanges([{ scope: 'bible_studies', patch }]);

      const { calls } = (s3Service.uploadFile as Mock).mock;

      const bibleStudyUploadCall = calls.find((call) =>
        call[0].endsWith('bible_studies.json')
      );

      expect(bibleStudyUploadCall).toBeDefined();

      const uploadedStudies = JSON.parse(bibleStudyUploadCall![1]);
      expect(uploadedStudies.length).toBe(2);
    });

    it('should update an existing bible_study and not change the length', async () => {
      await user.load();

      const patch: UserBibleStudiesUpdate = {
        person_uid: 'study-1', // existing id
        person_name: 'Updated Name',
        updatedAt: newTimestamp,
      };

      await user.applyBatchedChanges([{ scope: 'bible_studies', patch }]);

      const { calls } = (s3Service.uploadFile as Mock).mock;

      const bibleStudyUploadCall = calls.find((call) =>
        call[0].endsWith('bible_studies.json')
      );

      expect(bibleStudyUploadCall).toBeDefined();

      const uploadedStudies = JSON.parse(bibleStudyUploadCall![1]);
      expect(uploadedStudies.length).toBe(1);
    });

    it('should apply a delegated_field_service_reports patch and increase array length', async () => {
      await user.load();

      const patch: DelegatedFieldServiceReportUpdate = {
        report_id: 'delegated-new',
        person_uid: 'p2',
        report_date: '2026/02',
        updatedAt: newTimestamp,
      };

      await user.applyBatchedChanges([
        { scope: 'delegated_field_service_reports', patch },
      ]);

      const { calls } = (s3Service.uploadFile as Mock).mock;

      const delegatedReportUploadCall = calls.find((call) =>
        call[0].endsWith('delegated_field_service_reports.json')
      );

      expect(delegatedReportUploadCall).toBeDefined();

      const uploadedDelegatedReports = JSON.parse(
        delegatedReportUploadCall![1]
      );
      expect(uploadedDelegatedReports.length).toBe(2);
    });

    it('should update an existing delegated_field_service_report and not change the length', async () => {
      await user.load();

      const patch: DelegatedFieldServiceReportUpdate = {
        report_id: 'delegated-1', // existing id
        person_uid: 'p1',
        report_date: '2026/01',
        updatedAt: newTimestamp,
        hours: '10',
      };

      await user.applyBatchedChanges([
        { scope: 'delegated_field_service_reports', patch },
      ]);

      const { calls } = (s3Service.uploadFile as Mock).mock;

      const delegatedReportUploadCall = calls.find((call) =>
        call[0].endsWith('delegated_field_service_reports.json')
      );

      expect(delegatedReportUploadCall).toBeDefined();

      const uploadedDelegatedReports = JSON.parse(
        delegatedReportUploadCall![1]
      );
      expect(uploadedDelegatedReports.length).toBe(1);
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
