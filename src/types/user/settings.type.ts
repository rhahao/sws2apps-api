import { DeepPartial, SyncField } from '../common.types.js';

export interface UserSettings {
  backup_automatic: SyncField;
  theme_follow_os_enabled: SyncField;
  hour_credits_enabled: SyncField;
  data_view: SyncField;
}

export type UserSettingsUpdate = DeepPartial<UserSettings>;