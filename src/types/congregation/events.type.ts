import { DeepPartial } from '../common.types.js';

export interface CongUpcomingEvent {
  event_uid: string;
  _deleted: string;
  updatedAt: string;
  start: string;
  end: string;
  type: string;
  category: string;
  duration: string;
  description: string;
  custom: string;
}

export type CongUpcomingEventUpdate = DeepPartial<CongUpcomingEvent> & {
  event_uid: string;
};