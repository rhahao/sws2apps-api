// 1. Domain-specific exports
export * from './common.type.js';
export * from './persons.type.js';
export * from './settings.type.js';
export * from './reports.type.js';
export * from './schedule.type.js';
export * from './source.type.js';
export * from './events.type.js';
export * from './speakers.type.js';
export * from './attendance.type.js';

// 2. Local Imports
import {
  CongPerson,
  CongPersonUpdate,
  CongSettings,
  CongSettingsUpdate,
  CongBranchAnalysis,
  CongBranchAnalysisUpdate,
  CongBranchFieldServiceReport,
  CongBranchFieldServiceReportUpdate,
  CongFieldServiceReport,
  CongFieldServiceReportUpdate,
  CongFieldServiceGroup,
  CongFieldServiceGroupUpdate,
  CongSchedule,
  CongScheduleUpdate,
  CongSource,
  CongSourceUpdate,
  CongUpcomingEvent,
  CongUpcomingEventUpdate,
  CongSpeaker,
  CongSpeakerUpdate,
  CongVisitingSpeaker,
  CongVisitingSpeakerUpdate,
  CongMeetingAttendance,
  CongMeetingAttendanceUpdate,
} from './index.js';

/**
 * Represents a single transaction log entry in mutations.json.
 */
export type CongChange = {
  ETag: string;
  timestamp: string;
  changes: (
    | { scope: 'persons'; patch: CongPersonUpdate }
    | { scope: 'settings'; patch: CongSettingsUpdate }
    | { scope: 'branch_cong_analysis'; patch: CongBranchAnalysisUpdate }
    | {
        scope: 'branch_field_service_reports';
        patch: CongBranchFieldServiceReportUpdate;
      }
    | {
        scope: 'cong_field_service_reports';
        patch: CongFieldServiceReportUpdate;
      }
    | { scope: 'field_service_groups'; patch: CongFieldServiceGroupUpdate }
    | { scope: 'schedules'; patch: CongScheduleUpdate }
    | { scope: 'sources'; patch: CongSourceUpdate }
    | { scope: 'upcoming_events'; patch: CongUpcomingEventUpdate }
    | { scope: 'speakers_congregations'; patch: CongSpeakerUpdate }
    | { scope: 'visiting_speakers'; patch: CongVisitingSpeakerUpdate }
    | { scope: 'meeting_attendance'; patch: CongMeetingAttendanceUpdate }
  )[];
};

/**
 * State manager for the batch engine.
 */
export interface CongPatchContext {
  finalSettings: CongSettings;
  finalPersons?: CongPerson[];
  finalBranchAnalysis?: CongBranchAnalysis[];
  finalBranchFieldServiceReports?: CongBranchFieldServiceReport[];
  finalCongFieldServiceReports?: CongFieldServiceReport[];
  finalFieldServiceGroups?: CongFieldServiceGroup[];
  finalSchedules?: CongSchedule[];
  finalSources?: CongSource[];
  finalUpcomingEvents?: CongUpcomingEvent[];
  finalSpeakersCongregations?: CongSpeaker[];
  finalVisitingSpeakers?: CongVisitingSpeaker[];
  finalMeetingAttendance?: CongMeetingAttendance[];
}
