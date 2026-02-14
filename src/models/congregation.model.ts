import type API from '../types/index.js';
import Storage from '../storages/index.js';
import Utility from '../utils/index.js';

export class Congregation {
  private _id: string;
  private _ETag: string = 'v0';
  private _settings = {} as API.CongSettings;

  constructor(id: string) {
    this._id = id;
  }

  get id(): string {
    return this._id;
  }

  get ETag() {
    return this._ETag;
  }

  get settings() {
    return this._settings;
  }

  // --- Private Method ---
  private async getMutations(): Promise<API.CongChange[]> {
    try {
      const mutations = await Storage.Congregations.getMutations(this._id);

      // Perform on-demand cleanup
      const { pruned, hasChanged } = this.cleanupMutations(mutations);

      if (hasChanged) {
        await Storage.Congregations.saveMutations(this._id, pruned);

        return pruned;
      }

      return mutations;
    } catch (error: unknown) {
      Utility.Logger.error(
        `Error fetching mutations for congregation ${this._id}:`,
        error
      );
    }
    return [];
  }

  private applyCongregationServerChange(
    current: API.CongSettings,
    patch: API.CongSettingsServerUpdate
  ) {
    const merged: API.CongSettings = { ...current };

    let hasChanges = false;

    // Entries gives you the key and value together
    for (const [key, newVal] of Object.entries(patch)) {
      const k = key as keyof API.CongSettingsServer;

      if (newVal !== undefined && merged[k] !== newVal) {
        Object.assign(merged, { [k]: newVal });
        hasChanges = true;
      }
    }

    return { merged, hasChanges };
  }

