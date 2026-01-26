import {
  CongregationChange,
  CongregationPerson,
  CongregationPersonUpdate,
  CongregationScope,
  CongregationSettings,
  CongregationSettingsServer,
  CongregationSettingsServerUpdate,
} from '../types/index.js';
import { s3Service } from '../services/index.js';
import { applyDeepSyncPatch, logger } from '../utils/index.js';

export class Congregation {
  private _id: string;
  private _flags: string[] = [];
  private _ETag: string = 'v0';
  private _settings = {} as CongregationSettings;

  constructor(id: string) {
    this._id = id;
  }

  get id(): string {
    return this._id;
  }

  get flags(): string[] {
    return this._flags;
  }

  get ETag() {
    return this._ETag;
  }

  get settings() {
    return this._settings;
  }

  // --- Private Method ---

  private applyCongregationServerChange(
    current: CongregationSettings,
    patch: CongregationSettingsServerUpdate
  ) {
    const merged: CongregationSettings = { ...current };

    let hasChanges = false;

    // Entries gives you the key and value together
    for (const [key, newVal] of Object.entries(patch)) {
      const k = key as keyof CongregationSettingsServer;

      if (newVal !== undefined && merged[k] !== newVal) {
        // We still need a narrow cast for assignment, but we avoid 'any'
        Object.assign(merged, { [k]: newVal });
        hasChanges = true;
      }
    }

    return { merged, hasChanges };
  }

  private async _saveComponent(fileName: string, data: unknown) {
    if (!data) return;
    try {
      const baseKey = `congregations/${this._id}/`;

      await s3Service.uploadFile(
        `${baseKey}${fileName}`,
        JSON.stringify(data),
        'application/json'
      );
    } catch (error: unknown) {
      logger.error(
        `Error saving component ${fileName} for congregation ${this._id}:`,
        error
      );
      throw error;
    }
  }

  private async getStoredEtag() {
    try {
      const metadata = await s3Service.getObjectMetadata(
        `congregations/${this._id}/`
      );

      return metadata.etag || 'v0';
    } catch (error: unknown) {
      logger.error(
        `Error fetching stored ETag for congregation ${this._id}:`,
        error
      );

      return 'v0';
    }
  }

  private async bumpETag() {
    try {
      const currentVersion = parseInt(this._ETag.replace('v', ''), 10) || 0;
      const newEtag = `v${currentVersion + 1}`;

      await s3Service.uploadFile(
        `congregations/${this._id}/`,
        '',
        'text/plain',
        {
          etag: newEtag,
        }
      );

      this._ETag = newEtag;
      logger.info(`Congregation ${this._id} ETag bumped to ${newEtag}`);
      return newEtag;
    } catch (error: unknown) {
      logger.error(`Error bumping ETag for congregation ${this._id}:`, error);
      throw error;
    }
  }

  private async saveWithHistory(
    recordedMutations: CongregationChange['changes'],
    scopes: { scope: CongregationScope; data: object }[]
  ): Promise<void> {
    try {
      const timestamp = new Date().toISOString();

      // 1. Fetch current mutations
      const mutations = await this.fetchMutations();

      // 2. Determine and sync new ETag
      const newEtag = await this.bumpETag();

      // 3. Log mutations with the fresh ETag
      mutations.push({
        ETag: newEtag,
        timestamp,
        changes: recordedMutations,
      });

      // 4. Orchestrate parallel S3 uploads (Data Scopes + Mutation Log)
      const uploadPromises: Promise<unknown>[] = [
        this.saveMutations(mutations),
      ];

      for (const entry of scopes) {
        const fileName = `${entry.scope}.json`;
        uploadPromises.push(this._saveComponent(fileName, entry.data));
      }

      await Promise.all(uploadPromises);

      logger.info(
        `Congregation ${this._id} update saved with ${recordedMutations.length} mutations across ${scopes.length} scopes and ETag ${newEtag}`
      );
    } catch (error: unknown) {
      logger.error(
        `Error during saveWithHistory for congregation ${this._id}:`,
        error
      );
      throw error;
    }
  }

  // --- Public Method ---

  public async load() {
    try {
      const baseKey = `congregations/${this._id}/`;

      const fetchFile = async (fileName: string) => {
        try {
          const content = await s3Service.getFile(`${baseKey}${fileName}`);
          return content ? JSON.parse(content) : null;
        } catch (error: unknown) {
          logger.error(
            `Error loading congregation ${this._id} file ${fileName}:`,
            error
          );
        }
      };

      const [settingsData, flagsData, etag] = await Promise.all([
        fetchFile('settings.json'),
        fetchFile('flags.json'),
        this.getStoredEtag(),
      ]);

      if (settingsData) {
        this._settings = settingsData;
      }

      if (flagsData) {
        this._flags = flagsData;
      }

      this._ETag = etag;
    } catch (error: unknown) {
      logger.error(`Error loading congregation ${this._id}:`, error);
    }
  }

  public async saveFlags(flags: string[]) {
    try {
      const key = `congregations/${this.id}/flags.json`;
      await s3Service.uploadFile(
        key,
        JSON.stringify(flags),
        'application/json'
      );
      this._flags = flags;
      logger.info(`Updated flags for congregation ${this.id}`);
    } catch (error: unknown) {
      logger.error(`Error saving flags for congregation ${this.id}:`, error);
      throw error;
    }
  }

