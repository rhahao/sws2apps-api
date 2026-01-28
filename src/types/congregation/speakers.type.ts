import { DeepPartial, SyncField } from '../common.types.js';

export interface CongSpeaker {
  id: string;
  _deleted: SyncField;
  cong_id: string;
  cong_number: SyncField;
  cong_name: SyncField;
  cong_circuit: SyncField;
  cong_location: {
    address: SyncField;
    lat: number;
    lng: number;
  };
  midweek_meeting: {
    weekday: SyncField<number>;
    time: SyncField;
  };
  weekend_meeting: {
    weekday: SyncField<number>;
    time: SyncField;
  };
  public_talk_coordinator: {
    name: SyncField;
    email: SyncField;
    phone: SyncField;
  };
  coordinator: {
    name: SyncField;
    email: SyncField;
    phone: SyncField;
  };
  request_status: string;
  request_id: string;
}

export type CongSpeakerUpdate = DeepPartial<CongSpeaker> & {
  id: string;
};

// --- Visiting Speakers (Incoming speakers from other congs) ---
export interface CongVisitingSpeaker {
  person_uid: string;
  _deleted: SyncField;
  cong_id: string;
  person_firstname: SyncField;
  person_lastname: SyncField;
  person_display_name: SyncField;
  person_notes: SyncField;
  person_email: SyncField;
  person_phone: SyncField;
  elder: SyncField;
  ministerial_servant: SyncField;
  talks: {
    _deleted: string;
    updatedAt: string;
    talk_number: number;
    talk_songs: number[];
  }[];
  local: SyncField;
}

export type CongVisitingSpeakerUpdate = DeepPartial<CongVisitingSpeaker> & {
  person_uid: string;
};
