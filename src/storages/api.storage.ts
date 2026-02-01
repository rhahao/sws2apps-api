import type API from '../types/index.js';
import * as Storage from '../storages/storage.js';
import Utility from '../utils/index.js';

enum File {
  FLAGS = 'flags.enc',
  INSTALLATIONS = 'installations.enc',
  SETTINGS = 'settings.enc',
}

export const getData = async (filename: string) => {
  try {
    const content = await Storage.getFile(`api/${filename}`);
    return content;
  } catch (error) {
    Utility.Logger.error(`Error loading api file ${filename}:`, error);
    return;
  }
};

export const uploadContents = async (
  filename: string,
  contents: Buffer | object | string
) => {
  if (!contents) return;

  await Storage.uploadFile(
    `api/${filename}`,
    contents,
    'application/octet-stream'
  );
};

export const getSettings = async () => {
  const data = await getData(File.SETTINGS);

  return (data ?? {}) as API.Settings;
};

export const getInstallations = async () => {
  const data = await getData(File.INSTALLATIONS);

  return (data ?? []) as API.Installation[];
};

export const getFlags = async () => {
  const data = await getData(File.FLAGS);

  return (data ?? []) as API.FeatureFlag[];
};

export const saveSettings = async (settings: API.Settings) => {
  await uploadContents(File.SETTINGS, settings);
};

export const saveFlags = async (flags: API.FeatureFlag[]) => {
  await uploadContents(File.FLAGS, flags);
};

export const saveInstallations = async (installations: API.Installation[]) => {
  await uploadContents(File.INSTALLATIONS, installations);
};
