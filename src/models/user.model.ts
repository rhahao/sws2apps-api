import {
  UserChange,
  UserFieldServiceReport,
  UserFieldServiceReportsUpdate,
  UserProfile,
  UserProfileClientMutable,
  UserProfileClientUpdate,
  UserProfileServer,
  UserProfileServerUpdate,
  UserScope,
  UserSession,
  UserSettings,
} from '../types/index.js';
import { s3Service } from '../services/s3.service.js';
import { logger } from '../utils/index.js';
import { applyDeepSyncPatch } from '../utils/index.js';

export class User {
  private _id: string;
  private _email?: string;
  private _auth_provider?: string;
  private _profile?: UserProfile;
  private _sessions?: UserSession[];
  private _settings?: UserSettings;
  private _flags?: string[];
  private _ETag: string = 'v0';

  constructor(id: string) {
    this._id = id;
  }

  // --- getters ---

  get id() {
    return this._id;
  }

  get email() {
    return this._email;
  }

  get auth_provider() {
    return this._auth_provider;
  }

  get profile() {
    return this._profile;
  }

  get sessions() {
    return this._sessions;
  }

  get settings() {
    return this._settings;
  }

  get flags() {
    return this._flags;
  }

  get ETag() {
    return this._ETag;
  }

  // --- Private Method ---

  private applyUserServerChange(
    current: UserProfile,
    patch: Partial<UserProfileServer>
  ): { merged: UserProfile; hasChanges: boolean } {
    const merged: UserProfile = { ...current };
    let hasChanges = false;

    const patchKeys = Object.keys(patch) as Array<keyof UserProfileServer>;

    for (const key of patchKeys) {
      const newVal = patch[key];

      if (newVal !== undefined && newVal !== merged[key]) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (merged as any)[key] = newVal;

        hasChanges = true;
      }
    }

