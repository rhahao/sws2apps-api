import type API from '../types/index.js';
import * as Storage from '../storages/storage.js';
import Utility from '../utils/index.js';

enum File {
  PROFILE = 'profile.enc',
  SETTINGS = 'settings.enc',
  SESSIONS = 'sessions.enc',
  MUTATIONS = 'mutations.enc',
  REPORTS = 'field_service_reports.enc',
  BIBLE_STUDIES = 'bible_studies.enc',
  DELEGATED_REPORTS = 'delegated_field_service_reports.enc',
}

export const getIds = async () => {
  const folders = await Storage.listFolders('users/');

  const userIds = folders
    .map((f) => f.split('/')[1])
    .filter((id): id is string => !!id);

  return userIds;
};

export const updateETag = async (id: string, ETag: string) => {
  await Storage.uploadFile(`users/${id}/`, '', 'text/plain', {
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
    `users/${id}/${filename}`,
    contents,
    'application/octet-stream'
  );
};

export const getETag = async (id: string) => {
  try {
    const metadata = await Storage.getObjectMetadata(`users/${id}/`);
    return metadata.etag || 'v0';
  } catch (error) {
    Utility.Logger.error(`Error fetching stored ETag for user ${id}:`, error);

    return 'v0';
  }
};

export const getData = async (id: string, filename: string) => {
  try {
    const content = await Storage.getFile(`users/${id}/${filename}`);
    return content;
  } catch (error) {
    Utility.Logger.error(`Error loading user ${id} file ${filename}:`, error);
    return;
  }
};

export const getMutations = async (id: string) => {
  const data = await getData(id, File.MUTATIONS);

  return (data ?? []) as API.UserChange[];
};

export const getProfile = async (id: string) => {
  const data = await getData(id, File.PROFILE);

  return (data ?? {}) as API.UserProfile;
};

export const getSettings = async (id: string) => {
  const data = await getData(id, File.SETTINGS);

  return (data ?? {}) as API.UserSettings;
};

export const getSessions = async (id: string) => {
  const data = await getData(id, File.SESSIONS);

  return (data ?? []) as API.UserSession[];
};

export const getFieldServiceReports = async (id: string) => {
  const data: API.UserFieldServiceReport[] = await getData(id, File.REPORTS);

  return (data ?? []) as API.UserFieldServiceReport[];
};

export const getBibleStudies = async (id: string) => {
  const data: API.UserBibleStudy[] = await getData(id, File.BIBLE_STUDIES);

  return (data ?? []) as API.UserBibleStudy[];
};

export const getDelegatedFieldServiceReports = async (id: string) => {
  const data = await getData(id, File.DELEGATED_REPORTS);

  return (data ?? []) as API.DelegatedFieldServiceReport[];
};

export const saveMutations = async (id: string, changes: API.UserChange[]) => {
  await uploadContents(id, File.MUTATIONS, changes);
};

export const saveProfile = async (id: string, profile: API.UserProfile) => {
  await uploadContents(id, File.PROFILE, profile);
};

export const saveSettings = async (id: string, settings: API.UserSettings) => {
  await uploadContents(id, File.SETTINGS, settings);
};

export const saveSessions = async (id: string, sessions: API.UserSession[]) => {
  await uploadContents(id, File.SESSIONS, sessions);
};

export const saveFieldServiceReports = async (
  id: string,
  reports: API.UserFieldServiceReport[]
) => {
  await uploadContents(id, File.REPORTS, reports);
};

export const saveBibleStudies = async (
  id: string,
  bibleStudies: API.UserBibleStudy[]
) => {
  await uploadContents(id, File.BIBLE_STUDIES, bibleStudies);
};

export const saveDelegatedFieldServiceReports = async (
  id: string,
  reports: API.DelegatedFieldServiceReport[]
) => {
  await uploadContents(id, File.DELEGATED_REPORTS, reports);
};
