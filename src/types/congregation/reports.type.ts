import { DeepPartial } from '../common.types.js';

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

export type CongBranchFieldServiceReportUpdate = DeepPartial<CongBranchFieldServiceReport> & {
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

export type CongFieldServiceReportUpdate = DeepPartial<CongFieldServiceReport> & {
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