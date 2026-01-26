import { FeatureFlag, LinkedInstallation, RawInstallationItem, InstallationItem } from '../types/index.js';
import { logger } from '../utils/index.js';
import { s3Service } from './s3.service.js';

class AppService {
	public clientMinimumVersion = '0.0.0';
	public isReady = false;
	public flags: FeatureFlag[] = [];
	public installations = {
		all: [] as InstallationItem[],
		linked: [] as LinkedInstallation[],
		pending: [] as RawInstallationItem[],
	};

	/**
	 * Refreshes the flattened handled installations list for fast lookups.
	 */
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
			await s3Service.uploadFile(key, JSON.stringify(this.flags), 'application/json');
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
