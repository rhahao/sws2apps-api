import type API from '../types/index.js';
import Service from '../services/index.js';
import Storage from '../storages/index.js';
import Utility from '../utils/index.js';

export class User {
  private _id: string;
  private _email?: string;
  private _auth_provider?: string;
  private _profile = {} as API.UserProfile;
  private _sessions: API.UserSession[] = [];
  private _settings = {} as API.UserSettings;
  private _ETag = 'v0';

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

  get ETag() {
    return this._ETag;
  }

  // --- Private Method ---
  private applyUserServerChange(
    current: API.UserProfile,
    patch: API.UserProfileServerUpdate
  ) {
    const merged: API.UserProfile = { ...current };

    let hasChanges = false;

    for (const [key, newVal] of Object.entries(patch)) {
      const k = key as keyof API.UserProfileServer;

      if (newVal !== undefined && merged[k] !== newVal) {
        Object.assign(merged, { [k]: newVal });
        hasChanges = true;
      }
    }

    return { merged, hasChanges };
  }

  private async saveWithHistory(
    recordedMutations: API.UserChange['changes'],
    scopes: { scope: API.UserScope; data: object }[]
  ): Promise<void> {
    try {
      const timestamp = new Date().toISOString();
      const currentVersion = parseInt(this._ETag.replace('v', ''), 10) || 0;
      const newEtag = `v${currentVersion + 1}`;

      // 1. Fetch current mutations
      const mutations = await this.getMutations();

      // 2. Add new mutation record
      mutations.push({ ETag: newEtag, timestamp, changes: recordedMutations });

      // 3. Define scope → save function map
      const scopeHandlers: Record<
        API.UserScope,
        (data: object) => Promise<unknown>
      > = {
        bible_studies: (data) =>
          Storage.Users.saveBibleStudies(
            this._id,
            data as API.UserBibleStudy[]
          ),
        delegated_field_service_reports: (data) =>
          Storage.Users.saveDelegatedFieldServiceReports(
            this._id,
            data as API.DelegatedFieldServiceReport[]
          ),
        field_service_reports: (data) =>
          Storage.Users.saveFieldServiceReports(
            this._id,
            data as API.UserFieldServiceReport[]
          ),
        profile: (data) => this.saveProfile(data as API.UserProfile),
        settings: (data) => this.saveSettings(data as API.UserSettings),
      };

      // 4. Orchestrate parallel uploads
      const uploadPromises: Promise<unknown>[] = [
        Storage.Users.saveMutations(this._id, mutations),
        ...scopes.map((entry) => scopeHandlers[entry.scope]?.(entry.data)),
      ].filter(Boolean);

      await Promise.all(uploadPromises);

      // 5. Commit new ETag
      await Storage.Users.updateETag(this._id, newEtag);
      this._ETag = newEtag;

      Utility.Logger.info(
        `User ${this._id} update saved with ${recordedMutations.length} mutations across ${scopes.length} scopes. ETag committed: ${newEtag}`
      );
    } catch (error) {
      Utility.Logger.error(
        `Error during saveWithHistory for user ${this._id}. Transaction failed.`,
        error
      );
      throw error;
    }
  }

  private async handleProfilePatch(
    patch: API.UserProfileClientUpdate,
    context: API.UserPatchContext
  ) {
    const { merged, hasChanges } = Utility.Sync.deepMerge(
      context.finalProfile,
      patch
    );
    if (hasChanges) {
      context.finalProfile = merged as API.UserProfile;
    }
    return { hasChanges, data: context.finalProfile };
  }

  private async handleSettingsPatch(
    patch: API.UserSettingsUpdate,
    context: API.UserPatchContext
  ) {
    const { merged, hasChanges } = Utility.Sync.deepMerge(
      context.finalSettings,
      patch
    );
    if (hasChanges) {
      context.finalSettings = merged as API.UserSettings;
    }
    return { hasChanges, data: context.finalSettings };
  }

