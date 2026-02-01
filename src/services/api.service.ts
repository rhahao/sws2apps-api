import type API from '../types/index.js';
import Config from '../config/index.js';
import Congregations from './congregations.service.js';
import Storage from '../storages/index.js';
import Users from './users.service.js';
import Utility from '../utils/index.js';
import Seeder from './seeder.service.js';
import Scheduler from './scheduler.service.js';

class ApiService {
  public isReady = false;
  private _settings = {} as API.Settings;
  private _flags: API.FeatureFlag[] = [];
  private _installations: API.Installation[] = [];

  public get flags() {
    return this._flags;
  }

  public get installations() {
    return this._installations;
  }

  public get settings() {
    return this._settings;
  }

  public async saveSettings(settings: API.Settings) {
    await Storage.API.saveSettings(settings);

    this._settings = settings;
  }

  public async saveFlags(flags: API.FeatureFlag[]) {
    await Storage.API.saveFlags(flags);

    this._flags = flags;
  }

  public async saveInstallations(installations: API.Installation[]) {
    await Storage.API.saveInstallations(installations);

    this._installations = installations;
  }

  private async loadSettings() {
    const settings = await Storage.API.getSettings();
    const exist = Object.keys(settings).length > 0;

    if (exist) {
      this._settings = settings;
    } else {
      Utility.Logger.info(`Creating default settings...`);

      const settings = { clientMinimumVersion: '1.0.0' };
      await this.saveSettings(settings);

      Utility.Logger.info(`Setings created successfully.`);
    }
  }

  private async loadInstallations() {
    const installations = await Storage.API.getInstallations();
    const exist = Object.keys(installations).length > 0;

    if (exist) {
      this._installations = installations;
    } else {
      Utility.Logger.info(`Creating default installations...`);

      await this.saveInstallations([]);

      Utility.Logger.info(`Installations created successfully.`);
    }
  }

  private async loadFlags() {
    const flags = await Storage.API.getFlags();
    const exist = Object.keys(flags).length > 0;

    if (exist) {
      this._flags = flags;
    } else {
      Utility.Logger.info(`Creating default flags...`);

      await this.saveFlags([]);

      Utility.Logger.info(`Flags created successfully.`);
    }
  }

  private handleFlagAssign(
    result: Record<string, boolean>,
    flag: API.FeatureFlag,
    installationId: string,
    userId?: string
  ) {
    userId =
      this._installations.find((i) => i.id === installationId)?.user ?? userId;

    if (flag.availability !== 'app' && !userId) return false;

    const user = userId ? Users.findById(userId) : undefined;
    const congId = user?.profile?.congregation?.id;

    if (flag.availability === 'user' && !userId) return false;

    if (flag.availability === 'congregation' && !congId) return false;

    const totalCounts = {
      app: this._installations.length,
      congregation: Congregations.count,
      user: Users.count,
    };

    const collectionMap = {
      app: flag.installations,
      congregation: flag.congregations,
      user: flag.users,
    };

    const entityMap = {
      app: installationId,
      congregation: congId,
      user: userId,
    };

    const collection = collectionMap[flag.availability];
    const entity = entityMap[flag.availability]!;

    const hasFlag = collection.includes(entity);

    if (hasFlag) {
      result[flag.name] = true;
      return false;
    }

    const totalCount = totalCounts[flag.availability];
    const currentCount = collection.length;

    const currentAvg = totalCount === 0 ? 0 : (currentCount * 100) / totalCount;

    if (currentAvg >= flag.coverage) return false;

    result[flag.name] = true;

    collection.push(entity);

    return true;
  }

  public async load() {
    try {
      await Storage.ensureBucketExists();

      Utility.Logger.info(`Initializing storage for bucket: ${Config}...`);

      // Index users and congregations
      await Users.loadIndex();
      await Congregations.loadIndex();

      // Run development seeder (skips in production)
      await Seeder.runDevelopment();

      // Register Background Tasks
      Scheduler.register({
        name: 'User History Maintenance',
        interval: 24 * 60 * 60 * 1000, // 24 Hours
        runOnInit: true,
        run: () => Users.performHistoryMaintenance(),
      });

      Utility.Logger.info('Storage initialization completed successfully.');

      await this.loadSettings();
      await this.loadInstallations();
      await this.loadFlags();

      Utility.Logger.info(
        `Loaded client minimum version: ${this._settings.clientMinimumVersion}`
      );

      Utility.Logger.info(
        `Loaded ${this._installations.length} total installations`
      );

      Utility.Logger.info(`Loaded ${this._flags.length} feature flags`);
    } catch (error) {
      Utility.Logger.error(`Error loading app service::`, error);
    }
  }

  public async evaluateFeatureFlags(installationId: string, userId?: string) {
    const result: Record<string, boolean> = {};

    let hasChanges = false;

    const tmpFlags = structuredClone(this._flags);

    for (const flag of tmpFlags) {
      if (!flag.status) continue;

      if (flag.coverage === 0) continue;

      if (flag.coverage === 100) {
        result[flag.name] = true;
        continue;
      }

      const checkResult = this.handleFlagAssign(
        result,
        flag,
        installationId,
        userId
      );

      if (!hasChanges && checkResult) {
        hasChanges = true;
      }
    }

    if (hasChanges) {
      await this.saveFlags(tmpFlags);
    }

    return result;
  }
}

export default new ApiService();
