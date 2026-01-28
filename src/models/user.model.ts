import {
  UserChange,
  UserFieldServiceReport,
  UserFieldServiceReportsUpdate,
  UserBibleStudy,
  UserBibleStudiesUpdate,
  UserProfile,
  UserProfileClientUpdate,
  UserProfileServer,
  UserProfileServerUpdate,
  UserScope,
  UserSession,
  UserSettings,
  UserSettingsUpdate,
  UserPatchContext,
  DelegatedFieldServiceReportUpdate,
  DelegatedFieldServiceReport,
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
    patch: UserProfileServerUpdate
  ) {
    const merged: UserProfile = { ...current };

    let hasChanges = false;

    for (const [key, newVal] of Object.entries(patch)) {
      const k = key as keyof UserProfileServer;

      if (newVal !== undefined && merged[k] !== newVal) {
        Object.assign(merged, { [k]: newVal });
        hasChanges = true;
      }
    }

    return { merged, hasChanges };
  }

  private async saveComponent(fileName: string, data: unknown) {
    if (!data) return;

    try {
      const baseKey = `users/${this._id}/`;

      await s3Service.uploadFile(
        `${baseKey}${fileName}`,
        JSON.stringify(data),
        'application/json'
      );

      // update in-memory data
      if (fileName === 'profile.json') {
        this._profile = data as UserProfile;
      }

      if (fileName === 'settings.json') {
        this._settings = data as UserSettings;
      }

      if (fileName === 'sessions.json') {
        this._sessions = data as UserSession[];
      }

      if (fileName === 'flags.json') {
        this._flags = data as string[];
      }
    } catch (error) {
      logger.error(`Error saving ${fileName} for user ${this._id}:`, error);
      throw error;
    }
  }

  private async getStoredEtag() {
    try {
      const metadata = await s3Service.getObjectMetadata(`users/${this._id}/`);
      return metadata.etag || 'v0';
    } catch (error) {
      logger.error(`Error fetching stored ETag for user ${this._id}:`, error);
      return 'v0';
    }
  }

  private async saveWithHistory(
    recordedMutations: UserChange['changes'],
    scopes: { scope: UserScope; data: object }[]
  ): Promise<void> {
    try {
      const timestamp = new Date().toISOString();
      const currentVersion = parseInt(this._ETag.replace('v', ''), 10) || 0;
      const newEtag = `v${currentVersion + 1}`;

      // 1. Fetch current mutations
      const mutations = await this.fetchMutations();

      // 2. Add new mutation record with the *prospective* new ETag
      mutations.push({
        ETag: newEtag,
        timestamp,
        changes: recordedMutations,
      });

      // 3. Orchestrate parallel S3 uploads for data scopes + mutation log
      const uploadPromises: Promise<unknown>[] = [
        this.saveMutations(mutations),
      ];

      for (const entry of scopes) {
        const fileName = `${entry.scope}.json`;
        uploadPromises.push(this.saveComponent(fileName, entry.data));
      }

      // Wait for all data files to be saved
      await Promise.all(uploadPromises);

      // 4. "Commit" the transaction by updating the ETag in S3
      await s3Service.uploadFile(`users/${this._id}/`, '', 'text/plain', {
        etag: newEtag,
      });

      // 5. Finally, update the in-memory ETag
      this._ETag = newEtag;

      logger.info(
        `User ${this._id} update saved with ${recordedMutations.length} mutations across ${scopes.length} scopes. ETag committed: ${newEtag}`
      );
    } catch (error) {
      logger.error(
        `Error during saveWithHistory for user ${this._id}. Transaction failed.`,
        error
      );

      throw error;
    }
  }

  private async handleProfilePatch(
    patch: UserProfileClientUpdate,
    context: UserPatchContext
  ) {
    const { merged, hasChanges } = applyDeepSyncPatch(
      context.finalProfile,
      patch
    );
    if (hasChanges) {
      context.finalProfile = merged as UserProfile;
    }
    return { hasChanges, data: context.finalProfile };
  }

  private async handleSettingsPatch(
    patch: UserSettingsUpdate,
    context: UserPatchContext
  ) {
    const { merged, hasChanges } = applyDeepSyncPatch(
      context.finalSettings,
      patch
    );
    if (hasChanges) {
      context.finalSettings = merged as UserSettings;
    }
    return { hasChanges, data: context.finalSettings };
  }

  private async handleFieldServiceReportsPatch(
    patch: UserFieldServiceReportsUpdate,
    context: UserPatchContext
  ) {
    if (!context.finalFieldServiceReports) {
      context.finalFieldServiceReports = await this.getFieldServiceReports();
    }

    const reports = context.finalFieldServiceReports;
    const reportId = patch.report_date;

    if (!reportId) return { hasChanges: false, data: reports };

    const reportIndex = reports.findIndex((r) => r.report_date === reportId);
    const currentReport =
      reportIndex !== -1
        ? reports[reportIndex]
        : ({ report_date: reportId } as UserFieldServiceReport);

    const { merged, hasChanges } = applyDeepSyncPatch(currentReport, patch);

    if (hasChanges) {
      if (reportIndex !== -1) {
        reports[reportIndex] = merged as UserFieldServiceReport;
      } else {
        reports.push(merged as UserFieldServiceReport);
      }
    }

    return { hasChanges, data: reports };
  }

  private async handleBibleStudiesPatch(
    patch: UserBibleStudiesUpdate,
    context: UserPatchContext
  ) {
    if (!context.finalBibleStudies) {
      context.finalBibleStudies = await this.getBibleStudies();
    }

    const studies = context.finalBibleStudies;
    const personUid = patch.person_uid;

    if (!personUid) return { hasChanges: false, data: studies };

    const studyIndex = studies.findIndex((bs) => bs.person_uid === personUid);
    const currentStudy =
      studyIndex !== -1
        ? studies[studyIndex]
        : ({ person_uid: personUid } as UserBibleStudy);

    const { merged, hasChanges } = applyDeepSyncPatch(currentStudy, patch);

    if (hasChanges) {
      if (studyIndex !== -1) {
        studies[studyIndex] = merged as UserBibleStudy;
      } else {
        studies.push(merged as UserBibleStudy);
      }
    }

    return { hasChanges, data: studies };
  }

  private async handleDelegatedFieldServiceReportsPatch(
    patch: DelegatedFieldServiceReportUpdate,
    context: UserPatchContext
  ) {
    if (!context.finalDelegatedFieldServiceReports) {
      context.finalDelegatedFieldServiceReports =
        await this.getDelegatedFieldServiceReports();
    }

    const reports = context.finalDelegatedFieldServiceReports;
    const reportId = patch.report_id;

    if (!reportId) return { hasChanges: false, data: reports };

    const reportIndex = reports.findIndex((r) => r.report_id === reportId);
    const currentReport =
      reportIndex !== -1
        ? reports[reportIndex]
        : ({ report_id: reportId } as DelegatedFieldServiceReport);

    const { merged, hasChanges } = applyDeepSyncPatch(currentReport, patch);

    if (hasChanges) {
      if (reportIndex !== -1) {
        reports[reportIndex] = merged as DelegatedFieldServiceReport;
      } else {
        reports.push(merged as DelegatedFieldServiceReport);
      }
    }

    return { hasChanges, data: reports };
  }

  // --- Public Method ---

  public async load() {
    try {
      const baseKey = `users/${this._id}/`;

      const fetchFile = async (fileName: string) => {
        try {
          const content = await s3Service.getFile(`${baseKey}${fileName}`);
          return content ? JSON.parse(content) : null;
        } catch (error) {
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
    } catch (error) {
      logger.error(`Error loading user ${this._id}:`, error);
    }
  }

  public async applyProfilePatch(patch: UserProfileClientUpdate) {
    await this.applyBatchedChanges([{ scope: 'profile', patch }]);
  }

  public async applyServerProfilePatch(patch: UserProfileServerUpdate) {
    const baseProfile = this._profile || ({} as UserProfile);

    const { merged, hasChanges } = this.applyUserServerChange(
      baseProfile,
      patch
    );

    if (hasChanges) {
      try {
        await this.saveProfile(merged);

        logger.info(
          `Server profile patch applied for user ${this._id} (quiet)`
        );
      } catch (error) {
        throw error;
      }
    }
  }

  public async applySettingsPatch(patch: UserSettingsUpdate) {
    await this.applyBatchedChanges([{ scope: 'settings', patch: patch }]);
  }

  public async applyFieldServiceReportPatch(
    patch: UserFieldServiceReportsUpdate
  ) {
    return this.applyBatchedChanges([
      { scope: 'field_service_reports', patch },
    ]);
  }

  public async applyBibleStudyPatch(patch: UserBibleStudiesUpdate) {
    return this.applyBatchedChanges([{ scope: 'bible_studies', patch }]);
  }

  public async applyDelegatedFieldServiceReporPatch(
    patch: DelegatedFieldServiceReportUpdate
  ) {
    return this.applyBatchedChanges([
      { scope: 'delegated_field_service_reports', patch },
    ]);
  }

  public async saveProfile(profile: UserProfile) {
    await this.saveComponent('profile.json', profile);
  }

  public async saveSettings(settings: UserSettings) {
    await this.saveComponent('settings.json', settings);
  }

  public async saveSessions(sessions: UserSession) {
    await this.saveComponent('sessions.json', sessions);
  }

  public async saveFlags(flags: string[]) {
    await this.saveComponent('flags.json', flags);
  }

  public async saveFieldServiceReports(reports: UserFieldServiceReport[]) {
    await this.saveComponent('field_service_reports.json', reports);
  }

  public async saveBibleStudies(bibleStudies: UserBibleStudy[]) {
    await this.saveComponent('bible_studies.json', bibleStudies);
  }

  public async saveDelegatedFieldServiceReports(
    reports: DelegatedFieldServiceReport[]
  ) {
    await this.saveComponent('delegated_field_service_reports.json', reports);
  }

  public async updateFlags(flags: string[]) {
    await this.saveFlags(flags);
  }

  public async saveMutations(changes: UserChange[]) {
    await this.saveComponent('mutations.json', changes);
  }

  public async fetchMutations(): Promise<UserChange[]> {
    try {
      const key = `users/${this._id}/mutations.json`;
      const content = await s3Service.getFile(key);

      if (content) {
        const mutations: UserChange[] = JSON.parse(content);

        const { pruned, hasChanged } = this.cleanupMutations(mutations);
        if (hasChanged) {
          await this.saveMutations(pruned);
          return pruned;
        }
        return mutations;
      }
    } catch (error) {
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

  public async getBibleStudies(): Promise<UserBibleStudy[]> {
    try {
      const key = `users/${this._id}/bible_studies.json`;
      const content = await s3Service.getFile(key);
      return content ? JSON.parse(content) : [];
    } catch (error) {
      logger.error(`Error fetching bible studies for user ${this._id}:`, error);
      return [];
    }
  }

  public async getDelegatedFieldServiceReports(): Promise<
    DelegatedFieldServiceReport[]
  > {
    try {
      const key = `users/${this._id}/delegated_field_service_reports.json`;

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
      type ScopeData =
        | UserProfile
        | UserSettings
        | UserFieldServiceReport[]
        | UserBibleStudy[]
        | DelegatedFieldServiceReport[];

      const recordedMutations: UserChange['changes'] = [];

      const scopesToSave = new Map<UserScope, ScopeData>();

      const context: UserPatchContext = {
        finalProfile: this._profile || ({} as UserProfile),
        finalSettings: this._settings || ({} as UserSettings),
        finalFieldServiceReports: undefined,
        finalBibleStudies: undefined,
        finalDelegatedFieldServiceReports: undefined,
      };

      for (const change of changes) {
        let result: { hasChanges: boolean; data: ScopeData } | undefined;

        switch (change.scope) {
          case 'profile':
            result = await this.handleProfilePatch(
              change.patch as UserProfileClientUpdate,
              context
            );
            break;
          case 'settings':
            result = await this.handleSettingsPatch(
              change.patch as UserSettingsUpdate,
              context
            );
            break;
          case 'field_service_reports':
            result = await this.handleFieldServiceReportsPatch(
              change.patch,
              context
            );
            break;
          case 'bible_studies':
            result = await this.handleBibleStudiesPatch(change.patch, context);
            break;
          case 'delegated_field_service_reports':
            result = await this.handleDelegatedFieldServiceReportsPatch(
              change.patch,
              context
            );
            break;
        }

        if (result && result.hasChanges) {
          recordedMutations.push(change);
          scopesToSave.set(change.scope, result.data);
        }
      }

      if (recordedMutations.length > 0) {
        const finalScopes = Array.from(scopesToSave.entries()).map(
          ([scope, data]) => ({ scope, data })
        );

        await this.saveWithHistory(recordedMutations, finalScopes);

        logger.info(
          `Successfully applied batch: ${recordedMutations.length} mutations for user ${this._id}`
        );
      } else {
        logger.info(`No changes to apply from batch for user ${this._id}`);
      }
    } catch (error) {
      logger.error(`Error applying batched changes for ${this._id}:`, error);
      throw error;
    }
  }
}