  public async getPersons(): Promise<CongregationPerson[]> {
    try {
      const content = await s3Service.getFile(
        `congregations/${this._id}/persons.json`
      );

      return content ? JSON.parse(content) : [];
    } catch (error: unknown) {
      logger.error(`Error loading congregation ${this._id} persons:`, error);
      return [];
    }
  }

  public async savePersons(persons: CongregationPerson[]) {
    try {
      await this._saveComponent('persons.json', persons);
      await this.bumpETag();
      logger.info(
        `Saved ${persons.length} persons and bumped ETag for congregation ${this._id}`
      );
    } catch (error: unknown) {
      logger.error(`Error saving persons for congregation ${this._id}:`, error);
      throw error;
    }
  }

  public async saveMutations(changes: CongregationChange[]) {
    await this._saveComponent('mutations.json', changes);
  }

  public async fetchMutations(): Promise<CongregationChange[]> {
    try {
      const key = `congregations/${this._id}/mutations.json`;
      const content = await s3Service.getFile(key);

      if (content) {
        const mutations: CongregationChange[] = JSON.parse(content);

        // Perform on-demand cleanup
        const { pruned, hasChanged } = this.cleanupMutations(mutations);
        if (hasChanged) {
          await this.saveMutations(pruned);
          return pruned;
        }
        return mutations;
      }
    } catch (error: unknown) {
      logger.error(
        `Error fetching mutations for congregation ${this._id}:`,
        error
      );
    }
    return [];
  }

  public cleanupMutations(
    changes: CongregationChange[],
    cutoffDate?: Date
  ): { pruned: CongregationChange[]; hasChanged: boolean } {
    if (!changes || changes.length === 0) {
      return { pruned: [], hasChanged: false };
    }

    // Use provided date or default to 6 months ago
    const cutoffTime =
      cutoffDate?.getTime() || new Date().setMonth(new Date().getMonth() - 6);

    const initialLength = changes.length;

    const pruned = changes.filter((change) => {
      const changeTime = new Date(change.timestamp).getTime();
      return changeTime >= cutoffTime;
    });

    return { pruned, hasChanged: pruned.length < initialLength };
  }

  public async applyBatchedChanges(changes: CongregationChange['changes']) {
    try {
      const recordedMutations: CongregationChange['changes'] = [];
      const scopesToSave: { scope: CongregationScope; data: object }[] = [];

      let finalPersons: CongregationPerson[] | undefined;
      let finalSettings = this._settings || {};

      let hasGlobalChanges = false;

      for (const change of changes) {
        // --- PERSONS SCOPE ---
        if (change.scope === 'persons') {
          if (!finalPersons) finalPersons = await this.getPersons();

          const patch = change.patch;
          const personUid = patch.person_uid;

          if (!personUid) continue;

          const personIndex = finalPersons.findIndex(
            (p) => p.person_uid === personUid
          );
          let currentPerson: Partial<CongregationPerson>;

          if (personIndex !== -1) {
            currentPerson = finalPersons[personIndex];
          } else {
            currentPerson = {
              person_uid: personUid,
            } as Partial<CongregationPerson>;
          }

          const { merged, hasChanges } = applyDeepSyncPatch(
            currentPerson,
            patch
          );

          if (hasChanges) {
            if (personIndex !== -1) {
              finalPersons[personIndex] = merged as CongregationPerson;
            } else {
              finalPersons.push(merged as CongregationPerson);
            }
            recordedMutations.push({ scope: 'persons', patch });
            hasGlobalChanges = true;
          }
        }

        // --- SETTINGS SCOPE ---
        if (change.scope === 'settings') {
          const { merged, hasChanges } = applyDeepSyncPatch(
            finalSettings,
            change.patch
          );

          if (hasChanges) {
            finalSettings = merged as CongregationSettings;
            recordedMutations.push({ scope: 'settings', patch: change.patch });
            hasGlobalChanges = true;
          }
        }
      }

      if (hasGlobalChanges) {
        // Aggregate final data for all modified scopes
        if (finalPersons) {
          scopesToSave.push({ scope: 'persons', data: finalPersons });
        }
        if (finalSettings) {
          scopesToSave.push({ scope: 'settings', data: finalSettings });
        }

        // Pass structured payload to orchestrator
        await this.saveWithHistory(recordedMutations, scopesToSave);

        logger.info(
          `Successfully applied batch: ${recordedMutations.length} mutations for congregation ${this._id}`
        );
      } else {
        logger.info(
          `No changes to apply from batch for congregation ${this._id}`
        );
      }
    } catch (error: unknown) {
      logger.error(`Error applying batched changes for ${this._id}:`, error);
      throw error;
    }
  }

  public async applyPersonPatch(patch: CongregationPersonUpdate) {
    return this.applyBatchedChanges([{ scope: 'persons', patch }]);
  }

  public async applyServerSettingsPatch(
    patch: CongregationSettingsServerUpdate
  ) {
    const baseSettings = this._settings || {};

    const { merged, hasChanges } = this.applyCongregationServerChange(
      baseSettings,
      patch
    );

    if (hasChanges) {
      const oldSettings = this._settings;
      this._settings = merged as CongregationSettings;

      try {
        await this._saveComponent('settings.json', this._settings);

        logger.info(
          `Server settings patch applied for congregation ${this._id} (quiet)`
        );
      } catch (error: unknown) {
        this._settings = oldSettings;
        throw error;
      }
    }
  }
}
