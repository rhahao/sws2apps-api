import { DeepPartial } from '../common.types.js';
import { SyncField } from './common.type.js';

export interface AssignmentCongregation {
  type: string;
  id: string;
  updatedAt: string;
  _deleted: string;
  name: string;
  value: string;
  solo: string;
}

export interface WeekTypeCongregation {
  type: string;
  value: string;
  updatedAt: string;
}

export interface AssignmentAYFType {
  main_hall: {
    student: AssignmentCongregation[];
    assistant: AssignmentCongregation[];
  };
  aux_class_1: {
    student: AssignmentCongregation;
    assistant: AssignmentCongregation;
  };
  aux_class_2: {
    student: AssignmentCongregation;
    assistant: AssignmentCongregation;
  };
}

export interface PublicTalkCongregation {
  type: string;
  value: string;
  updatedAt: string;
}

export interface OutgoingTalkScheduleType {
  id: string;
  updatedAt: string;
  _deleted: string;
  synced: string;
  opening_song: string;
  public_talk: string;
  value: string;
  type: string;
  congregation: string;
}

export interface CongSchedule {
  weekOf: string;
  midweek_meeting: {
    chairman: {
      main_hall: AssignmentCongregation[];
      aux_class_1: AssignmentCongregation;
    };
    opening_prayer: AssignmentCongregation[];
    tgw_talk: AssignmentCongregation[];
    tgw_gems: AssignmentCongregation[];
    tgw_bible_reading: {
      main_hall: AssignmentCongregation[];
      aux_class_1: AssignmentCongregation;
      aux_class_2: AssignmentCongregation;
    };
    ayf_part1: AssignmentAYFType;
    ayf_part2: AssignmentAYFType;
    ayf_part3: AssignmentAYFType;
    ayf_part4: AssignmentAYFType;
    lc_part1: AssignmentCongregation[];
    lc_part2: AssignmentCongregation[];
    lc_part3: AssignmentCongregation[];
    lc_cbs: {
      conductor: AssignmentCongregation[];
      reader: AssignmentCongregation[];
    };
    closing_prayer: AssignmentCongregation[];
    circuit_overseer: AssignmentCongregation;
    aux_fsg?: SyncField;
    week_type: WeekTypeCongregation[];
  };
  weekend_meeting: {
    chairman: AssignmentCongregation[];
    opening_prayer: AssignmentCongregation[];
    public_talk_type: PublicTalkCongregation[];
    speaker: {
      part_1: AssignmentCongregation[];
      part_2: AssignmentCongregation[];
      substitute: AssignmentCongregation[];
    };
    wt_study: {
      conductor: AssignmentCongregation[];
      reader: AssignmentCongregation[];
    };
    closing_prayer: AssignmentCongregation[];
    circuit_overseer: AssignmentCongregation;
    week_type: WeekTypeCongregation[];
    outgoing_talks: OutgoingTalkScheduleType[];
  };
}

export type CongScheduleUpdate = DeepPartial<CongSchedule> & {
  weekOf: string;
};