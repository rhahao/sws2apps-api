import { DeepPartial, SyncField } from '../common.types.js';
import { AppRoleType } from '../app.types.js';

export type UserGlobalRoleType = 'vip' | 'pocket' | 'admin';

export interface UserCongregation {
  id: string;
  cong_role: AppRoleType[];
  account_type: UserGlobalRoleType;
  user_members_delegate?: string[];
  pocket_invitation_code?: string;
  user_local_uid?: string;
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

export interface UserProfileClientMutable {
  firstname: SyncField;
  lastname: SyncField;
}

export interface UserProfile
  extends UserProfileClientMutable,
    UserProfileServer {}

export type UserProfileClientUpdate = DeepPartial<UserProfileClientMutable>;

export type UserProfileServerUpdate = DeepPartial<UserProfileServer>;

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
