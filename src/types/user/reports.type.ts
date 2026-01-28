import { DeepPartial } from '../common.types.js';

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

export type UserFieldServiceReportsUpdate = DeepPartial<UserFieldServiceReport> & {
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