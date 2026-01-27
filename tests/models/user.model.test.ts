import { describe, it, expect, beforeEach, vi, Mock } from 'vitest';
import { User } from '../../src/models/user.model.js';
import { s3Service } from '../../src/services/index.js';
import {
  DelegatedFieldServiceReport,
  DelegatedFieldServiceReportUpdate,
  UserBibleStudiesUpdate,
  UserBibleStudy,
  UserChange,
  UserFieldServiceReport,
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

  // --- SERVER ONLY PATCH TESTS ---
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

      const uploadFileCalls = (s3Service.uploadFile as Mock).mock.calls;

      expect(uploadFileCalls).toHaveLength(1); // profile only, no mutations, no ETag

      const profileCall = uploadFileCalls.find((call) =>
        call[0].includes('profile.json')
      );

      expect(profileCall).toBeDefined();

      expect(user.ETag).toBe('v0');
    });
  });

  // --- CORE ENGINE TESTS ---
  describe('applyBatchedChanges (Engine)', () => {
    // Clear mock calls to s3Service.uploadFile before starting the batched changes
    beforeEach(() => {
      (s3Service.uploadFile as Mock).mockClear();
    });

    it('should process multiple scopes in one S3 transaction', async () => {
      await user.load();

      const batch: UserChange['changes'] = [
        {
          scope: 'profile',
          patch: {
            lastname: { value: 'Doe', updatedAt: '2026-01-26T10:00:00Z' },
          },
        },
        {
          scope: 'field_service_reports',
          patch: {
            report_date: '2026-02',
            hours: '10',
            updatedAt: '2026-01-26T10:00:00Z',
          },
        },
      ];

      await user.applyBatchedChanges(batch);

      // Verify state updates
      expect(user.profile).toHaveProperty('lastname');

      const uploadFileCalls = (s3Service.uploadFile as Mock).mock.calls;

      // Verify SaveWithHistory orchestration
      // 1. Mutations, 2. ETag, 3. Profile, 4. Reports
      expect(uploadFileCalls).toHaveLength(4);

      const profileCall = uploadFileCalls.find((call) =>
        call[0].includes('profile.json')
      );

      const mutationCall = uploadFileCalls.find((call) =>
        call[0].includes('mutations.json')
      );

      const reportsCall = uploadFileCalls.find((call) =>
        call[0].includes('field_service_reports.json')
      );

      expect(mutationCall).toBeDefined();
      expect(profileCall).toBeDefined();
      expect(reportsCall).toBeDefined();

      expect(user.ETag).toBe('v1');
    });

    it('should deduplicate updates for the same item within a single batch', async () => {
      await user.load();

      // Client sends two updates for the same report month in one batch
      const batch: UserChange['changes'] = [
        {
          scope: 'field_service_reports',
          patch: {
            report_date: '2026-01',
            hours: '8',
            updatedAt: '2026-01-26T10:00:00Z',
          },
        },
        {
          scope: 'field_service_reports',
          patch: {
            report_date: '2026-01',
            hours: '12',
            updatedAt: '2026-01-26T11:00:00Z',
          },
        },
      ];

      await user.applyBatchedChanges(batch);

      const uploadFileCalls = (s3Service.uploadFile as Mock).mock.calls;

      const reportsCall = uploadFileCalls.find((call) =>
        call[0].includes('field_service_reports.json')
      );

      const reports = JSON.parse(reportsCall![1]) as UserFieldServiceReport[];
      const janReport = reports.find((r) => r.report_date === '2026-01');

      // Should have adopted the latest update from the batch
      expect(janReport?.hours).toBe('12');
      expect(reports).toHaveLength(1); // No duplicates created

      expect(user.ETag).toBe('v1');
    });

    it('should ignore stale updates and skip all S3 uploads', async () => {
      await user.load(); // Loaded data has updatedAt: '2026-01-01'

      const staleBatch: UserChange['changes'] = [
        {
          scope: 'profile',
          patch: {
            firstname: {
              value: 'Newer Name but Stale',
              updatedAt: '2025-12-31T23:59:59Z',
            },
          },
        },
      ];

      await user.applyBatchedChanges(staleBatch);

      // CRITICAL ASSERTIONS:
      // 1. ETag must remain v0
      expect(user.ETag).toBe('v0');

      // 2. Internal state should not have changed
      expect(user.profile?.firstname.value).toBe('Old');

      // 3. NO S3 UPLOADS (No mutations, no profile, no reports)
      expect(s3Service.uploadFile).not.toHaveBeenCalled();
    });

    it('should apply a single profile patch and save with history', async () => {
      await user.load();

      const patch: UserProfileClientUpdate = {
        lastname: { value: 'Jane', updatedAt: '2026-01-26T12:00:00Z' },
      };

      await user.applyBatchedChanges([{ scope: 'profile', patch: patch }]);

      const uploadFileCalls = (s3Service.uploadFile as Mock).mock.calls;

      const profileCall = uploadFileCalls.find((call) =>
        call[0].includes('profile.json')
      );
      const mutationCall = uploadFileCalls.find((call) =>
        call[0].includes('mutations.json')
      );

      expect(profileCall).toBeDefined();
      expect(mutationCall).toBeDefined();

      expect(user.profile).toHaveProperty('lastname');
      expect(user.profile!.lastname.value).toBe(patch.lastname!.value);
      expect(user.profile!.lastname.updatedAt).toBe(patch.lastname!.updatedAt);

      expect(user.ETag).toBe('v1');
    });

    it('should apply a single settings patch and save with history', async () => {
      await user.load();

      const patch: UserSettingsUpdate = {
        data_view: { value: 'table', updatedAt: '2026-01-26T12:00:00Z' },
      };

      await user.applyBatchedChanges([{ scope: 'settings', patch: patch }]);

      const uploadFileCalls = (s3Service.uploadFile as Mock).mock.calls;

      const settingsCall = uploadFileCalls.find((call) =>
        call[0].includes('settings.json')
      );
      const mutationCall = uploadFileCalls.find((call) =>
        call[0].includes('mutations.json')
      );

      expect(settingsCall).toBeDefined();
      expect(mutationCall).toBeDefined();

      expect(user.settings).toHaveProperty('data_view');
      expect(user.settings!.data_view.value).toBe(patch.data_view!.value);
      expect(user.settings!.data_view.updatedAt).toBe(
        patch.data_view!.updatedAt
      );

      expect(user.ETag).toBe('v1');
    });

    it('should apply a single field_service_reports patch and save with history', async () => {
      await user.load();

      const patch: UserFieldServiceReportsUpdate = {
        report_date: '2026/01/01',
        updatedAt: '2026-01-26T12:00:00Z',
        hours: '100',
      };

      await user.applyBatchedChanges([
        { scope: 'field_service_reports', patch: patch },
      ]);

      const uploadFileCalls = (s3Service.uploadFile as Mock).mock.calls;

      const reportsCall = uploadFileCalls.find((call) =>
        call[0].includes('field_service_reports.json')
      );
      const mutationCall = uploadFileCalls.find((call) =>
        call[0].includes('mutations.json')
      );

      expect(reportsCall).toBeDefined();
      expect(mutationCall).toBeDefined();

      const merged = reportsCall![1] as string;
      const savedReports = JSON.parse(merged) as UserFieldServiceReport[];

      expect(savedReports).toHaveLength(1);
      expect(savedReports[0].report_date).toBe(patch.report_date);
      expect(savedReports[0].updatedAt).toBe(patch.updatedAt);
      expect(savedReports[0].hours).toBe(patch.hours);

      expect(user.ETag).toBe('v1');
    });

    it('should apply a single bible_studies patch and save with history', async () => {
      await user.load();

      const patch: UserBibleStudiesUpdate = {
        person_uid: 'study-1',
        updatedAt: '2026-01-26T12:00:00Z',
        person_name: 'Jane Smith',
      };

      await user.applyBatchedChanges([
        { scope: 'bible_studies', patch: patch },
      ]);

      const uploadFileCalls = (s3Service.uploadFile as Mock).mock.calls;

      const studiesCall = uploadFileCalls.find((call) =>
        call[0].includes('bible_studies.json')
      );
      const mutationCall = uploadFileCalls.find((call) =>
        call[0].includes('mutations.json')
      );

      expect(studiesCall).toBeDefined();
      expect(mutationCall).toBeDefined();

      const merged = studiesCall![1] as string;
      const savedReports = JSON.parse(merged) as UserBibleStudy[];

      expect(savedReports).toHaveLength(1);
      expect(savedReports[0].person_uid).toBe(patch.person_uid);
      expect(savedReports[0].updatedAt).toBe(patch.updatedAt);
      expect(savedReports[0].person_name).toBe(patch.person_name);

      expect(user.ETag).toBe('v1');
    });

    it('should apply a single delegated_field_service_reports patch and save with history', async () => {
      await user.load();

      const patch: DelegatedFieldServiceReportUpdate = {
        report_id: 'delegated-report-id',
        person_uid: 'person-uid',
        updatedAt: '2026-01-26T12:00:00Z',
        report_date: '2026/01/01',
        hours: '20',
      };

      await user.applyBatchedChanges([
        { scope: 'delegated_field_service_reports', patch: patch },
      ]);

      const uploadFileCalls = (s3Service.uploadFile as Mock).mock.calls;

      const reportsCall = uploadFileCalls.find((call) =>
        call[0].includes('delegated_field_service_reports.json')
      );
      const mutationCall = uploadFileCalls.find((call) =>
        call[0].includes('mutations.json')
      );

      expect(reportsCall).toBeDefined();
      expect(mutationCall).toBeDefined();

      const merged = reportsCall![1] as string;
      const savedReports = JSON.parse(merged) as DelegatedFieldServiceReport[];

      expect(savedReports).toHaveLength(1);
      expect(savedReports[0].report_id).toBe(patch.report_id);
      expect(savedReports[0].person_uid).toBe(patch.person_uid);
      expect(savedReports[0].report_date).toBe(patch.report_date);
      expect(savedReports[0].updatedAt).toBe(patch.updatedAt);
      expect(savedReports[0].hours).toBe(patch.hours);

      expect(user.ETag).toBe('v1');
    });
  });

  // --- CONVENIENCE WRAPPER TESTS ---
  describe('Convenience Wrappers (Plumbing)', () => {
    it('applyProfilePatch should route correctly to batched engine', async () => {
      const spy = vi.spyOn(user, 'applyBatchedChanges');

      const patch: UserProfileClientUpdate = {
        firstname: { value: 'Jane', updatedAt: '2026-01-26T12:00:00Z' },
      };

      await user.applyProfilePatch(patch);

      expect(spy).toHaveBeenCalledWith([{ scope: 'profile', patch }]);
    });

    it('applyFieldServiceReportPatch should route correctly to batched engine', async () => {
      const spy = vi.spyOn(user, 'applyBatchedChanges');

      const patch: UserFieldServiceReportsUpdate = {
        report_date: '2026-03',
        hours: '15',
        updatedAt: '2026-01-26T12:00:00Z',
        _deleted: false,
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
        updatedAt: '2026-01-26T12:00:00Z',
        person_name: 'Jane Smith',
        _deleted: false,
      };

      await user.applyBibleStudyPatch(patch);

      expect(spy).toHaveBeenCalledWith([{ scope: 'bible_studies', patch }]);
    });

    it('applyDelegatedFieldServiceReporPatch should route correctly to batched engine', async () => {
      const spy = vi.spyOn(user, 'applyBatchedChanges');

      const patch: DelegatedFieldServiceReportUpdate = {
        report_id: 'delegated-report-id',
        report_date: "2026/01/01",
        person_uid: 'person-uid',
        updatedAt: '2026-01-26T12:00:00Z',
        hours: '20',
      };

      await user.applyDelegatedFieldServiceReporPatch(patch);

      expect(spy).toHaveBeenCalledWith([
        { scope: 'delegated_field_service_reports', patch },
      ]);
    });
  });
});
