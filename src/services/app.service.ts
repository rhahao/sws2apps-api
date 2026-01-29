import { FeatureFlag, Installation } from '../types/index.js';
import { logger } from '../utils/index.js';
import { congregationRegistry } from './congregation_registry.service.js';
import { s3Service } from './s3.service.js';
import { userRegistry } from './user_registry.service.js';

export class AppService {
  public isReady = false;
  private _clientMinimumVersion = '1.0.0';
  private _flags: FeatureFlag[] = [];
  private _installations: Installation[] = [];

  public get flags() {
    return this._flags;
  }

  public get installations() {
    return this._installations;
  }

  public get clientMinimumVersion() {
    return this._clientMinimumVersion;
  }

  private async loadSettings() {
    const key = 'api/settings.json';

    const exist = await s3Service.fileExists(key);

    if (exist) {
      const content = await s3Service.getFile(key);
      const settings = JSON.parse(content!);

      this._clientMinimumVersion = settings.client_minimum_version;
    } else {
      logger.info(`${key} not found. Creating default settings...`);

      const defaultSettings = { client_minimum_version: '1.0.0' };

      await s3Service.uploadFile(
        key,
        JSON.stringify(defaultSettings),
        'application/json'
      );

      this._clientMinimumVersion = defaultSettings.client_minimum_version;

      logger.info(`${key} created successfully.`);
    }
  }

  private async loadInstallations() {
    const key = 'api/installations.json';

    const exist = await s3Service.fileExists(key);

    if (exist) {
      const content = await s3Service.getFile(key);
      const data = JSON.parse(content!);

      this._installations = data;
    } else {
      logger.info(`${key} not found. Creating default storage...`);

      await s3Service.uploadFile(key, JSON.stringify([]), 'application/json');

      this._installations = [];

      logger.info(`${key} created successfully.`);
    }
  }

  private async loadFlags() {
    const key = 'api/flags.json';

    const exist = await s3Service.fileExists(key);

    if (exist) {
      const content = await s3Service.getFile(key);
      const data = JSON.parse(content!);

      this._flags = data;
    } else {
      logger.info(`${key} not found. Creating default storage...`);

      await s3Service.uploadFile(key, JSON.stringify([]), 'application/json');

      this._flags = [];

      logger.info(`${key} created successfully.`);
    }
  }

  private async handleAppFlag(
    result: Record<string, boolean>,
    flag: FeatureFlag,
    installationId: string,
    userId?: string
  ) {
    const installationsCount = this.installations.length;

    if (flag.coverage === 100) {
      result[flag.name] = true;
      return;
    }

    if (flag.coverage === 0) return;

    const foundUser = flag.users.find((rec) => rec === userId);
    const foundInstallation = flag.installations.find(
      (rec) => rec === installationId
    );

    const foundFlag = foundInstallation ?? foundUser;

    if (foundFlag) {
      result[flag.name] = true;
      return;
    }

    const currentCount = flag.installations.length;
    const currentAvg =
      installationsCount === 0 ? 0 : (currentCount * 100) / installationsCount;

    if (currentAvg >= flag.coverage) {
      return;
    }

    result[flag.name] = true;

    const flags = [...this._flags];
    const flagIndex = flags.findIndex((f) => f.id === flag.id);

    if (!foundInstallation) {
      flags[flagIndex].installations.push(installationId);
    }

    if (!foundUser && userId) {
      flags[flagIndex].users.push(userId);
    }

    await this.saveFlags(flags);
  }

  private async handleCongregationFlag(
    result: Record<string, boolean>,
    flag: FeatureFlag,
    installationId: string,
    userId?: string
  ) {
    userId = this._installations.find(i => i.id === installationId)?.user ?? userId

    if (!userId) return;

    const user = userRegistry.findById(userId);
    const congId = user?.profile?.congregation?.id;

    if (!congId) return;

    const cong = congregationRegistry.findById(congId);

    if (!cong) return;

    if (flag.coverage === 100) {
      result[flag.name] = true;
      return;
    }

    const hasFlag = flag.congregations.includes(congId);

    if (hasFlag) {
      result[flag.name] = true;
      return;
    }

    const congsWithFlag = flag.congregations.length;
    const congregationsCount = congregationRegistry.count;

    const currentAvg =
      congregationsCount === 0 ? 0 : (congsWithFlag * 100) / congregationsCount;

    if (currentAvg >= flag.coverage) {
      return;
    }

    result[flag.name] = true;

    const flags = [...this._flags];
    const flagIndex = flags.findIndex((f) => f.id === flag.id);
    flags[flagIndex].congregations.push(congId);

    await this.saveFlags(flags);
  }

  private async handleUserFlag(
    result: Record<string, boolean>,
    flag: FeatureFlag,
    installationId: string,
    userId: string
  ) {
    userId = this._installations.find(i => i.id === installationId)?.user || userId

    if (!userId) return;

    const user = userRegistry.findById(userId);

    if (!user) return;

    if (flag.coverage === 100) {
      result[flag.name] = true;
      return;
    }

    const hasFlag = flag.users.includes(userId);

    if (hasFlag) {
      result[flag.name] = true;
      return;
    }

    const usersWithFlag = flag.users.length;
    const usersCount = userRegistry.count

    const currentAvg =
    usersCount === 0 ? 0 : (usersWithFlag * 100) / usersCount;

    if (currentAvg >= flag.coverage) {
      return;
    }

    result[flag.name] = true;

    const flags = [...this._flags];
    const flagIndex = flags.findIndex((f) => f.id === flag.id);
    flags[flagIndex].users.push(userId);

    await this.saveFlags(flags);
  }

  public async load() {
    try {
      await this.loadSettings();
      await this.loadInstallations();
      await this.loadFlags();

      logger.info(
        `Loaded client minimum version: ${this._clientMinimumVersion}`
      );

      logger.info(`Loaded ${this._installations.length} total installations`);

      logger.info(`Loaded ${this._flags.length} feature flags`);
    } catch (error) {
      logger.error(`Error loading app service::`, error);
    }
  }

  public async evaluateFeatureFlags(installationId: string, userId?: string) {
    const result: Record<string, boolean> = {};
    const enabledFlags = this.flags.filter((record) => record.status);

    for (const flag of enabledFlags) {
      switch (flag.availability) {
        case 'app':
          await this.handleAppFlag(result, flag, installationId, userId);
          break;
        case 'congregation':
          await this.handleCongregationFlag(result, flag, installationId, userId);
          break;
        case 'user':
          await this.handleUserFlag(result, flag, installationId, userId!);
          break;
      }
    }

    return result;
  }

  public async saveFlags(flags: FeatureFlag[]) {
    try {
      const key = 'api/flags.json';

      await s3Service.uploadFile(
        key,
        JSON.stringify(this.flags),
        'application/json'
      );

      this._flags = flags;

      logger.info('Feature flags synchronized to S3');
    } catch (error) {
      logger.error('Error saving feature flags to S3:', error);
      throw error;
    }
  }

  public async saveInstallations(installations: Installation[]) {
    try {
      const key = 'api/installations.json';

      await s3Service.uploadFile(
        key,
        JSON.stringify(installations),
        'application/json'
      );

      this._installations = installations;

      logger.info('Installation registry synchronized to S3');
    } catch (error) {
      logger.error('Error saving installation registry to S3:', error);
      throw error;
    }
  }
}

export const appService = new AppService();
