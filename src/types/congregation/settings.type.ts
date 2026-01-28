import { DeepPartial, SyncField } from '../common.types.js';

export interface CongSettingsServer {
  country_code: string;
  country_guid: string;
  cong_prefix: string;
  cong_name: string;
  cong_master_key: string;
  cong_access_code: string;
  cong_new: boolean;
}

export interface CongSettingsClientMutable {
  cong_number: SyncField;
  cong_location: { address: string; lat: number; lng: number; updatedAt: string };
  cong_circuit: { type: string; value: string; updatedAt: string; _deleted: string }[];
  cong_discoverable: SyncField<boolean>;
  data_sync: SyncField<boolean>;
  fullname_option: { type: string; value: string; updatedAt: string; _deleted: string }[];
  short_date_format: { type: string; value: string; updatedAt: string; _deleted: string }[];
  display_name_enabled: { type: string; updatedAt: string; _deleted: string; meetings: string; others: string }[];
  schedule_exact_date_enabled: { value: string; updatedAt: string; type: string; _deleted: string }[];
  time_away_public: SyncField<boolean>;
  source_material: {
    auto_import: { enabled: SyncField; frequency: SyncField };
    language: { type: string; value: string; updatedAt: string; _deleted: string }[];
  };
  special_months: { _deleted: string; updatedAt: string; year: string; months: string }[];
  midweek_meeting: {
    type: string;
    _deleted: SyncField;
    weekday: SyncField<number>;
    time: SyncField;
    class_count: SyncField;
    opening_prayer_linked_assignment: SyncField;
    closing_prayer_linked_assignment: SyncField;
    aux_class_counselor_default: { enabled: SyncField; person: SyncField };
  }[];
  weekend_meeting: {
    type: string;
    _deleted: SyncField;
    weekday: SyncField<number>;
    time: SyncField;
    opening_prayer_auto_assigned: SyncField;
    substitute_speaker_enabled: SyncField;
    w_study_conductor_default: SyncField;
    substitute_w_study_conductor_displayed: SyncField;
    consecutive_monthly_parts_notice_shown: SyncField;
    outgoing_talks_schedule_public: SyncField;
  }[];
  circuit_overseer: {
    firstname: SyncField;
    lastname: SyncField;
    display_name: SyncField;
    visits: { _deleted: string; id: string; weekOf: string; updatedAt: string }[];
  };
  language_groups: { enabled: SyncField };
  format_24h_enabled: { type: string; value: string; updatedAt: string; _deleted: string }[];
  week_start_sunday: { type: string; value: string; updatedAt: string; _deleted: string }[];
  attendance_online_record: { type: string; value: string; updatedAt: string; _deleted: string }[];
  responsabilities: { coordinator: string; secretary: string; service: string; updatedAt: string };
  group_publishers_sort: SyncField;
  aux_class_fsg: SyncField;
  first_day_week: { type: string; _deleted: string; updatedAt: string; value: string }[];
  schedule_songs_weekend: { type: string; _deleted: string; updatedAt: string; value: string }[];
}

export type CongSettingsUpdate = DeepPartial<CongSettingsClientMutable>;

export interface CongSettings extends CongSettingsServer, CongSettingsClientMutable {}

export type CongSettingsServerUpdate = DeepPartial<CongSettingsServer>;