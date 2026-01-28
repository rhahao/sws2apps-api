import { DeepPartial, SyncArrayItem, SyncField } from "../common.types.js";

export interface CongPerson {
  person_uid: string;
  _deleted: SyncField;
  person_firstname: SyncField;
  person_lastname: SyncField;
  person_display_name: SyncField;
  male: SyncField;
  female: SyncField;
  birth_date: SyncField;
  assignments: { type: string; updatedAt: string; values: string }[];
  timeAway: (SyncArrayItem & { start_date: string; end_date: string; comments: string })[];
  archived: SyncField;
  disqualified: SyncField;
  email: SyncField;
  address: SyncField;
  phone: SyncField;
  first_report: SyncField;
  publisher_baptized: {
    active: SyncField;
    anointed: SyncField;
    other_sheep: SyncField;
    baptism_date: SyncField;
    history: (SyncArrayItem & { start_date: string; end_date: string })[];
  };
  publisher_unbaptized: {
    active: SyncField;
    history: (SyncArrayItem & { start_date: string; end_date: string })[];
  };
  midweek_meeting_student: {
    active: SyncField;
    history: (SyncArrayItem & { start_date: string; end_date: string })[];
  };
  privileges: (SyncArrayItem & { privilege: string; start_date: string; end_date: string })[];
  enrollments: (SyncArrayItem & { enrollment: string; start_date: string; end_date: string })[];
  emergency_contacts: (SyncArrayItem & { name: string; contact: string })[];
  family_members: { head: string; members: string; updatedAt: string };
}

export type CongPersonUpdate = DeepPartial<CongPerson> & {
  person_uid: string;
};