  private async saveWithHistory(
    recordedMutations: API.CongChange['changes'],
    scopes: { scope: API.CongScope; data: object }[]
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
        API.CongScope,
        (data: object) => Promise<unknown>
      > = {
        branch_cong_analysis: (data) =>
          Storage.Congregations.saveBranchAnalysis(
            this._id,
            data as API.CongBranchAnalysis[]
          ),
        branch_field_service_reports: (data) =>
          Storage.Congregations.saveBranchReports(
            this._id,
            data as API.CongBranchFieldServiceReport[]
          ),
        cong_field_service_reports: (data) =>
          Storage.Congregations.saveReports(
            this._id,
            data as API.CongFieldServiceReport[]
          ),
        field_service_groups: (data) =>
          Storage.Congregations.saveGroups(
            this._id,
            data as API.CongFieldServiceGroup[]
          ),
        meeting_attendance: (data) =>
          Storage.Congregations.saveMeetingAttendance(
            this._id,
            data as API.CongMeetingAttendance[]
          ),
        persons: (data) =>
          Storage.Congregations.savePersons(this._id, data as API.CongPerson[]),
        schedules: (data) =>
          Storage.Congregations.saveSchedules(
            this._id,
            data as API.CongSchedule[]
          ),
        settings: (data) => this.saveSettings(data as API.CongSettings),
        sources: (data) =>
          Storage.Congregations.saveSources(this._id, data as API.CongSource[]),
        speakers_congregations: (data) =>
          Storage.Congregations.saveCongSpeakers(
            this._id,
            data as API.CongSpeaker[]
          ),
        upcoming_events: (data) =>
          Storage.Congregations.saveUpcomingEvents(
            this._id,
            data as API.CongUpcomingEvent[]
          ),
        visiting_speakers: (data) =>
          Storage.Congregations.saveVisitingSpeakers(
            this._id,
            data as API.CongVisitingSpeaker[]
          ),
      };

      // 4. Orchestrate parallel uploads
      const uploadPromises: Promise<unknown>[] = [
        Storage.Congregations.saveMutations(this._id, mutations),
        ...scopes.map((entry) => scopeHandlers[entry.scope]?.(entry.data)),
      ].filter(Boolean); // remove undefined if scope not found

      await Promise.all(uploadPromises);

      // 5. Commit new ETag
      await Storage.Congregations.updateETag(this._id, newEtag);
      this._ETag = newEtag;

      Utility.Logger.info(
        `Congregation ${this._id} update saved with ${recordedMutations.length} mutations across ${scopes.length} scopes. ETag committed: ${newEtag}`
      );
    } catch (error: unknown) {
      Utility.Logger.error(
        `Error during saveWithHistory for congregation ${this._id}:`,
        error
      );
      throw error;
    }
  }

  private async handleSettingsPatch(
    patch: API.CongSettingsUpdate,
    context: API.CongPatchContext
  ) {
    const { merged, hasChanges } = Utility.Sync.deepMerge(
      context.finalSettings,
      patch
    );

    if (hasChanges) {
      context.finalSettings = merged as API.CongSettings;
    }

    return { hasChanges, data: context.finalSettings };
  }

  private async handlePersonsPatch(
    patch: API.CongPersonUpdate,
    context: API.CongPatchContext
  ) {
    if (!context.finalPersons) {
      context.finalPersons = await Storage.Congregations.getPersons(this._id);
    }

    const persons = context.finalPersons;
    const personUid = patch.person_uid;

    if (!personUid) return { hasChanges: false, data: persons };

    const personIndex = persons.findIndex((p) => p.person_uid === personUid);

    const currentPerson =
      personIndex !== -1
        ? persons[personIndex]
        : ({ person_uid: personUid } as API.CongPerson);

    const { merged, hasChanges } = Utility.Sync.deepMerge(currentPerson, patch);

    if (hasChanges) {
      if (personIndex !== -1) {
        persons[personIndex] = merged;
      } else {
        persons.push(merged);
      }
    }
    return { hasChanges, data: persons };
  }

  private async handleBranchCongAnalysisPatch(
    patch: API.CongBranchAnalysisUpdate,
    context: API.CongPatchContext
  ) {
    if (!context.finalBranchAnalysis) {
      context.finalBranchAnalysis =
        await Storage.Congregations.getBranchAnalysis(this._id);
    }

    const analysis = context.finalBranchAnalysis;
    const reportId = patch.report_date;

    if (!reportId) return { hasChanges: false, data: analysis };

    const reportIndex = analysis.findIndex((r) => r.report_date === reportId);

    const currentReport =
      reportIndex !== -1
        ? analysis[reportIndex]
        : ({ report_date: reportId } as API.CongBranchAnalysis);

    const { merged, hasChanges } = Utility.Sync.deepMerge(currentReport, patch);

    if (hasChanges) {
      if (reportIndex !== -1) {
        analysis[reportIndex] = merged;
      } else {
        analysis.push(merged);
      }
    }
    return { hasChanges, data: analysis };
  }

  private async handleBranchFieldServiceReportsPatch(
    patch: API.CongBranchFieldServiceReportUpdate,
    context: API.CongPatchContext
  ) {
    if (!context.finalBranchFieldServiceReports) {
      context.finalBranchFieldServiceReports =
        await Storage.Congregations.getBranchReports(this._id);
    }

    const reports = context.finalBranchFieldServiceReports;
    const reportId = patch.report_date;

    if (!reportId) return { hasChanges: false, data: reports };

    const reportIndex = reports.findIndex((r) => r.report_date === reportId);
    const currentReport =
      reportIndex !== -1
        ? reports[reportIndex]
        : ({ report_date: reportId } as API.CongBranchFieldServiceReport);

    const { merged, hasChanges } = Utility.Sync.deepMerge(currentReport, patch);

    if (hasChanges) {
      if (reportIndex !== -1) {
        reports[reportIndex] = merged;
      } else {
        reports.push(merged);
      }
    }
    return { hasChanges, data: reports };
  }

  private async handleCongFieldServiceReportsPatch(
    patch: API.CongFieldServiceReportUpdate,
    context: API.CongPatchContext
  ) {
    if (!context.finalCongFieldServiceReports) {
      context.finalCongFieldServiceReports =
        await Storage.Congregations.getReports(this._id);
    }
    const reports = context.finalCongFieldServiceReports;
    const reportId = patch.report_id;

    if (!reportId) return { hasChanges: false, data: reports };

    const reportIndex = reports.findIndex((r) => r.report_id === reportId);
    const currentReport =
      reportIndex !== -1
        ? reports[reportIndex]
        : ({ report_id: reportId } as API.CongFieldServiceReport);

    const { merged, hasChanges } = Utility.Sync.deepMerge(currentReport, patch);

    if (hasChanges) {
      if (reportIndex !== -1) {
        reports[reportIndex] = merged;
      } else {
        reports.push(merged);
      }
    }
    return { hasChanges, data: reports };
  }

  private async handleCongFieldServiceGroupsPatch(
    patch: API.CongFieldServiceGroupUpdate,
    context: API.CongPatchContext
  ) {
    if (!context.finalFieldServiceGroups) {
      context.finalFieldServiceGroups = await Storage.Congregations.getGroups(
        this._id
      );
    }

    const groups = context.finalFieldServiceGroups;
    const groupId = patch.group_id;

    if (!groupId) return { hasChanges: false, data: groups };

    const groupIndex = groups.findIndex((r) => r.group_id === groupId);

    const currentGroup =
      groupIndex !== -1
        ? groups[groupIndex]
        : ({ group_id: groupId } as API.CongFieldServiceGroup);

    const { merged, hasChanges } = Utility.Sync.deepMerge(currentGroup, patch);

    if (hasChanges) {
      if (groupIndex !== -1) {
        groups[groupIndex] = merged;
      } else {
        groups.push(merged);
      }
    }

    return { hasChanges, data: groups };
  }

  private async handleCongMeetingAttendancePatch(
    patch: API.CongMeetingAttendanceUpdate,
    context: API.CongPatchContext
  ) {
    if (!context.finalMeetingAttendance) {
      context.finalMeetingAttendance =
        await Storage.Congregations.getMeetingAttendance(this._id);
    }

    const attendance = context.finalMeetingAttendance;
    const monthId = patch.month_date;

    if (!monthId) return { hasChanges: false, data: attendance };

    const monthIndex = attendance.findIndex((r) => r.month_date === monthId);

    const currentMonth =
      monthIndex !== -1
        ? attendance[monthIndex]
        : ({ month_date: monthId } as API.CongMeetingAttendance);

    const { merged, hasChanges } = Utility.Sync.deepMerge(currentMonth, patch);

    if (hasChanges) {
      if (monthIndex !== -1) {
        attendance[monthIndex] = merged;
      } else {
        attendance.push(merged);
      }
    }

    return { hasChanges, data: attendance };
  }

  private async handleCongSchedulePatch(
    patch: API.CongScheduleUpdate,
    context: API.CongPatchContext
  ) {
    if (!context.finalSchedules) {
      context.finalSchedules = await Storage.Congregations.getSchedules(
        this._id
      );
    }

    const schedules = context.finalSchedules;
    const weekId = patch.weekOf;

    if (!weekId) return { hasChanges: false, data: schedules };

    const weekIndex = schedules.findIndex((r) => r.weekOf === weekId);

    const currentSchedule =
      weekIndex !== -1
        ? schedules[weekIndex]
        : ({ weekOf: weekId } as API.CongSchedule);

    const { merged, hasChanges } = Utility.Sync.deepMerge(
      currentSchedule,
      patch
    );

    if (hasChanges) {
      if (weekIndex !== -1) {
        schedules[weekIndex] = merged;
      } else {
        schedules.push(merged);
      }
    }

    return { hasChanges, data: schedules };
  }

  private async handleCongSourcePatch(
    patch: API.CongSourceUpdate,
    context: API.CongPatchContext
  ) {
    if (!context.finalSources) {
      context.finalSources = await Storage.Congregations.getSources(this._id);
    }

    const sources = context.finalSources;
    const weekId = patch.weekOf;

    if (!weekId) return { hasChanges: false, data: sources };

    const weekIndex = sources.findIndex((r) => r.weekOf === weekId);

    const currentSource =
      weekIndex !== -1
        ? sources[weekIndex]
        : ({ weekOf: weekId } as API.CongSource);

    const { merged, hasChanges } = Utility.Sync.deepMerge(currentSource, patch);

    if (hasChanges) {
      if (weekIndex !== -1) {
        sources[weekIndex] = merged;
      } else {
        sources.push(merged);
      }
    }

    return { hasChanges, data: sources };
  }

  private async handleCongSpeakerPatch(
    patch: API.CongSpeakerUpdate,
    context: API.CongPatchContext
  ) {
    if (!context.finalSpeakersCongregations) {
      context.finalSpeakersCongregations =
        await Storage.Congregations.getCongSpeakers(this._id);
    }

    const congs = context.finalSpeakersCongregations;
    const congId = patch.id;

    if (!congId) return { hasChanges: false, data: congs };

    const congIndex = congs.findIndex((r) => r.id === congId);

    const currentCong =
      congIndex !== -1 ? congs[congIndex] : ({ id: congId } as API.CongSpeaker);

    const { merged, hasChanges } = Utility.Sync.deepMerge(currentCong, patch);

    if (hasChanges) {
      if (congIndex !== -1) {
        congs[congIndex] = merged;
      } else {
        congs.push(merged);
      }
    }

    return { hasChanges, data: congs };
  }

  private async handleCongUpcomingEventPatch(
    patch: API.CongUpcomingEventUpdate,
    context: API.CongPatchContext
  ) {
    if (!context.finalUpcomingEvents) {
      context.finalUpcomingEvents =
        await Storage.Congregations.getUpcomingEvents(this._id);
    }

    const events = context.finalUpcomingEvents;
    const eventId = patch.event_uid;

    if (!eventId) return { hasChanges: false, data: events };

    const eventIndex = events.findIndex((r) => r.event_uid === eventId);

    const currentEvent =
      eventIndex !== -1
        ? events[eventIndex]
        : ({ event_uid: eventId } as API.CongUpcomingEvent);

    const { merged, hasChanges } = Utility.Sync.deepMerge(currentEvent, patch);

    if (hasChanges) {
      if (eventIndex !== -1) {
        events[eventIndex] = merged;
      } else {
        events.push(merged);
      }
    }

    return { hasChanges, data: events };
  }

  private async handleVisitingSpeakersPatch(
    patch: API.CongVisitingSpeakerUpdate,
    context: API.CongPatchContext
  ) {
    if (!context.finalVisitingSpeakers) {
      context.finalVisitingSpeakers = await Storage.Congregations.getVisitingSpeakers(this._id);
    }

    const speakers = context.finalVisitingSpeakers || [];
    const personId = patch.person_uid;

    if (!personId) return { hasChanges: false, data: speakers };

    const speakerIndex = speakers.findIndex((s) => s.person_uid === personId);

    const currentSpeaker = speakerIndex !== -1 ? speakers[speakerIndex] : ({ person_uid: personId } as API.CongVisitingSpeaker);

    const { merged, hasChanges } = Utility.Sync.deepMerge(currentSpeaker, patch);

    if (hasChanges) {
      if (speakerIndex !== -1) {
        speakers[speakerIndex] = merged;
      } else {
        speakers.push(merged);
      }
    }

    return { hasChanges, data: speakers };
  }

  // --- Public Method ---
  public async load() {
    try {
      const [settingsData, etag] = await Promise.all([
        Storage.Congregations.getSettings(this._id),
        Storage.Congregations.getETag(this._id),
      ]);

      this._settings = settingsData;

      this._ETag = etag;
    } catch (error: unknown) {
      Utility.Logger.error(`Error loading congregation ${this._id}:`, error);
    }
  }

  public async saveSettings(settings: API.CongSettings) {
    await Storage.Congregations.saveSettings(this._id, settings);

    this._settings = settings;
  }

  public cleanupMutations(changes: API.CongChange[], cutoffDate?: Date) {
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

  public async applyServerSettingsPatch(patch: API.CongSettingsServerUpdate) {
    try {
      const baseSettings = this._settings || {};

      const { merged, hasChanges } = this.applyCongregationServerChange(
        baseSettings,
        patch
      );

      if (hasChanges) {
        await this.saveSettings(merged);

        Utility.Logger.info(
          `Server settings patch applied for congregation ${this._id} (quiet)`
        );
      }
    } catch (error) {
      Utility.Logger.error(
        `Error applying server settings patch for congregation ${this._id}:`,
        error
      );
      throw error;
    }
  }

  public async applyBatchedChanges(changes: API.CongChange['changes']) {
    try {
      type ScopeData =
        | API.CongSettings
        | API.CongPerson[]
        | API.CongBranchAnalysis[]
        | API.CongBranchFieldServiceReport[]
        | API.CongFieldServiceReport[]
        | API.CongFieldServiceGroup[]
        | API.CongMeetingAttendance[]
        | API.CongSchedule[]
        | API.CongSource[]
        | API.CongSpeaker[]
        | API.CongUpcomingEvent[]
        | API.CongVisitingSpeaker[];

      const recordedMutations: API.CongChange['changes'] = [];

      const scopesToSave = new Map<API.CongScope, ScopeData>();

      const context: API.CongPatchContext = {
        finalSettings: this._settings || ({} as API.CongSettings),
        finalBranchAnalysis: undefined,
        finalPersons: undefined,
        finalBranchFieldServiceReports: undefined,
        finalCongFieldServiceReports: undefined,
        finalFieldServiceGroups: undefined,
        finalMeetingAttendance: undefined,
        finalSchedules: undefined,
        finalSources: undefined,
        finalSpeakersCongregations: undefined,
        finalUpcomingEvents: undefined,
        finalVisitingSpeakers: undefined,
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
          case 'schedules': {
            result = await this.handleCongSchedulePatch(change.patch, context);
            break;
          }
          case 'sources': {
            result = await this.handleCongSourcePatch(change.patch, context);
            break;
          }
          case 'speakers_congregations': {
            result = await this.handleCongSpeakerPatch(change.patch, context);
            break;
          }
          case 'upcoming_events': {
            result = await this.handleCongUpcomingEventPatch(
              change.patch,
              context
            );
            break;
          }
          case 'visiting_speakers': {
            result = await this.handleVisitingSpeakersPatch(change.patch, context);
            break;
          }
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
          `Successfully applied batch: ${recordedMutations.length} mutations for congregation ${this._id}`
        );
      } else {
        Utility.Logger.info(
          `No changes to apply from batch for congregation ${this._id}`
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

  public async applyCongSettingsPatch(patch: API.CongSettingsUpdate) {
    return this.applyBatchedChanges([{ scope: 'settings', patch }]);
  }

  public async applyBranchCongAnalysisPatch(
    patch: API.CongBranchAnalysisUpdate
  ) {
    return this.applyBatchedChanges([{ scope: 'branch_cong_analysis', patch }]);
  }

  public async applyPersonPatch(patch: API.CongPersonUpdate) {
    return this.applyBatchedChanges([{ scope: 'persons', patch }]);
  }

  public async applyBranchFieldServiceReportPatch(
    patch: API.CongBranchFieldServiceReportUpdate
  ) {
    return this.applyBatchedChanges([
      { scope: 'branch_field_service_reports', patch },
    ]);
  }

  public async applyCongFieldServiceReportPatch(
    patch: API.CongFieldServiceReportUpdate
  ) {
    return this.applyBatchedChanges([
      { scope: 'cong_field_service_reports', patch },
    ]);
  }

  public async applyCongFieldServiceGroupPatch(
    patch: API.CongFieldServiceGroupUpdate
  ) {
    return this.applyBatchedChanges([{ scope: 'field_service_groups', patch }]);
  }

  public async applyCongMeetingAttendancePatch(
    patch: API.CongMeetingAttendanceUpdate
  ) {
    return this.applyBatchedChanges([{ scope: 'meeting_attendance', patch }]);
  }

  public async applyCongSchedulePatch(patch: API.CongScheduleUpdate) {
    return this.applyBatchedChanges([{ scope: 'schedules', patch }]);
  }

  public async applyCongSourcePatch(patch: API.CongSourceUpdate) {
    return this.applyBatchedChanges([{ scope: 'sources', patch }]);
  }

  public async applyCongSpeakerPatch(patch: API.CongSpeakerUpdate) {
    return this.applyBatchedChanges([
      { scope: 'speakers_congregations', patch },
    ]);
  }

  public async applyCongUpcomingEventPatch(patch: API.CongUpcomingEventUpdate) {
    return this.applyBatchedChanges([{ scope: 'upcoming_events', patch }]);
  }

  public async applyVisitingSpeakerPatch(patch: API.CongVisitingSpeakerUpdate) {
    return this.applyBatchedChanges([{ scope: 'visiting_speakers', patch }]);
  }
}
