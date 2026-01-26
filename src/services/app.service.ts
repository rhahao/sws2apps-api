import {
  FeatureFlag,
  LinkedInstallation,
  RawInstallationItem,
  InstallationItem,
} from '../types/index.js';
import { logger } from '../utils/index.js';
import { s3Service } from './s3.service.js';
import { userRegistry } from './user_registry.service.js';
import { congregationRegistry } from './congregation_registry.service.js';

class AppService {
  public clientMinimumVersion = '0.0.0';
  public isReady = false;
  public flags: FeatureFlag[] = [];
  public installations = {
    all: [] as InstallationItem[],
    linked: [] as LinkedInstallation[],
    pending: [] as RawInstallationItem[],
  };

  // Refactored feature flag evaluation logic
  async evaluateFeatureFlags(installationId: string, userId?: string) {
    const result: Record<string, boolean> = {};
    const enabledFlags = this.flags.filter((record) => record.status);

    for (const flag of enabledFlags) {
      switch (flag.availability) {
        case 'app':
          await this._handleAppFlag(flag, installationId, result);
          break;
        case 'congregation':
          await this._handleCongregationFlag(flag, userId, result);
          break;
        case 'user':
          await this._handleUserFlag(flag, userId, result);
          break;
      }
    }

    return result;
  }

  // Helper function to handle app-level feature flags
  private async _handleAppFlag(
    flag: FeatureFlag,
    installationId: string,
    result: Record<string, boolean>
  ) {
    const installationsCount = this.installations.all.length;

    if (flag.coverage === 100) {
      result[flag.name] = true;
      return;
    }

    if (flag.coverage === 0) return;

    const findInstallation = flag.installations.find(
      (rec) => rec.id === installationId
    );

    if (findInstallation) {
      result[flag.name] = true;
    } else {
      const currentCount = flag.installations.length;
      const currentAvg =
        installationsCount === 0
          ? 0
          : (currentCount * 100) / installationsCount;

      if (currentAvg < flag.coverage) {
        result[flag.name] = true;

        flag.installations.push({
          id: installationId,
          registered: new Date().toISOString(),
          status: 'pending',
        });

        await this.saveFlags();
      }
    }
  }

  // Helper function to handle congregation-level feature flags
  private async _handleCongregationFlag(
    flag: FeatureFlag,
    userId: string | undefined,
    result: Record<string, boolean>
  ) {
    if (!userId) return;

    const user = userRegistry.findById(userId);
    const congId = user?.profile?.congregation?.id;

    if (!congId) return;

    const cong = congregationRegistry.findById(congId);
    if (!cong) return;

    const congregationsCount = congregationRegistry.getCongregationsCount();
    const hasFlag = cong.flags.includes(flag.id);

    if (hasFlag) {
      result[flag.name] = true;
      return;
    }

    if (flag.coverage === 100) {
      result[flag.name] = true;
      await cong.saveFlags([...cong.flags, flag.id]);
    } else if (flag.coverage > 0) {
      const congsWithFlag = congregationRegistry
        .getCongregations()
        .filter((c) => c.flags.includes(flag.id)).length;
      const currentAvg =
        congregationsCount === 0
          ? 0
          : (congsWithFlag * 100) / congregationsCount;

      if (currentAvg < flag.coverage) {
        result[flag.name] = true;
        await cong.saveFlags([...cong.flags, flag.id]);
      }
    }
  }

  // Helper function to handle user-level feature flags
  private async _handleUserFlag(
    flag: FeatureFlag,
    userId: string | undefined,
    result: Record<string, boolean>
  ) {
    if (!userId) return;

    const user = userRegistry.findById(userId);
    if (!user) return;

    const usersCount = userRegistry.getUsersCount();
    const hasFlag = user.flags?.includes(flag.id);

    if (hasFlag) {
      result[flag.name] = true;
      return;
    }

    if (flag.coverage === 100) {
      result[flag.name] = true;
      await user.updateFlags([...(user.flags || []), flag.id]);
    } else if (flag.coverage > 0) {
      const usersWithFlag = userRegistry
        .getUsers()
        .filter((u) => u.flags?.includes(flag.id)).length;
      const currentAvg =
        usersCount === 0 ? 0 : (usersWithFlag * 100) / usersCount;

      if (currentAvg < flag.coverage) {
        result[flag.name] = true;
        await user.updateFlags([...(user.flags || []), flag.id]);
      }
    }
  }

  // Refactored installation registry update logic
  async updateInstallationRegistry(installationId: string, userId?: string) {
    const findInstallation = this.installations.all.find(
      (i) => i.id === installationId
    );
    let needsSave = false;

    if (!findInstallation && userId) {
      this.installations.linked.push({
        user: userId,
        installations: [
          { id: installationId, registered: new Date().toISOString() },
        ],
      });
      needsSave = true;
    } else if (!findInstallation && !userId) {
      this.installations.pending.push({
        id: installationId,
        registered: new Date().toISOString(),
      });
      needsSave = true;
    } else if (findInstallation?.status === 'pending' && userId) {
      this.installations.pending = this.installations.pending.filter(
        (i) => i.id !== installationId
      );

      const userGroup = this.installations.linked.find(
        (l) => l.user === userId
      );
      if (userGroup) {
        userGroup.installations.push({
          id: installationId,
          registered: new Date().toISOString(),
        });
      } else {
        this.installations.linked.push({
          user: userId,
          installations: [
            { id: installationId, registered: new Date().toISOString() },
          ],
        });
      }
      needsSave = true;
    }

    if (needsSave) {
      await this.saveInstallations();
    }
  }

  public processInstallations(): void {
    const result: InstallationItem[] = [];

    for (const user of this.installations.linked) {
      for (const installation of user.installations) {
        result.push({
          id: installation.id,
          registered: installation.registered,
          status: 'linked',
          user: user.user,
        });
      }
    }

    for (const installation of this.installations.pending) {
      result.push({
        id: installation.id,
        registered: installation.registered,
        status: 'pending',
      });
    }

    this.installations.all = result;
  }

  public async saveFlags(): Promise<void> {
    try {
      const key = 'api/flags.json';
      await s3Service.uploadFile(
        key,
        JSON.stringify(this.flags),
        'application/json'
      );
      logger.info('Feature flags synchronized to S3');
    } catch (error) {
      logger.error('Error saving feature flags to S3:', error);
      throw error;
    }
  }

  public async saveInstallations(): Promise<void> {
    try {
      const key = 'api/installations.json';
      const data = {
        linked: this.installations.linked,
        pending: this.installations.pending,
      };
      await s3Service.uploadFile(key, JSON.stringify(data), 'application/json');
      this.processInstallations(); // Refresh local flattened list
      logger.info('Installation registry synchronized to S3');
    } catch (error) {
      logger.error('Error saving installation registry to S3:', error);
      throw error;
    }
  }
}

export const appService = new AppService();
