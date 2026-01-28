import { DeepPartial } from './common.types.js';
import { AppRoleType } from './app.types.js';

export type UserGlobalRoleType = 'vip' | 'pocket' | 'admin';

export type UserScope =
  | 'profile'
  | 'settings'
  | 'field_service_reports'
  | 'bible_studies'
  | 'delegated_field_service_reports';

export interface UserCongregation {
  id: string;
  cong_role: AppRoleType[];
  account_type: string;
  user_members_delegate?: string[];
  pocket_invitation_code?: string;
}

export interface UserProfileServer {
  ETag?: string;
  createdAt?: string;
  auth_uid?: string;
  role: UserGlobalRoleType;
  mfa_enabled?: boolean;
  secret?: string;
  email_otp?: { code: string; expiredAt: number };
  congregation?: UserCongregation;
}

export type UserProfileServerUpdate = DeepPartial<UserProfileServer>;

export interface UserProfileClientMutable {
  firstname: { value: string; updatedAt: string };
  lastname: { value: string; updatedAt: string };
}

export type UserProfileClientUpdate = DeepPartial<UserProfileClientMutable>;

export interface UserProfile
  extends UserProfileClientMutable,
    UserProfileServer {}

export interface UserSettings {
  backup_automatic: { value: string; updatedAt: string };
  theme_follow_os_enabled: { value: string; updatedAt: string };
  hour_credits_enabled: { value: string; updatedAt: string };
  data_view: { value: string; updatedAt: string };
}

export type UserSettingsUpdate = DeepPartial<UserSettings>;

export interface UserFieldServiceReport {
  report_date: string;
  _deleted: boolean;
  updatedAt: string;
  shared_ministry: string;
  hours: string;
  bible_studies: string;
  comments: string;
  record_type: string;
  status: string;
  person_uid?: string;
}

export type UserFieldServiceReportsUpdate =
  DeepPartial<UserFieldServiceReport> & {
    report_date: string;
    updatedAt: string;
  };

export interface UserBibleStudy {
  _deleted: boolean;
  person_name: string;
  person_uid: string;
  updatedAt: string;
}

export type UserBibleStudiesUpdate = DeepPartial<UserBibleStudy> & {
  person_uid: string;
  updatedAt: string;
};

export interface UserSession {
  mfaVerified?: boolean;
  last_seen: string;
  visitor_details: {
    browser: string;
    ip: string;
    ipLocation: {
      city: string;
      continent_code: string;
      country_code: string;
      country_name: string;
      timezone: string | string[];
    };
    isMobile: boolean;
    os: string;
  };
  visitorid: string;
  identifier: string;
}

export interface DelegatedFieldServiceReport {
  report_id: string;
  _deleted: string;
  updatedAt: string;
  shared_ministry: string;
  hours: string;
  bible_studies: string;
  comments: string;
  status: string;
  person_uid: string;
  report_date: string;
}

export type DelegatedFieldServiceReportUpdate = DeepPartial<DelegatedFieldServiceReport> & {
  report_id: string;
  person_uid: string;
  updatedAt: string;
  report_date: string;
};

export interface UserPatchContext {
  finalProfile: UserProfile;
  finalSettings: UserSettings;
  finalFieldServiceReports?: UserFieldServiceReport[]
  finalBibleStudies?: UserBibleStudy[]
  finalDelegatedFieldServiceReports?: DelegatedFieldServiceReport[]
}

export type UserChange = {
  ETag: string;
  timestamp: string;
  changes: (
    | { scope: 'profile'; patch: UserProfileClientUpdate }
    | { scope: 'settings'; patch: UserSettingsUpdate }
    | {
        scope: 'field_service_reports';
        patch: UserFieldServiceReportsUpdate;
      }
    | {
        scope: 'bible_studies';
        patch: UserBibleStudiesUpdate;
      }
      | {
        scope: 'delegated_field_service_reports';
        patch: DelegatedFieldServiceReportUpdate;
      }
  )[];
};
