export * from './profile.type.js';
export * from './settings.type.js';
export * from './reports.type.js';

import { 
  UserProfile, UserProfileClientUpdate, 
  UserSettings, UserSettingsUpdate,
  UserFieldServiceReport, UserFieldServiceReportsUpdate,
  UserBibleStudy, UserBibleStudiesUpdate,
  DelegatedFieldServiceReport, DelegatedFieldServiceReportUpdate 
} from './index.js';

export type UserScope =
  | 'profile'
  | 'settings'
  | 'field_service_reports'
  | 'bible_studies'
  | 'delegated_field_service_reports';

export type UserChange = {
  ETag: string;
  timestamp: string;
  changes: (
    | { scope: 'profile'; patch: UserProfileClientUpdate }
    | { scope: 'settings'; patch: UserSettingsUpdate }
    | { scope: 'field_service_reports'; patch: UserFieldServiceReportsUpdate }
    | { scope: 'bible_studies'; patch: UserBibleStudiesUpdate }
    | { scope: 'delegated_field_service_reports'; patch: DelegatedFieldServiceReportUpdate }
  )[];
};

export interface UserPatchContext {
  finalProfile: UserProfile;
  finalSettings: UserSettings;
  finalFieldServiceReports?: UserFieldServiceReport[];
  finalBibleStudies?: UserBibleStudy[];
  finalDelegatedFieldServiceReports?: DelegatedFieldServiceReport[];
}