  private async handleFieldServiceReportsPatch(
    patch: API.UserFieldServiceReportsUpdate,
    context: API.UserPatchContext
  ) {
    if (!context.finalFieldServiceReports) {
      context.finalFieldServiceReports =
        await Storage.Users.getFieldServiceReports(this._id);
    }

    const reports = context.finalFieldServiceReports;
    const reportId = patch.report_date;

    if (!reportId) return { hasChanges: false, data: reports };

    const reportIndex = reports.findIndex((r) => r.report_date === reportId);
    const currentReport =
      reportIndex !== -1
        ? reports[reportIndex]
        : ({ report_date: reportId } as API.UserFieldServiceReport);

    const { merged, hasChanges } = Utility.Sync.deepMerge(currentReport, patch);

    if (hasChanges) {
      if (reportIndex !== -1) {
        reports[reportIndex] = merged as API.UserFieldServiceReport;
      } else {
        reports.push(merged as API.UserFieldServiceReport);
      }
    }

    return { hasChanges, data: reports };
  }

  private async handleBibleStudiesPatch(
    patch: API.UserBibleStudiesUpdate,
    context: API.UserPatchContext
  ) {
    if (!context.finalBibleStudies) {
      context.finalBibleStudies = await Storage.Users.getBibleStudies(this._id);
    }

    const studies = context.finalBibleStudies;
    const personUid = patch.person_uid;

    if (!personUid) return { hasChanges: false, data: studies };

    const studyIndex = studies.findIndex((bs) => bs.person_uid === personUid);
    const currentStudy =
      studyIndex !== -1
        ? studies[studyIndex]
        : ({ person_uid: personUid } as API.UserBibleStudy);

    const { merged, hasChanges } = Utility.Sync.deepMerge(currentStudy, patch);

    if (hasChanges) {
      if (studyIndex !== -1) {
        studies[studyIndex] = merged as API.UserBibleStudy;
      } else {
        studies.push(merged as API.UserBibleStudy);
      }
    }

    return { hasChanges, data: studies };
  }

  private async handleDelegatedFieldServiceReportsPatch(
    patch: API.DelegatedFieldServiceReportUpdate,
    context: API.UserPatchContext
  ) {
    if (!context.finalDelegatedFieldServiceReports) {
      context.finalDelegatedFieldServiceReports =
        await Storage.Users.getDelegatedFieldServiceReports(this._id);
    }

    const reports = context.finalDelegatedFieldServiceReports;
    const reportId = patch.report_id;

    if (!reportId) return { hasChanges: false, data: reports };

    const reportIndex = reports.findIndex((r) => r.report_id === reportId);
    const currentReport =
      reportIndex !== -1
        ? reports[reportIndex]
        : ({ report_id: reportId } as API.DelegatedFieldServiceReport);

    const { merged, hasChanges } = Utility.Sync.deepMerge(currentReport, patch);

    if (hasChanges) {
      if (reportIndex !== -1) {
        reports[reportIndex] = merged as API.DelegatedFieldServiceReport;
      } else {
        reports.push(merged as API.DelegatedFieldServiceReport);
      }
    }

    return { hasChanges, data: reports };
  }

  private async saveSettings(records: API.UserSettings) {
    try {
      await Storage.Users.saveSettings(this._id, records);

      this._settings = records;
    } catch (error) {
      Utility.Logger.error(
        `Error saving settings for user ${this._id}:`,
        error
      );
      throw error;
    }
  }

  // --- Public Method ---
  public async load() {
    try {
      const [profileData, settingsData, sessionsData, etag] = await Promise.all(
        [
          Storage.Users.getProfile(this._id),
          Storage.Users.getSettings(this._id),
          Storage.Users.getSessions(this._id),
          Storage.Users.getETag(this._id),
        ]
      );

      this._profile = profileData;
      this._settings = settingsData;
      this._sessions = sessionsData;
      this._ETag = etag;

      if (this._profile.auth_uid) {
        const userInfo = await Service.Auth.getUserInfo(this._profile.auth_uid);
        if (userInfo) {
          this._email = userInfo.email;
          this._auth_provider = userInfo.provider;
        }
      }
    } catch (error) {
      Utility.Logger.error(`Error loading user ${this._id}:`, error);
    }
  }

