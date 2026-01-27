import { beforeEach, describe, expect, it, Mock, vi } from 'vitest';
import {
  CongChange,
  CongPersonUpdate,
  CongSettingsServerUpdate,
  CongBranchAnalysis,
  CongBranchAnalysisUpdate,
  CongSettingsUpdate,
  CongPerson,
  CongBranchFieldServiceReport,
  CongBranchFieldServiceReportUpdate,
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

      if (
        key.includes('mutations.json') ||
        key.includes('persons.json') ||
        key.includes('branch_cong_analysis.json') ||
        key.includes('branch_field_service_reports.json')
      ) {
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

      const serverPatch: CongSettingsServerUpdate = {
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

      const batch: CongChange['changes'] = [
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

    it('should apply a single settings patch and save with history', async () => {
      await congregation.load();

      const patch: CongSettingsUpdate = {
        time_away_public: { value: true, updatedAt: '2026-01-26T12:00:00Z' },
      };

      await congregation.applyBatchedChanges([
        { scope: 'settings', patch: patch },
      ]);

      const uploadFileCalls = (s3Service.uploadFile as Mock).mock.calls;

      const settingsCall = uploadFileCalls.find((call) =>
        call[0].includes('settings.json')
      );
      const mutationCall = uploadFileCalls.find((call) =>
        call[0].includes('mutations.json')
      );

      expect(settingsCall).toBeDefined();
      expect(mutationCall).toBeDefined();

      expect(congregation.settings).toHaveProperty('time_away_public');
      expect(congregation.settings.time_away_public!.value).toBe(true);
      expect(congregation.settings.time_away_public!.updatedAt).toBe(
        '2026-01-26T12:00:00Z'
      );
      expect(congregation.ETag).toBe('v1');
    });

    it('should apply a single branch_cong_analysis patch and save with history', async () => {
      await congregation.load();

      const patch: CongBranchAnalysisUpdate = {
        report_date: '2026-01-01',
        updatedAt: '2026-01-26T12:00:00Z',
        meeting_average: '100',
        publishers: '50',
      };

      await congregation.applyBatchedChanges([
        { scope: 'branch_cong_analysis', patch: patch },
      ]);

      const uploadFileCalls = (s3Service.uploadFile as Mock).mock.calls;

      const analysisCall = uploadFileCalls.find((call) =>
        call[0].includes('branch_cong_analysis.json')
      );
      const mutationCall = uploadFileCalls.find((call) =>
        call[0].includes('mutations.json')
      );

      expect(analysisCall).toBeDefined();
      expect(mutationCall).toBeDefined();

      const merged = analysisCall![1] as string;
      const savedAnalysis = JSON.parse(merged) as CongBranchAnalysis[];

      expect(savedAnalysis).toHaveLength(1);
      expect(savedAnalysis[0].report_date).toBe('2026-01-01');
      expect(savedAnalysis[0].meeting_average).toBe('100');
      expect(savedAnalysis[0].publishers).toBe('50');
      expect(congregation.ETag).toBe('v1');
    });

    it('should apply a single branch_field_service_reports patch and save with history', async () => {
      await congregation.load();

      const patch: CongBranchFieldServiceReportUpdate = {
        report_date: '2026-02-01',
        updatedAt: '2026-02-28T12:00:00Z',
        publishers_active: '120',
        weekend_meeting_average: '150',
      };

      await congregation.applyBatchedChanges([
        { scope: 'branch_field_service_reports', patch: patch },
      ]);

      const uploadFileCalls = (s3Service.uploadFile as Mock).mock.calls;

      const reportCall = uploadFileCalls.find((call) =>
        call[0].includes('branch_field_service_reports.json')
      );
      const mutationCall = uploadFileCalls.find((call) =>
        call[0].includes('mutations.json')
      );

      expect(reportCall).toBeDefined();
      expect(mutationCall).toBeDefined();

      const merged = reportCall![1] as string;
      const savedReport = JSON.parse(merged) as CongBranchFieldServiceReport[];

      expect(savedReport).toHaveLength(1);
      expect(savedReport[0].report_date).toBe('2026-02-01');
      expect(savedReport[0].publishers_active).toBe('120');
      expect(savedReport[0].weekend_meeting_average).toBe('150');
      expect(congregation.ETag).toBe('v1');
    });

    it('should apply a single person patch and save with history', async () => {
      await congregation.load();

      const patch: CongPersonUpdate = {
        person_uid: 'person-1',
        person_firstname: { value: 'John', updatedAt: '2026-01-26T12:00:00Z' },
        person_lastname: { value: 'Doe', updatedAt: '2026-01-26T12:00:00Z' },
      };

      await congregation.applyBatchedChanges([
        { scope: 'persons', patch: patch },
      ]);

      const uploadFileCalls = (s3Service.uploadFile as Mock).mock.calls;

      const personsCall = uploadFileCalls.find((call) =>
        call[0].includes('persons.json')
      );
      const mutationCall = uploadFileCalls.find((call) =>
        call[0].includes('mutations.json')
      );

      expect(personsCall).toBeDefined();
      expect(mutationCall).toBeDefined();

      const merged = personsCall![1] as string;
      const savedPersons = JSON.parse(merged) as CongPerson[];

      expect(savedPersons).toHaveLength(1);
      expect(savedPersons[0].person_uid).toBe('person-1');
      expect(savedPersons[0].person_firstname.value).toBe('John');
      expect(savedPersons[0].person_lastname.value).toBe('Doe');
      expect(congregation.ETag).toBe('v1');
    });
  });

  // --- CONVENIENCE WRAPPER TESTS ---
  describe('Convenience Wrappers (Plumbing)', () => {
    it('applyCongSettingsPatch should route correctly to batched engine', async () => {
      const spy = vi.spyOn(congregation, 'applyBatchedChanges');

      const patch: CongSettingsUpdate = {
        time_away_public: { value: true, updatedAt: '2026-01-26T12:00:00Z' },
      };

      await congregation.applyCongSettingsPatch(patch);

      expect(spy).toHaveBeenCalledWith([{ scope: 'settings', patch }]);
    });

    it('applyBranchCongAnalysisPatch should route correctly to batched engine', async () => {
      const spy = vi.spyOn(congregation, 'applyBatchedChanges');

      const patch: CongBranchAnalysisUpdate = {
        report_date: '2026-01-01',
        updatedAt: '2026-01-26T12:00:00Z',
        meeting_average: '100',
      };

      await congregation.applyBranchCongAnalysisPatch(patch);

      expect(spy).toHaveBeenCalledWith([
        { scope: 'branch_cong_analysis', patch },
      ]);
    });

    it('applyBranchFieldServiceReportPatch should route correctly to batched engine', async () => {
      const spy = vi.spyOn(congregation, 'applyBatchedChanges');

      const patch: CongBranchFieldServiceReportUpdate = {
        report_date: '2026-03-01',
        updatedAt: '2026-03-28T12:00:00Z',
        publishers_active: '130',
      };

      await congregation.applyBranchFieldServiceReportPatch(patch);

      expect(spy).toHaveBeenCalledWith([
        { scope: 'branch_field_service_reports', patch },
      ]);
    });

    it('applyPersonPatch should route correctly to batched engine', async () => {
      const spy = vi.spyOn(congregation, 'applyBatchedChanges');

      const patch: CongPersonUpdate = {
        person_uid: 'person-1',
        person_firstname: { value: 'John', updatedAt: '2026-01-26T12:00:00Z' },
        person_lastname: { value: 'Doe', updatedAt: '2026-01-26T12:00:00Z' },
      };

      await congregation.applyPersonPatch(patch);

      expect(spy).toHaveBeenCalledWith([{ scope: 'persons', patch }]);
    });
  });
});
