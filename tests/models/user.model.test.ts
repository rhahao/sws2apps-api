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

      // 1. Verify specific file path was hit
      const profileUpload = calls.find((c) => c[0].endsWith('profile.json'));
      expect(profileUpload).toBeDefined();

      // 2. VERIFY CONTENT (Integrity Check)
      const uploadedData = JSON.parse(profileUpload![1]);
      expect(uploadedData.role).toBe('vip');

      // 3. VERIFY IN-MEMORY STATE
      expect(user.profile?.role).toBe('vip');

      // 4. Verify "Quiet" behavior
      const realUploads = calls.map((c) => c[0]) as string[];
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

      const realUploads = calls.map((c) => c[0]) as string[];

      expect(realUploads).toEqual(
        expect.arrayContaining([
          `users/${userId}/mutations.json`,
          `users/${userId}/profile.json`,
          `users/${userId}/field_service_reports.json`,
          `users/${userId}/`,
        ])
      );

      expect(user.ETag).toBe('v1');
    });

    it('should not update ETag if a data file upload fails (Commit Last)', async () => {
      await user.load();
    
      // 1. We mock the FIRST file upload to fail (e.g., profile.json)
      (s3Service.uploadFile as Mock)
        .mockRejectedValueOnce(new Error('S3 Connection Lost'));
    
      const patch: UserProfileClientUpdate = {
        firstname: { value: 'Patched', updatedAt: newTimestamp },
      };
    
      await expect(
        user.applyBatchedChanges([{ scope: 'profile', patch }])
      ).rejects.toThrow('S3 Connection Lost');
    
      // 2. PROOF: The ETag upload was never even called because the engine short-circuited
      const { calls } = (s3Service.uploadFile as Mock).mock;
      const etagCall = calls.find(c => c[0] === `users/${userId}/`);
      
      expect(etagCall).toBeUndefined(); // This is the gold standard for safety
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

    it('should update an existing item in field_service_reports without duplicating or losing data', async () => {
      await user.load();

      const patch: UserFieldServiceReportsUpdate = {
        report_date: '2026-01', // Identity key
        hours: '15', // The change
        updatedAt: newTimestamp,
      };

      await user.applyBatchedChanges([
        { scope: 'field_service_reports', patch },
      ]);

      const reportUploadCall = (s3Service.uploadFile as Mock).mock.calls.find(
        (call) => call[0].endsWith('field_service_reports.json')
      );

      const uploadedReports = JSON.parse(reportUploadCall![1]);
      const updatedReport = uploadedReports.find(
        (r: any) => r.report_date === '2026-01'
      );

      // 1. Length check (Identity check)
      expect(uploadedReports.length).toBe(1);

      // 2. Value check (The patch)
      expect(updatedReport.hours).toBe('15');

      // 3. Integrity check (Preserving data not in the patch)
      expect(updatedReport.updatedAt).toBe(newTimestamp);
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

    it('should update an existing bible_study and record it in mutations', async () => {
      await user.load();

      const patch: UserBibleStudiesUpdate = {
        person_uid: 'study-1',
        person_name: 'Updated Name',
        updatedAt: newTimestamp,
      };

      await user.applyBatchedChanges([{ scope: 'bible_studies', patch }]);

      const { calls } = (s3Service.uploadFile as Mock).mock;

      // 1. Verify S3 Data Integrity
      const dataCall = calls.find((c) => c[0].endsWith('bible_studies.json'));
      const data = JSON.parse(dataCall![1]);
      const study = data.find((s: any) => s.person_uid === 'study-1');

      expect(data.length).toBe(1);
      expect(study.person_name).toBe('Updated Name');

      // 2. Verify Mutation Log (The "Memory" proxy)
      const mutationCall = calls.find((c) => c[0].endsWith('mutations.json'));
      const mutations = JSON.parse(mutationCall![1]);
      const lastMutation = mutations[mutations.length - 1];

      expect(lastMutation.changes[0].scope).toBe('bible_studies');
      expect((lastMutation.changes[0].patch as any).person_name).toBe(
        'Updated Name'
      );
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

    it('should update an existing delegated_field_service_report without duplicating', async () => {
      await user.load();
    
      const patch: DelegatedFieldServiceReportUpdate = {
        report_id: 'delegated-1',
        person_uid: 'p1',
        report_date: '2026/01',
        updatedAt: newTimestamp,
        hours: '12',
      };
    
      await user.applyBatchedChanges([
        { scope: 'delegated_field_service_reports', patch },
      ]);
    
      const { calls } = (s3Service.uploadFile as Mock).mock;
      const dataCall = calls.find((c) => c[0].endsWith('delegated_field_service_reports.json'));
      const data = JSON.parse(dataCall![1]);
    
      // Ensure length is still 1 (Updated, not Appended)
      expect(data.length).toBe(1);
      
      const report = data.find((r: any) => r.report_id === 'delegated-1');
      expect(report.hours).toBe('12');
      expect(report.updatedAt).toBe(newTimestamp);
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
