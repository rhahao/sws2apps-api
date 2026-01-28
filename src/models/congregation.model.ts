import {
  CongChange,
  CongPerson,
  CongPersonUpdate,
  CongScope,
  CongSettings,
  CongSettingsServer,
  CongSettingsServerUpdate,
  CongBranchAnalysis,
  CongBranchAnalysisUpdate,
  CongSettingsUpdate,
  CongPatchContext,
  CongBranchFieldServiceReport,
  CongBranchFieldServiceReportUpdate,
  CongFieldServiceReport,
  CongFieldServiceReportUpdate,
  CongFieldServiceGroupUpdate,
  CongFieldServiceGroup,
  CongMeetingAttendance,
  CongMeetingAttendanceUpdate,
} from '../types/index.js';
import { s3Service } from '../services/index.js';
import { applyDeepSyncPatch, logger } from '../utils/index.js';

export class Congregation {
  private _id: string;
  private _flags: string[] = [];
  private _ETag: string = 'v0';
  private _settings = {} as CongSettings;

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

  private async fetchMutations(): Promise<CongChange[]> {
    try {
      const key = `congregations/${this._id}/mutations.json`;
      const content = await s3Service.getFile(key);

      if (content) {
        const mutations: CongChange[] = JSON.parse(content);

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

  private async getBranchCongAnalysis(): Promise<CongBranchAnalysis[]> {
    try {
      const content = await s3Service.getFile(
        `congregations/${this._id}/branch_cong_analysis.json`
      );

      return content ? JSON.parse(content) : [];
    } catch (error: unknown) {
      logger.error(
        `Error loading congregation ${this._id} branch_cong_analysis:`,
        error
      );
      return [];
    }
  }

  private async getBranchFieldServiceReports(): Promise<
    CongBranchFieldServiceReport[]
  > {
    try {
      const content = await s3Service.getFile(
        `congregations/${this._id}/branch_field_service_reports.json`
      );

      return content ? JSON.parse(content) : [];
    } catch (error: unknown) {
      logger.error(
        `Error loading congregation ${this._id} branch_field_service_reports:`,
        error
      );
      return [];
    }
  }

  private async getCongFieldServiceReports(): Promise<CongFieldServiceReport[]> {
    try {
      const content = await s3Service.getFile(
        `congregations/${this._id}/cong_field_service_reports.json`
      );

      return content ? JSON.parse(content) : [];
    } catch (error: unknown) {
      logger.error(
        `Error loading congregation ${this._id} cong_field_service_reports:`,
        error
      );
      return [];
    }
  }

  private async getPersons(): Promise<CongPerson[]> {
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

  private async getCongFieldServiceGroups(): Promise<CongFieldServiceGroup[]> {
    try {
      const content = await s3Service.getFile(
        `congregations/${this._id}/field_service_groups.json`
      );

      return content ? JSON.parse(content) : [];
    } catch (error: unknown) {
      logger.error(
        `Error loading congregation ${this._id} field_service_groups:`,
        error
      );
      return [];
    }
  }

  private async getCongMeetingAttendance(): Promise<CongMeetingAttendance[]> {
    try {
      const content = await s3Service.getFile(
        `congregations/${this._id}/meeting_attendance.json`
      );

      return content ? JSON.parse(content) : [];
    } catch (error: unknown) {
      logger.error(
        `Error loading congregation ${this._id} meeting_attendance:`,
        error
      );
      return [];
    }
  }

  private applyCongregationServerChange(
    current: CongSettings,
    patch: CongSettingsServerUpdate
  ) {
    const merged: CongSettings = { ...current };

    let hasChanges = false;

    // Entries gives you the key and value together
    for (const [key, newVal] of Object.entries(patch)) {
      const k = key as keyof CongSettingsServer;

      if (newVal !== undefined && merged[k] !== newVal) {
        // We still need a narrow cast for assignment, but we avoid 'any'
        Object.assign(merged, { [k]: newVal });
        hasChanges = true;
      }
    }

    return { merged, hasChanges };
  }

  private async saveComponent(fileName: string, data: unknown) {
    if (!data) return;

    try {
      const baseKey = `congregations/${this._id}/`;

      await s3Service.uploadFile(
        `${baseKey}${fileName}`,
        JSON.stringify(data),
        'application/json'
      );

      // update in-memory data
      if (fileName === 'settings.json') {
        this._settings = data as CongSettings;
      }
    } catch (error) {
      logger.error(
        `Error saving component ${fileName} for congregation ${this._id}:`,
        error
      );

      throw error;
    }
  }

  private async saveMutations(changes: CongChange[]) {
    await this.saveComponent('mutations.json', changes);
  }

  private async saveWithHistory(
    recordedMutations: CongChange['changes'],
    scopes: { scope: CongScope; data: object }[]
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

      // 3. Orchestrate parallel S3 uploads (Data Scopes + Mutation Log)
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
      await s3Service.uploadFile(
        `congregations/${this._id}/`,
        '',
        'text/plain',
        {
          etag: newEtag,
        }
      );

      // 5. Finally, update the in-memory ETag
      this._ETag = newEtag;

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

  private async handleSettingsPatch(
    patch: CongSettingsUpdate,
    context: CongPatchContext
  ) {
    const { merged, hasChanges } = applyDeepSyncPatch(
      context.finalSettings,
      patch
    );
    if (hasChanges) {
      context.finalSettings = merged as CongSettings;
    }
    return { hasChanges, data: context.finalSettings };
  }

  private async handlePersonsPatch(
    patch: CongPersonUpdate,
    context: CongPatchContext
  ) {
    if (!context.finalPersons) {
      context.finalPersons = await this.getPersons();
    }

    const persons = context.finalPersons;
    const personUid = patch.person_uid;

    if (!personUid) return { hasChanges: false, data: persons };

    const personIndex = persons.findIndex((p) => p.person_uid === personUid);

    const currentPerson =
      personIndex !== -1
        ? persons[personIndex]
        : ({ person_uid: personUid } as CongPerson);

    const { merged, hasChanges } = applyDeepSyncPatch(currentPerson, patch);

    if (hasChanges) {
      if (personIndex !== -1) {
        persons[personIndex] = merged as CongPerson;
      } else {
        persons.push(merged as CongPerson);
      }
    }
    return { hasChanges, data: persons };
  }

  private async handleBranchCongAnalysisPatch(
    patch: CongBranchAnalysisUpdate,
    context: CongPatchContext
  ) {
    if (!context.finalBranchAnalysis) {
      context.finalBranchAnalysis = await this.getBranchCongAnalysis();
    }

    const analysis = context.finalBranchAnalysis;
    const reportId = patch.report_date;

    if (!reportId) return { hasChanges: false, data: analysis };

    const reportIndex = analysis.findIndex((r) => r.report_date === reportId);

    const currentReport =
      reportIndex !== -1
        ? analysis[reportIndex]
        : ({ report_date: reportId } as CongBranchAnalysis);

    const { merged, hasChanges } = applyDeepSyncPatch(currentReport, patch);

    if (hasChanges) {
      if (reportIndex !== -1) {
        analysis[reportIndex] = merged as CongBranchAnalysis;
      } else {
        analysis.push(merged as CongBranchAnalysis);
      }
    }
    return { hasChanges, data: analysis };
  }

  private async handleBranchFieldServiceReportsPatch(
    patch: CongBranchFieldServiceReportUpdate,
    context: CongPatchContext
  ) {
    if (!context.finalBranchFieldServiceReports) {
      context.finalBranchFieldServiceReports =
        await this.getBranchFieldServiceReports();
    }
    const reports = context.finalBranchFieldServiceReports;
    const reportId = patch.report_date;

    if (!reportId) return { hasChanges: false, data: reports };

    const reportIndex = reports.findIndex((r) => r.report_date === reportId);
    const currentReport =
      reportIndex !== -1
        ? reports[reportIndex]
        : ({ report_date: reportId } as CongBranchFieldServiceReport);

    const { merged, hasChanges } = applyDeepSyncPatch(currentReport, patch);

    if (hasChanges) {
      if (reportIndex !== -1) {
        reports[reportIndex] = merged as CongBranchFieldServiceReport;
      } else {
        reports.push(merged as CongBranchFieldServiceReport);
      }
    }
    return { hasChanges, data: reports };
  }

  private async handleCongFieldServiceReportsPatch(
    patch: CongFieldServiceReportUpdate,
    context: CongPatchContext
  ) {
    if (!context.finalCongFieldServiceReports) {
      context.finalCongFieldServiceReports =
        await this.getCongFieldServiceReports();
    }
    const reports = context.finalCongFieldServiceReports;
    const reportId = patch.report_id;

    if (!reportId) return { hasChanges: false, data: reports };

    const reportIndex = reports.findIndex((r) => r.report_id === reportId);
    const currentReport =
      reportIndex !== -1
        ? reports[reportIndex]
        : ({ report_id: reportId } as CongFieldServiceReport);

    const { merged, hasChanges } = applyDeepSyncPatch(currentReport, patch);

    if (hasChanges) {
      if (reportIndex !== -1) {
        reports[reportIndex] = merged as CongFieldServiceReport;
      } else {
        reports.push(merged as CongFieldServiceReport);
      }
    }
    return { hasChanges, data: reports };
  }

  private async handleCongFieldServiceGroupsPatch(
    patch: CongFieldServiceGroupUpdate,
    context: CongPatchContext
  ) {
    if (!context.finalFieldServiceGroups) {
      context.finalFieldServiceGroups = await this.getCongFieldServiceGroups();
    }

    const groups = context.finalFieldServiceGroups;
    const groupId = patch.group_id;

    if (!groupId) return { hasChanges: false, data: groups };

    const groupIndex = groups.findIndex((r) => r.group_id === groupId);

    const currentGroup =
      groupIndex !== -1
        ? groups[groupIndex]
        : ({ group_id: groupId } as CongFieldServiceGroup);

    const { merged, hasChanges } = applyDeepSyncPatch(currentGroup, patch);

    if (hasChanges) {
      if (groupIndex !== -1) {
        groups[groupIndex] = merged as CongFieldServiceGroup;
      } else {
        groups.push(merged as CongFieldServiceGroup);
      }
    }
    return { hasChanges, data: groups };
  }

  private async handleCongMeetingAttendancePatch(
    patch: CongMeetingAttendanceUpdate,
    context: CongPatchContext
  ) {
    if (!context.finalMeetingAttendance) {
      context.finalMeetingAttendance = await this.getCongMeetingAttendance();
    }

    const attendance = context.finalMeetingAttendance;
    const monthId = patch.month_date;

    if (!monthId) return { hasChanges: false, data: attendance };

    const monthIndex = attendance.findIndex((r) => r.month_date === monthId);

    const currentMonth =
      monthIndex !== -1
        ? attendance[monthIndex]
        : ({ month_date: monthId } as CongMeetingAttendance);

    const { merged, hasChanges } = applyDeepSyncPatch(currentMonth, patch);

    if (hasChanges) {
      if (monthIndex !== -1) {
        attendance[monthIndex] = merged as CongMeetingAttendance;
      } else {
        attendance.push(merged as CongMeetingAttendance);
      }
    }
    return { hasChanges, data: attendance };
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

  public cleanupMutations(changes: CongChange[], cutoffDate?: Date) {
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

  public async applyServerSettingsPatch(patch: CongSettingsServerUpdate) {
    const baseSettings = this._settings || {};

    const { merged, hasChanges } = this.applyCongregationServerChange(
      baseSettings,
      patch
    );

    if (hasChanges) {
      const oldSettings = this._settings;
      this._settings = merged as CongSettings;

      try {
        await this.saveComponent('settings.json', this._settings);

        logger.info(
          `Server settings patch applied for congregation ${this._id} (quiet)`
        );
      } catch (error: unknown) {
        this._settings = oldSettings;
        throw error;
      }
    }
  }

  public async applyBatchedChanges(changes: CongChange['changes']) {
    try {
      type ScopeData =
        | CongSettings
        | CongPerson[]
        | CongBranchAnalysis[]
        | CongBranchFieldServiceReport[]
        | CongFieldServiceReport[]
        | CongFieldServiceGroup[]
        | CongMeetingAttendance[];

      const recordedMutations: CongChange['changes'] = [];

      const scopesToSave = new Map<CongScope, ScopeData>();

      const context: CongPatchContext = {
        finalSettings: this._settings || ({} as CongSettings),
        finalBranchAnalysis: undefined,
        finalPersons: undefined,
        finalBranchFieldServiceReports: undefined,
        finalCongFieldServiceReports: undefined,
        finalFieldServiceGroups: undefined,
        finalMeetingAttendance: undefined,
      };

      for (const change of changes) {
        let result: { hasChanges: boolean; data: ScopeData } | undefined;

        switch (change.scope) {
          case 'settings': {
            result = await this.handleSettingsPatch(change.patch, context);
            break;
          }
          case 'persons': {
            result = await this.handlePersonsPatch(change.patch, context);
            break;
          }
          case 'branch_cong_analysis': {
            result = await this.handleBranchCongAnalysisPatch(
              change.patch,
              context
            );
            break;
          }
          case 'branch_field_service_reports': {
            result = await this.handleBranchFieldServiceReportsPatch(
              change.patch,
              context
            );
            break;
          }
          case 'cong_field_service_reports': {
            result = await this.handleCongFieldServiceReportsPatch(
              change.patch,
              context
            );
            break;
          }
          case 'field_service_groups': {
            result = await this.handleCongFieldServiceGroupsPatch(
              change.patch,
              context
            );
            break;
          }
          case 'meeting_attendance': {
            result = await this.handleCongMeetingAttendancePatch(
              change.patch,
              context
            );
            break;
          }
        }

        if (result && result.hasChanges) {
          recordedMutations.push(change);
          scopesToSave.set(change.scope, result.data);
        }
      }

      if (recordedMutations.length > 0) {
        this._settings = context.finalSettings; // Update internal state

        const finalScopes = Array.from(scopesToSave.entries()).map(
          ([scope, data]) => ({ scope, data })
        );

        await this.saveWithHistory(recordedMutations, finalScopes);

        logger.info(
          `Successfully applied batch: ${recordedMutations.length} mutations for congregation ${this._id}`
        );
      } else {
        logger.info(
          `No changes to apply from batch for congregation ${this._id}`
        );
      }
    } catch (error) {
      logger.error(`Error applying batched changes for ${this._id}:`, error);
      throw error;
    }
  }

  public async applyCongSettingsPatch(patch: CongSettingsUpdate) {
    return this.applyBatchedChanges([{ scope: 'settings', patch }]);
  }

  public async applyBranchCongAnalysisPatch(patch: CongBranchAnalysisUpdate) {
    return this.applyBatchedChanges([{ scope: 'branch_cong_analysis', patch }]);
  }

  public async applyPersonPatch(patch: CongPersonUpdate) {
    return this.applyBatchedChanges([{ scope: 'persons', patch }]);
  }

  public async applyBranchFieldServiceReportPatch(
    patch: CongBranchFieldServiceReportUpdate
  ) {
    return this.applyBatchedChanges([
      { scope: 'branch_field_service_reports', patch },
    ]);
  }

  public async applyCongFieldServiceReportPatch(
    patch: CongFieldServiceReportUpdate
  ) {
    return this.applyBatchedChanges([
      { scope: 'cong_field_service_reports', patch },
    ]);
  }

  public async applyCongFieldServiceGroupPatch(
    patch: CongFieldServiceGroupUpdate
  ) {
    return this.applyBatchedChanges([{ scope: 'field_service_groups', patch }]);
  }

  public async applyCongMeetingAttendancePatch(
    patch: CongMeetingAttendanceUpdate
  ) {
    return this.applyBatchedChanges([{ scope: 'meeting_attendance', patch }]);
  }
}
