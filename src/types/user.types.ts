import { AppRoleType } from './app.types.js';

export type UserGlobalRoleType = 'vip' | 'pocket' | 'admin';

export type UserScope = 'profile' | 'settings';

export interface UserProfileServer {
  ETag?: string;
  createdAt?: string;
  auth_uid?: string;
  role: UserGlobalRoleType;
  mfa_enabled?: boolean;
  secret?: string;
  email_otp?: { code: string; expiredAt: number };
  congregation?: {
    id: string;
    cong_role: AppRoleType[];
    account_type: string;
    user_members_delegate?: string[];
    pocket_invitation_code?: string;
  };
}

export interface UserProfileClientMutable {
  firstname: { value: string; updatedAt: string };
  lastname: { value: string; updatedAt: string };
}

export interface UserProfile
  extends UserProfileClientMutable, UserProfileServer {}

export interface UserSettings {
  backup_automatic: { value: string; updatedAt: string };
  theme_follow_os_enabled: { value: string; updatedAt: string };
  hour_credits_enabled: { value: string; updatedAt: string };
  data_view: { value: string; updatedAt: string };
}

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

export type UserChange = {
  ETag: string;
  timestamp: string;
  changes: (
    | { scope: 'profile'; patch: Partial<UserProfileClientMutable> }
    | { scope: 'settings'; patch: Partial<UserSettings> }
  )[];
};
