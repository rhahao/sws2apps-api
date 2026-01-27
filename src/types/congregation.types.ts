import { DeepPartial } from './common.types.js';

export interface CongPerson {
  person_uid: string;
  _deleted: { value: string; updatedAt: string };
  person_firstname: { value: string; updatedAt: string };
  person_lastname: { value: string; updatedAt: string };
  person_display_name: { value: string; updatedAt: string };
  male: { value: string; updatedAt: string };
  female: { value: string; updatedAt: string };
  birth_date: { value: string; updatedAt: string };
  assignments: { type: string; updatedAt: string; values: string }[];
  timeAway: {
    _deleted: string;
    id: string;
    updatedAt: string;
    start_date: string;
    end_date: string;
    comments: string;
  }[];
  archived: { value: string; updatedAt: string };
  disqualified: { value: string; updatedAt: string };
  email: { value: string; updatedAt: string };
  address: { value: string; updatedAt: string };
  phone: { value: string; updatedAt: string };
  first_report: { value: string; updatedAt: string };
  publisher_baptized: {
    active: { value: string; updatedAt: string };
    anointed: { value: string; updatedAt: string };
    other_sheep: { value: string; updatedAt: string };
    baptism_date: { value: string; updatedAt: string };
    history: {
      _deleted: string;
      id: string;
      updatedAt: string;
      start_date: string;
      end_date: string;
    }[];
  };
  publisher_unbaptized: {
    active: { value: string; updatedAt: string };
    history: {
      _deleted: string;
      id: string;
      updatedAt: string;
      start_date: string;
      end_date: string;
    }[];
  };
  midweek_meeting_student: {
    active: { value: string; updatedAt: string };
    history: {
      _deleted: string;
      id: string;
      updatedAt: string;
      start_date: string;
      end_date: string;
    }[];
  };
  privileges: {
    _deleted: string;
    id: string;
    updatedAt: string;
    privilege: string;
    start_date: string;
    end_date: string;
  }[];
  enrollments: {
    _deleted: string;
    id: string;
    updatedAt: string;
    enrollment: string;
    start_date: string;
    end_date: string;
  }[];
  emergency_contacts: {
    _deleted: string;
    id: string;
    updatedAt: string;
    name: string;
    contact: string;
  }[];
  family_members: { head: string; members: string; updatedAt: string };
}

export type CongPersonUpdate = DeepPartial<CongPerson> & {
  person_uid: string;
};

export interface CongSettingsServer {
  country_code: string;
  country_guid: string;
  cong_prefix: string;
  cong_name: string;
  cong_master_key: string;
  cong_access_code: string;
  cong_new: boolean;
}

export type CongSettingsServerUpdate = DeepPartial<CongSettingsServer>;

interface CongSettingsClientMutable {
  cong_number: { value: string; updatedAt: string };
  cong_location: {
    address: string;
    lat: number;
    lng: number;
    updatedAt: string;
  };
  cong_circuit: {
    type: string;
    value: string;
    updatedAt: string;
    _deleted: boolean;
  }[];
  cong_discoverable: { value: boolean; updatedAt: string };
  data_sync: { value: boolean; updatedAt: string };
  fullname_option: {
    type: string;
    value: string;
    updatedAt: string;
    _deleted: string;
  }[];
  short_date_format: {
    type: string;
    value: string;
    updatedAt: string;
    _deleted: string;
  }[];
  display_name_enabled: {
    type: string;
    updatedAt: string;
    _deleted: string;
    meetings: string;
    others: string;
  }[];
  schedule_exact_date_enabled: {
    value: string;
    updatedAt: string;
    type: string;
    _deleted: string;
  }[];
  time_away_public: { value: boolean; updatedAt: string };
  source_material: {
    auto_import: {
      enabled: { value: string; updatedAt: string };
      frequency: { value: string; updatedAt: string };
    };
    language: {
      type: string;
      value: string;
      updatedAt: string;
      _deleted: string;
    }[];
  };
  special_months: {
    _deleted: string;
    updatedAt: string;
    year: string;
    months: string;
  }[];
  midweek_meeting: {
    type: string;
    _deleted: { value: string; updatedAt: string };
    weekday: { value: number; updatedAt: string };
    time: { value: string; updatedAt: string };
    class_count: { value: string; updatedAt: string };
    opening_prayer_linked_assignment: { value: string; updatedAt: string };
    closing_prayer_linked_assignment: { value: string; updatedAt: string };
    aux_class_counselor_default: {
      enabled: { value: string; updatedAt: string };
      person: { value: string; updatedAt: string };
    };
  }[];
  weekend_meeting: {
    type: string;
    _deleted: { value: string; updatedAt: string };
    weekday: { value: number; updatedAt: string };
    time: { value: string; updatedAt: string };
    opening_prayer_auto_assigned: { value: string; updatedAt: string };
    substitute_speaker_enabled: { value: string; updatedAt: string };
    w_study_conductor_default: { value: string; updatedAt: string };
    substitute_w_study_conductor_displayed: {
      value: string;
      updatedAt: string;
    };
    consecutive_monthly_parts_notice_shown: {
      value: string;
      updatedAt: string;
    };
    outgoing_talks_schedule_public: { value: string; updatedAt: string };
  }[];
  circuit_overseer: {
    firstname: { value: string; updatedAt: string };
    lastname: { value: string; updatedAt: string };
    display_name: { value: string; updatedAt: string };
    visits: {
      _deleted: string;
      id: string;
      weekOf: string;
      updatedAt: string;
    }[];
  };
  language_groups: { enabled: { value: string; updatedAt: string } };
  format_24h_enabled: {
    type: string;
    value: string;
    updatedAt: string;
    _deleted: string;
  }[];
  week_start_sunday: {
    type: string;
    value: string;
    updatedAt: string;
    _deleted: string;
  }[];
  attendance_online_record: {
    type: string;
    value: string;
    updatedAt: string;
    _deleted: string;
  }[];
  responsabilities: {
    coordinator: string;
    secretary: string;
    service: string;
    updatedAt: string;
  };
  group_publishers_sort: { updatedAt: string; value: string };
  aux_class_fsg: { value: string; updatedAt: string };
  first_day_week: {
    type: string;
    _deleted: string;
    updatedAt: string;
    value: string;
  }[];
  schedule_songs_weekend: {
    type: string;
    _deleted: string;
    updatedAt: string;
    value: string;
  }[];
}

