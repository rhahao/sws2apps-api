import { DeepPartial } from '../common.types.js';

interface AttendanceCongregation {
  present: string;
  online: string;
  type: string;
  updatedAt: string;
}

interface WeeklyAttendance {
  midweek: AttendanceCongregation[];
  weekend: AttendanceCongregation[];
}

export interface CongMeetingAttendance {
  month_date: string;
  _deleted: { value: boolean; updatedAt: string };
  week_1: WeeklyAttendance;
  week_2: WeeklyAttendance;
  week_3: WeeklyAttendance;
  week_4: WeeklyAttendance;
  week_5: WeeklyAttendance;
}

export type CongMeetingAttendanceUpdate = DeepPartial<CongMeetingAttendance> & {
  month_date: string;
};