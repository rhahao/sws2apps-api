import { beforeEach, describe, expect, it, Mock, vi } from 'vitest';
import {
  CongChange,
  CongSettingsServerUpdate,
  CongSettingsUpdate,
  CongScheduleUpdate,
  CongSchedule,
} from '../../src/types/index.js';
import { Congregation } from '../../src/models/congregation.model.js';
import { s3Service } from '../../src/services/index.js';
import mockData from '../mocks/data.json';

vi.mock('../../src/config/index.js', () => ({
  ENV: { nodeEnv: 'development' },
}));

vi.mock('../../src/services/s3.service.js', () => ({
  s3Service: {
    getFile: vi.fn(),
    uploadFile: vi.fn(),
    getObjectMetadata: vi.fn(),
  },
}));

vi.mock('../../src/utils/logger.js', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

describe('Congregation Model', () => {
  let congregation: Congregation;
  const congId = 'b2b17fbc-88f4-4695-ae63-be3d6f5f499a';
  const newTimestamp = new Date().toISOString();

  beforeEach(() => {
    congregation = new Congregation(congId);
    vi.clearAllMocks();

    (s3Service.getFile as Mock).mockImplementation(async (key: string) => {
      const finalKey = key.split('/').at(-1)!;

      const data = mockData.congregations[finalKey];

      if (data) {
        return JSON.stringify(data);
      }

      return null;
    });

    (s3Service.getObjectMetadata as Mock).mockResolvedValue({ etag: 'v0' });
    (s3Service.uploadFile as Mock).mockResolvedValue({});
  });

  // --- SERVER ONLY PATCH TESTS ---
  describe('applyServerSettingsPatch', () => {
    it('should apply server patch quietly (no ETag bump)', async () => {
      await congregation.load();

      const serverPatch: CongSettingsServerUpdate = {
        cong_name: 'New congregation name',
      };

      await congregation.applyServerSettingsPatch(serverPatch);

      const calls = (s3Service.uploadFile as Mock).mock.calls;
      expect(calls).toHaveLength(1); // Only settings.json
      expect(calls[0][0]).toContain('settings.json');
      expect(congregation.settings.cong_name).toBe(serverPatch.cong_name);
      expect(congregation.ETag).toBe('v0');
    });
  });

  // --- CORE ENGINE TESTS ---
  describe('applyBatchedChanges (Engine)', () => {
    it('should process multiple scopes, merge data correctly, and commit ETag LAST', async () => {
      await congregation.load();

      const batch: CongChange['changes'] = [
        {
          scope: 'settings',
          patch: { data_sync: { value: true, updatedAt: newTimestamp } },
        },
        {
          scope: 'persons',
          patch: {
            person_uid: 'p-new',
            person_firstname: { value: 'Jane', updatedAt: newTimestamp },
          },
        },
      ];

      await congregation.applyBatchedChanges(batch);

      const calls = (s3Service.uploadFile as Mock).mock.calls;

      // 1. Verify Data Integrity (The Merge)
      const settingsCall = calls.find((c) => c[0].endsWith('settings.json'));
      const settingsData = JSON.parse(settingsCall![1]);
      expect(settingsData.cong_name).toBe(
        mockData.congregations['settings.json'].cong_name
      ); // Preserved
      expect(settingsData.data_sync.value).toBe(
        batch[0].patch['data_sync']['value']
      ); // Updated

      const personsCall = calls.find((c) => c[0].endsWith('persons.json'));
      const personsData = JSON.parse(personsCall![1]);
      expect(personsData).toHaveLength(2); // Merged, not duplicated
      expect(personsData[0].person_uid).toBe('person-1'); // Preserved
      expect(personsData[1].person_uid).toBe('p-new'); // Appended

      // 2. Verify Mutation History
      const mutationCall = calls.find((c) => c[0].endsWith('mutations.json'));
      const mutationData = JSON.parse(mutationCall![1]);
      expect(mutationData[0].changes).toEqual(batch); // History recorded

      // 3. Verify Atomic Order (The "Commit")
      const lastCallPath = calls[calls.length - 1][0];
      expect(lastCallPath).toBe(`congregations/${congId}/`);

      // 4. Verify Version Bump
      expect(congregation.ETag).toBe('v1');
    });

    it('should use weekOf as identity and deep merge nested midweek data', async () => {
      await congregation.load();

      const patch: CongScheduleUpdate = {
        weekOf: '2026/01/05',
        midweek_meeting: {
          chairman: {
            main_hall: [
              { type: 'main', value: 'New Chairman', updatedAt: newTimestamp },
            ],
          },
        },
      };

      await congregation.applyBatchedChanges([{ scope: 'schedules', patch }]);

      const uploadCall = (s3Service.uploadFile as Mock).mock.calls.find((c) =>
        c[0].includes('schedules.json')
      );

      const data = JSON.parse(uploadCall![1]);

      // Verify deduplication
      expect(data.length).toBe(1);
      // Verify deep path update
      expect(data[0].midweek_meeting.chairman.main_hall[0].value).toBe(
        'New Chairman'
      );
    });

    it('should fail transaction and rollback state if upload fails (Commit Last)', async () => {
      await congregation.load();

      (s3Service.uploadFile as Mock).mockRejectedValueOnce(
        new Error('S3 Down')
      );

      await expect(
        congregation.applyCongSettingsPatch({
          data_sync: { value: true, updatedAt: newTimestamp },
        })
      ).rejects.toThrow('S3 Down');

      const calls = (s3Service.uploadFile as Mock).mock.calls;

      expect(
        calls.find((c) => c[0] === `congregations/${congId}/`)
      ).toBeUndefined();

      expect(congregation.ETag).toBe('v0'); // No version bump
    });

    it('should ignore stale updates based on updatedAt [2026-01-25]', async () => {
      await congregation.load();

      const stalePatch: CongSettingsUpdate = {
        data_sync: { value: true, updatedAt: '2020-01-01T00:00:00Z' },
      };

      await congregation.applyBatchedChanges([
        { scope: 'settings', patch: stalePatch },
      ]);

      expect(s3Service.uploadFile).not.toHaveBeenCalled();
      expect(congregation.ETag).toBe('v0');
    });

    it('should perform a deep merge that preserves nested structures not present in the patch', async () => {
      await congregation.load();
      // Mock has: midweek_meeting: { chairman: { main_hall: [...] } }

      const partialPatch: CongScheduleUpdate = {
        weekOf: '2026/01/05',
        midweek_meeting: {
          chairman: {
            aux_class_1: {
              type: 'main',
              value: 'Brother Jones',
              updatedAt: newTimestamp,
            },
          },
        },
      };

      await congregation.applyCongSchedulePatch(partialPatch as any);

      const upload = (s3Service.uploadFile as Mock).mock.calls.find((c) =>
        c[0].includes('schedules.json')
      );
      const data = JSON.parse(upload![1]);

      // 1. The new field is there
      expect(data[0].midweek_meeting.chairman.aux_class_1.value).toBe(
        'Brother Jones'
      );
      // 2. The CRITICAL check: The chairman (not in patch) was NOT deleted
      expect(data[0].midweek_meeting.chairman.main_hall).toBeDefined();
    });

    it('should initialize a new file if S3 returns null', async () => {
      (s3Service.getFile as Mock).mockResolvedValueOnce(null); // File doesn't exist yet

      await congregation.applyCongSourcePatch({
        weekOf: '2026/01/26',
        midweek_meeting: {
          event_name: [
            { type: 'main', value: 'event', updatedAt: newTimestamp },
          ],
        },
      });

      const upload = (s3Service.uploadFile as Mock).mock.calls.find((c) =>
        c[0].endsWith('sources.json')
      );

      expect(JSON.parse(upload![1])).toHaveLength(1);
    });
  });

  // --- CONVENIENCE WRAPPER TESTS ---
  describe('Convenience Wrappers (Plumbing)', () => {
    it('should route all scopes correctly to the engine', async () => {
      const spy = vi.spyOn(congregation, 'applyBatchedChanges');

      const wrappers = [
        {
          fn: 'applyCongSettingsPatch',
          scope: 'settings',
          patch: { data_sync: { value: true, updatedAt: newTimestamp } },
        },
        {
          fn: 'applyBranchCongAnalysisPatch',
          scope: 'branch_cong_analysis',
          patch: { report_date: '2026-01', updatedAt: newTimestamp },
        },
        {
          fn: 'applyPersonPatch',
          scope: 'persons',
          patch: { person_uid: 'p1', updatedAt: newTimestamp },
        },
        {
          fn: 'applyBranchFieldServiceReportPatch',
          scope: 'branch_field_service_reports',
          patch: { report_date: '2026-01', updatedAt: newTimestamp },
        },
        {
          fn: 'applyCongFieldServiceReportPatch',
          scope: 'cong_field_service_reports',
          patch: { report_id: 'r1', updatedAt: newTimestamp },
        },
        {
          fn: 'applyCongFieldServiceGroupPatch',
          scope: 'field_service_groups',
          patch: { group_id: 'g1', updatedAt: newTimestamp },
        },
        {
          fn: 'applyCongMeetingAttendancePatch',
          scope: 'meeting_attendance',
          patch: { month_date: '2026/01', updatedAt: newTimestamp },
        },
        {
          fn: 'applyCongSchedulePatch',
          scope: 'schedules',
          patch: { weekOf: '2026-01-05', updatedAt: newTimestamp },
        },
        {
          fn: 'applyCongSourcePatch',
          scope: 'sources',
          patch: { weekOf: '2026-01-05', updatedAt: newTimestamp },
        },
        {
          fn: 'applyCongSpeakerPatch',
          scope: 'speakers_congregations',
          patch: { id: 's1', updatedAt: newTimestamp },
        },
        {
          fn: 'applyCongUpcomingEventPatch',
          scope: 'upcoming_events',
          patch: { event_uid: 'e1', updatedAt: newTimestamp },
        },
      ];

      for (const item of wrappers) {
        await congregation[item.fn](item.patch);

        expect(spy).toHaveBeenCalledWith([
          { scope: item.scope, patch: item.patch },
        ]);
      }
    });
  });
});