    return { merged, hasChanges };
  }

  private async _saveComponent(fileName: string, data: unknown) {
    if (!data) return;
    try {
      const baseKey = `users/${this._id}/`;

      await s3Service.uploadFile(
        `${baseKey}${fileName}`,
        JSON.stringify(data),
        'application/json'
      );
    } catch (error: unknown) {
      logger.error(`Error saving ${fileName} for user ${this._id}:`, error);
      throw error;
    }
  }

  private async getStoredEtag() {
    try {
      const metadata = await s3Service.getObjectMetadata(`users/${this._id}/`);
      return metadata.etag || 'v0';
    } catch (error: unknown) {
      logger.error(`Error fetching stored ETag for user ${this._id}:`, error);
      return 'v0';
    }
  }

  private async bumpETag() {
    try {
      const currentVersion = parseInt(this._ETag.replace('v', ''), 10) || 0;
      const newEtag = `v${currentVersion + 1}`;

      await s3Service.uploadFile(`users/${this._id}/`, '', 'text/plain', {
        etag: newEtag,
      });

      this._ETag = newEtag;
      logger.info(`User ${this._id} ETag bumped to ${newEtag}`);
      return newEtag;
    } catch (error: unknown) {
      logger.error(`Error bumping ETag for user ${this._id}:`, error);
      throw error;
    }
  }

  private async saveWithHistory(
    recordedMutations: UserChange['changes'],
    scopes: { scope: UserScope; data: object }[]
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
        `User ${this._id} update saved with ${recordedMutations.length} mutations across ${scopes.length} scopes and ETag ${newEtag}`
      );
    } catch (error: unknown) {
      logger.error(`Error during saveWithHistory for user ${this._id}:`, error);
      throw error;
    }
  }

  // --- Public Method ---

  public async load() {
    try {
      const baseKey = `users/${this._id}/`;

      const fetchFile = async (fileName: string) => {
        try {
          const content = await s3Service.getFile(`${baseKey}${fileName}`);
          return content ? JSON.parse(content) : null;
        } catch (error: unknown) {
          logger.error(
            `Error loading user ${this._id} file ${fileName}:`,
            error
          );
        }
      };

      const [profileData, settingsData, sessionsData, flagsData, etag] =
        await Promise.all([
          fetchFile('profile.json'),
          fetchFile('settings.json'),
          fetchFile('sessions.json'),
          fetchFile('flags.json'),
          this.getStoredEtag(),
        ]);

      if (profileData) {
        this._profile = profileData;
      }

      if (settingsData) {
        this._settings = settingsData;
      }

      if (sessionsData) {
        this._sessions = sessionsData;
      }

      if (flagsData) {
        this._flags = flagsData;
      }

      this._ETag = etag;
    } catch (error: unknown) {
      logger.error(`Error loading user ${this._id}:`, error);
    }
  }

  public async applyProfilePatch(patch: UserProfileClientUpdate) {
    await this.applyBatchedChanges([{ scope: 'profile', patch }]);
  }

  public async applyServerProfilePatch(patch: UserProfileServerUpdate) {
    const baseProfile = this._profile || ({} as UserProfile);

    // Overlay administrative fields (quiet)
    const { merged, hasChanges } = this.applyUserServerChange(
      baseProfile,
      patch
    );

    if (hasChanges) {
      const oldProfile = this._profile;
      this._profile = merged;

      try {
        await this.saveProfile();

        logger.info(
          `Server profile patch applied for user ${this._id} (quiet)`
        );
      } catch (error: unknown) {
        this._profile = oldProfile;
        throw error;
      }
    }
  }

  public async applySettingsPatch(patch: Partial<UserSettings>) {
    await this.applyBatchedChanges([{ scope: 'settings', patch: patch }]);
  }

  public async applyFieldServiceReportPatch(
    patch: UserFieldServiceReportsUpdate
  ) {
    return this.applyBatchedChanges([
      { scope: 'field_service_reports', patch },
    ]);
  }

  public async saveProfile() {
    await this._saveComponent('profile.json', this._profile);
  }

  public async saveSettings() {
    await this._saveComponent('settings.json', this._settings);
  }

  public async saveSessions() {
    await this._saveComponent('sessions.json', this._sessions);
  }

  public async saveFlags() {
    await this._saveComponent('flags.json', this._flags);
  }

  public async saveFieldServiceReports(reports: UserFieldServiceReport[]) {
    await this._saveComponent('field_service_reports.json', reports);
  }

  public async updateFlags(flags: string[]) {
    await this.saveFlags();
    this._flags = flags;
  }

  public async saveMutations(changes: UserChange[]) {
    await this._saveComponent('mutations.json', changes);
  }

  public async fetchMutations(): Promise<UserChange[]> {
    try {
      const key = `users/${this._id}/mutations.json`;
      const content = await s3Service.getFile(key);

      if (content) {
        const mutations: UserChange[] = JSON.parse(content);

        // Perform on-demand cleanup
        const { pruned, hasChanged } = this.cleanupMutations(mutations);
        if (hasChanged) {
          // Synchronously wait for the save to ensure data consistency
          await this.saveMutations(pruned);
          return pruned;
        }
        return mutations;
      }
    } catch (error: unknown) {
      logger.error(`Error fetching mutations for user ${this._id}:`, error);
    }
    return [];
  }

  public async getFieldServiceReports(): Promise<UserFieldServiceReport[]> {
    try {
      const key = `users/${this._id}/field_service_reports.json`;
      const content = await s3Service.getFile(key);
      return content ? JSON.parse(content) : [];
    } catch (error) {
      logger.error(
        `Error fetching field service reports for user ${this._id}:`,
        error
      );
      return [];
    }
  }

  public cleanupMutations(
    changes: UserChange[],
    cutoffDate?: Date
  ): { pruned: UserChange[]; hasChanged: boolean } {
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

  public cleanupSessions(cutoffDate?: Date): boolean {
    if (!this._sessions || this._sessions.length === 0) return false;

    const cutoffTime =
      cutoffDate?.getTime() || new Date().setMonth(new Date().getMonth() - 6);

    const initialLength = this._sessions.length;

    this._sessions = this._sessions.filter((session) => {
      const lastSeenTime = new Date(session.last_seen).getTime();
      return lastSeenTime >= cutoffTime;
    });

    return this._sessions.length < initialLength;
  }

  public async applyBatchedChanges(changes: UserChange['changes']) {
    try {
      const recordedMutations: UserChange['changes'] = [];

      const scopesToSave: { scope: UserScope; data: object }[] = [];

      let finalProfile: UserProfile | undefined;
      let finalSettings: UserSettings | undefined;
      let finalFieldServiceReports: UserFieldServiceReport[] | undefined;

      let hasGlobalChanges = false;

      for (const change of changes) {
        // --- PROFILE SCOPE ---
        if (change.scope === 'profile') {
          if (!finalProfile)
            finalProfile = this._profile || ({} as UserProfile);

          const patch = change.patch as Partial<UserProfileClientMutable>;

          const { merged, hasChanges } = applyDeepSyncPatch(
            finalProfile,
            patch
          );

          if (hasChanges) {
            finalProfile = merged as UserProfile;
            recordedMutations.push({ scope: 'profile', patch: patch });
            hasGlobalChanges = true;
          }
        }

        // --- SETTINGS SCOPE ---
        if (change.scope === 'settings') {
          if (!finalSettings) {
            finalSettings = this._settings || ({} as UserSettings);
          }

          const { merged, hasChanges } = applyDeepSyncPatch(
            finalSettings,
            change.patch as Partial<UserSettings>
          );

          if (hasChanges) {
            finalSettings = merged as UserSettings;
            recordedMutations.push({ scope: 'settings', patch: change.patch });
            hasGlobalChanges = true;
          }
        }

        // --- FIELD SERVICE REPORTS SCOPE ---
        if (change.scope === 'field_service_reports') {
          if (!finalFieldServiceReports)
            finalFieldServiceReports = await this.getFieldServiceReports();

          const patch = change.patch;
          const reportId = patch.report_date;

          if (!reportId) continue;

          const reportIndex = finalFieldServiceReports.findIndex(
            (r) => r.report_date === reportId
          );

          let currentReport: Partial<UserFieldServiceReport>;

          if (reportIndex !== -1) {
            currentReport = finalFieldServiceReports[reportIndex];
          } else {
            currentReport = {
              report_date: reportId,
            } as Partial<UserFieldServiceReport>;
          }

          const { merged, hasChanges } = applyDeepSyncPatch(
            currentReport,
            patch
          );

          if (hasChanges) {
            if (reportIndex !== -1) {
              finalFieldServiceReports[reportIndex] =
                merged as UserFieldServiceReport;
            } else {
              finalFieldServiceReports.push(merged as UserFieldServiceReport);
            }

            recordedMutations.push({ scope: 'field_service_reports', patch });
            hasGlobalChanges = true;
          }
        }
      }

      if (hasGlobalChanges) {
        // Aggregate final data for all modified scopes
        if (finalProfile) {
          scopesToSave.push({ scope: 'profile', data: finalProfile });
          this._profile = finalProfile; // Update internal state
        }
        if (finalSettings) {
          scopesToSave.push({ scope: 'settings', data: finalSettings });
          this._settings = finalSettings; // Update internal state
        }

        if (finalFieldServiceReports) {
          scopesToSave.push({
            scope: 'field_service_reports',
            data: finalFieldServiceReports,
          });
        }

        // Pass structured payload to orchestrator
        await this.saveWithHistory(recordedMutations, scopesToSave);

        logger.info(
          `Successfully applied batch: ${recordedMutations.length} mutations for user ${this._id}`
        );
      } else {
        logger.info(`No changes to apply from batch for user ${this._id}`);
      }
    } catch (error: unknown) {
      logger.error(`Error applying batched changes for ${this._id}:`, error);
      throw error;
    }
  }
}
