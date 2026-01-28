import { DeepPartial } from '../common.types.js';

interface CongSourceLocaleString {
  [language: string]: string;
}

interface CongSourceLocaleNumber {
  [language: string]: number;
}

interface CongSourceRecordType {
  type: string;
  value: string | number;
  updatedAt: string;
}

interface CongSourcePartTiming {
  default: number | CongSourceLocaleNumber;
  override: CongSourceRecordType[];
}

interface CongSourceAYF {
  type: { [language: string]: number };
  time: CongSourceLocaleNumber;
  src: CongSourceLocaleString;
  title: CongSourceLocaleString;
}

interface CongSourceLC {
  time: CongSourcePartTiming;
  title: { default: CongSourceLocaleString; override: CongSourceRecordType[] };
  desc: { default: CongSourceLocaleString; override: CongSourceRecordType[] };
}

interface COTalkTitleType {
  src: string;
  updatedAt: string;
}

export interface CongSource {
  weekOf: string;
  midweek_meeting: {
    event_name: CongSourceRecordType[];
    week_date_locale: CongSourceLocaleString;
    weekly_bible_reading: CongSourceLocaleString;
    song_first: CongSourceLocaleString;
    tgw_talk: { src: CongSourceLocaleString; time: CongSourcePartTiming };
    tgw_gems: { title: CongSourceLocaleString; time: CongSourcePartTiming };
    tgw_bible_reading: {
      src: CongSourceLocaleString;
      title: CongSourceLocaleString;
    };
    ayf_count: CongSourceLocaleNumber;
    ayf_part1: CongSourceAYF;
    ayf_part2: CongSourceAYF;
    ayf_part3: CongSourceAYF;
    ayf_part4: CongSourceAYF;
    song_middle: CongSourceLocaleString;
    lc_count: {
      default: CongSourceLocaleNumber;
      override: CongSourceRecordType[];
    };
    lc_part1: CongSourceLC;
    lc_part2: CongSourceLC;
    lc_part3: {
      time: CongSourceRecordType[];
      title: CongSourceRecordType[];
      desc: CongSourceRecordType[];
    };
    lc_cbs: {
      title: { default: CongSourceLocaleString; override: CongSourceRecordType[] };
      time: CongSourcePartTiming;
      src: CongSourceLocaleString;
    };
    co_talk_title: COTalkTitleType;
    song_conclude: {
      default: CongSourceLocaleString;
      override: CongSourceRecordType[];
    };
  };
  weekend_meeting: {
    event_name: CongSourceRecordType[];
    song_first: CongSourceRecordType[];
    public_talk: CongSourceRecordType[];
    co_talk_title: { public: COTalkTitleType; service: COTalkTitleType };
    song_middle: CongSourceLocaleString;
    song_conclude: {
      default: CongSourceLocaleString;
      override: CongSourceRecordType[];
    };
    w_study: CongSourceLocaleString;
  };
}

export type CongSourceUpdate = DeepPartial<CongSource> & {
  weekOf: string;
};