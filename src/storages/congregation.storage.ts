import type API from '../types/index.js';
import * as Storage from '../storages/storage.js';
import Utility from '../utils/index.js';

enum File {
  SETTINGS = 'settings.enc',
  MUTATIONS = 'mutations.enc',
  BRANCH_ANALYSIS = 'branch_cong_analysis.enc',
  BRANCH_REPORTS = 'branch_field_service_reports.enc',
  CONG_REPORTS = 'cong_field_service_reports.enc',
  GROUPS = 'field_service_groups.enc',
  ATTENDANCE = 'meeting_attendance.enc',
  SCHEDULES = 'schedules.enc',
  SOURCES = 'sources.enc',
  CONG_SPEAKERS = 'speakers_congregations.enc',
  EVENTS = 'upcoming_events.enc',
  PERSONS = 'persons.enc',
  VISITING_SPEAKERS = 'visiting_speakers.enc',
}

export const getIds = async () => {
  const folders = await Storage.listFolders('congregations/');

  const congIds = folders
    .map((f) => f.split('/')[1])
    .filter((id): id is string => !!id);

  return congIds;
};

export const updateETag = async (id: string, ETag: string) => {
  await Storage.uploadFile(`congregations/${id}/`, '', 'text/plain', {
    etag: ETag,
  });
};

export const uploadContents = async (
  id: string,
  filename: string,
  contents: Buffer | object | string
) => {
  if (!contents) return;

  await Storage.uploadFile(
    `congregations/${id}/${filename}`,
    contents,
    'application/octet-stream'
  );
};

export const getETag = async (id: string) => {
  try {
    const metadata = await Storage.getObjectMetadata(`congregations/${id}/`);
    return metadata.etag || 'v0';
  } catch (error) {
    Utility.Logger.error(
      `Error fetching stored ETag for congregation ${id}:`,
      error
    );

    return 'v0';
  }
};

export const getData = async (id: string, filename: string) => {
  try {
    const content = await Storage.getFile(`congregations/${id}/${filename}`);
    return content;
  } catch (error) {
    Utility.Logger.error(
      `Error loading congregation ${id} file ${filename}:`,
      error
    );
    return;
  }
};

export const getMutations = async (id: string) => {
  const data = await getData(id, File.MUTATIONS);

  return (data ?? []) as API.CongChange[];
};

export const getSettings = async (id: string) => {
  const data = await getData(id, File.SETTINGS);

  return (data ?? {}) as API.CongSettings;
};

export const getMeetingAttendance = async (id: string) => {
  const data = await getData(id, File.ATTENDANCE);

  return (data ?? []) as API.CongMeetingAttendance[];
};

export const getBranchAnalysis = async (id: string) => {
  const data = await getData(id, File.BRANCH_ANALYSIS);

  return (data ?? []) as API.CongBranchAnalysis[];
};

export const getBranchReports = async (id: string) => {
  const data = await getData(id, File.BRANCH_REPORTS);

  return (data ?? []) as API.CongBranchFieldServiceReport[];
};

export const getReports = async (id: string) => {
  const data = await getData(id, File.CONG_REPORTS);

  return (data ?? []) as API.CongFieldServiceReport[];
};

export const getCongSpeakers = async (id: string) => {
  const data = await getData(id, File.CONG_SPEAKERS);

  return (data ?? []) as API.CongSpeaker[];
};

export const getUpcomingEvents = async (id: string) => {
  const data = await getData(id, File.EVENTS);

  return (data ?? []) as API.CongUpcomingEvent[];
};

export const getGroups = async (id: string) => {
  const data = await getData(id, File.GROUPS);

  return (data ?? []) as API.CongFieldServiceGroup[];
};

export const getPersons = async (id: string) => {
  const data = await getData(id, File.PERSONS);

  return (data ?? []) as API.CongPerson[];
};

export const getSchedules = async (id: string) => {
  const data = await getData(id, File.SCHEDULES);

  return (data ?? []) as API.CongSchedule[];
};

export const getSources = async (id: string) => {
  const data = await getData(id, File.SOURCES);

  return (data ?? []) as API.CongSource[];
};

export const getVisitingSpeakers = async (id: string) => {
  const data = await getData(id, File.VISITING_SPEAKERS);

  return (data ?? []) as API.CongVisitingSpeaker[];
};

export const saveMutations = async (id: string, changes: API.CongChange[]) => {
  await uploadContents(id, File.MUTATIONS, changes);
};

export const saveSettings = async (id: string, changes: API.CongSettings) => {
  await uploadContents(id, File.SETTINGS, changes);
};

export const saveMeetingAttendance = async (
  id: string,
  changes: API.CongMeetingAttendance[]
) => {
  await uploadContents(id, File.ATTENDANCE, changes);
};

export const saveBranchAnalysis = async (
  id: string,
  changes: API.CongBranchAnalysis[]
) => {
  await uploadContents(id, File.BRANCH_ANALYSIS, changes);
};

export const saveBranchReports = async (
  id: string,
  changes: API.CongBranchFieldServiceReport[]
) => {
  await uploadContents(id, File.BRANCH_REPORTS, changes);
};

export const saveReports = async (
  id: string,
  changes: API.CongFieldServiceReport[]
) => {
  await uploadContents(id, File.CONG_REPORTS, changes);
};

export const saveCongSpeakers = async (
  id: string,
  changes: API.CongSpeaker[]
) => {
  await uploadContents(id, File.CONG_SPEAKERS, changes);
};

export const saveUpcomingEvents = async (
  id: string,
  changes: API.CongUpcomingEvent[]
) => {
  await uploadContents(id, File.EVENTS, changes);
};

export const saveGroups = async (
  id: string,
  changes: API.CongFieldServiceGroup[]
) => {
  await uploadContents(id, File.GROUPS, changes);
};

export const savePersons = async (id: string, changes: API.CongPerson[]) => {
  await uploadContents(id, File.PERSONS, changes);
};

export const saveSchedules = async (id: string, changes: API.CongSchedule[]) => {
  await uploadContents(id, File.SCHEDULES, changes);
};

export const saveSources = async (id: string, changes: API.CongSource[]) => {
  await uploadContents(id, File.SOURCES, changes);
};

export const saveVisitingSpeakers = async (id: string, changes: API.CongVisitingSpeaker[]) => {
  await uploadContents(id, File.VISITING_SPEAKERS, changes);
};