  public async saveProfile(profile: API.UserProfile) {
    try {
      await Storage.Users.saveProfile(this._id, profile);

      this._profile = profile;
    } catch (error) {
      Utility.Logger.error(`Error saving profile for user ${this._id}:`, error);

      throw error;
    }
  }

  public async saveSessions(sessions: API.UserSession[]) {
    try {
      await Storage.Users.saveSessions(this._id, sessions);

      this._sessions = sessions;
    } catch (error) {
      Utility.Logger.error(`Error saving sessions for user ${this._id}:`, error);

      throw error;
    }
  }

  public async applyProfilePatch(patch: API.UserProfileClientUpdate) {
    await this.applyBatchedChanges([{ scope: 'profile', patch }]);
  }

  public async applyServerProfilePatch(patch: API.UserProfileServerUpdate) {
    try {
      const baseProfile = this._profile || ({} as API.UserProfile);

      const { merged, hasChanges } = this.applyUserServerChange(
        baseProfile,
        patch
      );

      if (hasChanges) {
        await this.saveProfile(merged);

        Utility.Logger.info(
          `Server profile patch applied for user ${this._id} (quiet)`
        );
      }
    } catch (error) {
      Utility.Logger.error(
        `Error applying server profile patch for user ${this._id}:`,
        error
      );

      throw error;
    }
  }

  public async applySettingsPatch(patch: API.UserSettingsUpdate) {
    await this.applyBatchedChanges([{ scope: 'settings', patch: patch }]);
  }

  public async applyFieldServiceReportPatch(
    patch: API.UserFieldServiceReportsUpdate
  ) {
    return this.applyBatchedChanges([
      { scope: 'field_service_reports', patch },
    ]);
  }

  public async applyBibleStudyPatch(patch: API.UserBibleStudiesUpdate) {
    return this.applyBatchedChanges([{ scope: 'bible_studies', patch }]);
  }

  public async applyDelegatedFieldServiceReporPatch(
    patch: API.DelegatedFieldServiceReportUpdate
  ) {
    return this.applyBatchedChanges([
      { scope: 'delegated_field_service_reports', patch },
    ]);
  }

  public async getMutations(): Promise<API.UserChange[]> {
    try {
      const mutations = await Storage.Users.getMutations(this._id);

      const { pruned, hasChanged } = this.cleanupMutations(mutations);

      if (hasChanged) {
        await Storage.Users.saveMutations(this._id, pruned);
        return pruned;
      }

      return mutations;
    } catch (error) {
      Utility.Logger.error(
        `Error fetching mutations for user ${this._id}:`,
        error
      );
    }
    return [];
  }

  public cleanupMutations(
    changes: API.UserChange[],
    cutoffDate?: Date
  ): { pruned: API.UserChange[]; hasChanged: boolean } {
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

  public async applyBatchedChanges(changes: API.UserChange['changes']) {
    try {
      type ScopeData =
        | API.UserProfile
        | API.UserSettings
        | API.UserFieldServiceReport[]
        | API.UserBibleStudy[]
        | API.DelegatedFieldServiceReport[];

      const recordedMutations: API.UserChange['changes'] = [];

      const scopesToSave = new Map<API.UserScope, ScopeData>();

      const context: API.UserPatchContext = {
        finalProfile: this._profile || ({} as API.UserProfile),
        finalSettings: this._settings || ({} as API.UserSettings),
        finalFieldServiceReports: undefined,
        finalBibleStudies: undefined,
        finalDelegatedFieldServiceReports: undefined,
      };

      for (const change of changes) {
        let result: { hasChanges: boolean; data: ScopeData } | undefined;

        switch (change.scope) {
          case 'profile':
            result = await this.handleProfilePatch(
              change.patch as API.UserProfileClientUpdate,
              context
            );
            break;
          case 'settings':
            result = await this.handleSettingsPatch(
              change.patch as API.UserSettingsUpdate,
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

        Utility.Logger.info(
          `Successfully applied batch: ${recordedMutations.length} mutations for user ${this._id}`
        );
      } else {
        Utility.Logger.info(
          `No changes to apply from batch for user ${this._id}`
        );
      }
    } catch (error) {
      Utility.Logger.error(
        `Error applying batched changes for ${this._id}:`,
        error
      );
      throw error;
    }
  }
}
