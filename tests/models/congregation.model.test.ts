import { beforeEach, describe, expect, it, Mock, vi } from 'vitest';
import type API from '../../src/types/index.js';
import { Congregation } from '../../src/models/congregation.model.js';
import Storage from '../../src/storages/index.js';
import mockData from '../mocks/data.json' with { type: 'json' };

vi.mock('../../src/config/index.js');
vi.mock('../../src/storages/index.js');
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

describe('Congregation Model', () => {
  let congregation: Congregation;
  const congId = 'test-cong-id';
  const newTimestamp = new Date().toISOString();

  beforeEach(() => {
    congregation = new Congregation(congId);
    vi.clearAllMocks();

    // Set up mock implementations for each test run
    (Storage.Congregations.getSettings as Mock).mockResolvedValue(
      JSON.parse(JSON.stringify(mockData.congregations['settings.json']))
    );
    (Storage.Congregations.getETag as Mock).mockResolvedValue('v0');
    (Storage.Congregations.getMutations as Mock).mockResolvedValue([]);
    (Storage.Congregations.getPersons as Mock).mockResolvedValue(
      JSON.parse(JSON.stringify(mockData.congregations['persons.json']))
    );
    (Storage.Congregations.getSchedules as Mock).mockResolvedValue(
      JSON.parse(JSON.stringify(mockData.congregations['schedules.json']))
    );
    (Storage.Congregations.getVisitingSpeakers as Mock).mockResolvedValue([]);
  });

  it('should load settings and ETag correctly', async () => {
    await congregation.load();
    expect(Storage.Congregations.getSettings).toHaveBeenCalledWith(congId);
    expect(Storage.Congregations.getETag).toHaveBeenCalledWith(congId);
    expect(congregation.settings.cong_name).toBe(
      mockData.congregations['settings.json'].cong_name
    );
    expect(congregation.ETag).toBe('v0');
  });

  it('should apply server settings patch quietly', async () => {
    await congregation.load();
    const serverPatch: API.CongSettingsServerUpdate = { cong_name: 'New Name' };
    await congregation.applyServerSettingsPatch(serverPatch);
    expect(Storage.Congregations.saveSettings).toHaveBeenCalledWith(
      congId,
      expect.objectContaining({ cong_name: 'New Name' })
    );
    expect(Storage.Congregations.updateETag).not.toHaveBeenCalled();
  });

  it('should process batched changes, save data, and commit ETag last', async () => {
    await congregation.load();
    const batch: API.CongChange['changes'] = [
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

    expect(Storage.Congregations.saveSettings).toHaveBeenCalled();
    expect(Storage.Congregations.savePersons).toHaveBeenCalled();
    expect(Storage.Congregations.saveMutations).toHaveBeenCalled();
    expect(Storage.Congregations.updateETag).toHaveBeenCalledWith(congId, 'v1');
    expect(congregation.ETag).toBe('v1');

    const updateETagOrder = (Storage.Congregations.updateETag as Mock).mock
      .invocationCallOrder[0];
    const saveSettingsOrder = (Storage.Congregations.saveSettings as Mock).mock
      .invocationCallOrder[0];

    expect(updateETagOrder).toBeGreaterThan(saveSettingsOrder);
  });

  it('should handle a new visiting speaker patch', async () => {
    await congregation.load();
    const patch: API.CongVisitingSpeakerUpdate = {
      person_uid: 'p-new',
      person_firstname: { value: 'John Speaker', updatedAt: newTimestamp },
    };

    await congregation.applyBatchedChanges([
      { scope: 'visiting_speakers', patch },
    ]);

    expect(Storage.Congregations.saveVisitingSpeakers).toHaveBeenCalledWith(
      congId,
      [expect.objectContaining({ person_uid: 'p-new' })]
    );
    expect(congregation.ETag).toBe('v1');
  });

  it('should not save if patch is stale (no changes)', async () => {
    await congregation.load();

    const stalePatch: API.CongSettingsUpdate = {
      data_sync: { value: true, updatedAt: '2020-01-01T00:00:00Z' },
    };
    await congregation.applyCongSettingsPatch(stalePatch);

    expect(Storage.Congregations.saveSettings).not.toHaveBeenCalled();
    expect(Storage.Congregations.updateETag).not.toHaveBeenCalled();
    expect(congregation.ETag).toBe('v0');
  });
});