export type CongSettingsUpdate = DeepPartial<CongSettingsClientMutable>;

export interface CongSettings
  extends CongSettingsServer,
    CongSettingsClientMutable {}

export interface CongBranchAnalysis {
  report_date: string;
  _deleted: string;
  updatedAt: string;
  meeting_average: string;
  publishers: string;
  territories: string;
  submitted: string;
}

export type CongBranchAnalysisUpdate = DeepPartial<CongBranchAnalysis> & {
  report_date: string;
  updatedAt: string;
};

export interface CongBranchFieldServiceReport {
  report_date: string;
  _deleted: string;
  updatedAt: string;
  publishers_active: string;
  weekend_meeting_average: string;
  publishers: string;
  APs: string;
  FRs: string;
  submitted: string;
}

export type CongBranchFieldServiceReportUpdate =
  DeepPartial<CongBranchFieldServiceReport> & {
    report_date: string;
    updatedAt: string;
  };

export interface CongFieldServiceReport {
  report_id: string;
  _deleted: string;
  updatedAt: string;
  report_date: string;
  person_uid: string;
  shared_ministry: string;
  hours: string;
  bible_studies: string;
  comments: string;
  late: string;
  status: string;
}

export type CongFieldServiceReportUpdate =
  DeepPartial<CongFieldServiceReport> & {
    report_date: string;
    updatedAt: string;
  };

export interface CongFieldServiceGroup {
  group_id: string;
  _deleted: string;
  updatedAt: string;
  name: string;
  sort_index: string;
  members: string;
  midweek_meeting: string;
  weekend_meeting: string;
  language_group: string;
}

export type CongFieldServiceGroupUpdate = DeepPartial<CongFieldServiceGroup> & {
  group_id: string;
  updatedAt: string;
};

export type CongScope =
  | 'persons'
  | 'settings'
  | 'branch_cong_analysis'
  | 'branch_field_service_reports'
  | 'cong_field_service_reports'
  | 'field_service_groups';

export type CongChange = {
  ETag: string;
  timestamp: string;
  changes: (
    | {
        scope: 'persons';
        patch: CongPersonUpdate;
      }
    | {
        scope: 'settings';
        patch: CongSettingsUpdate;
      }
    | {
        scope: 'branch_cong_analysis';
        patch: CongBranchAnalysisUpdate;
      }
    | {
        scope: 'branch_field_service_reports';
        patch: CongBranchFieldServiceReportUpdate;
      }
    | {
        scope: 'cong_field_service_reports';
        patch: CongFieldServiceReportUpdate;
      }
    | {
        scope: 'field_service_groups';
        patch: CongFieldServiceGroupUpdate;
      }
  )[];
};

export interface CongPatchContext {
  finalSettings: CongSettings;
  finalBranchAnalysis?: CongBranchAnalysis[];
  finalPersons?: CongPerson[];
  finalBranchFieldServiceReports?: CongBranchFieldServiceReport[];
  finalCongFieldServiceReports?: CongFieldServiceReport[];
  finalFieldServiceGroups?: CongFieldServiceGroup[];
}
