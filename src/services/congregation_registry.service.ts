import { s3Service } from './s3.service.js';
import { logger } from '../utils/index.js';
import { Congregation } from '../models/index.js';

class CongregationRegistry {
	private congregations: Map<string, Congregation> = new Map();

	get count() {
		return this.congregations.size;
	}

	async loadIndex() {
		try {
			logger.info('Indexing congregations from storage...');
			const folders = await s3Service.listFolders('congregations/');

			this.congregations.clear();
			for (const folder of folders) {
				const congId = folder.split('/')[1];
				if (congId) {
					try {
						const cong = new Congregation(congId);
						// We load details on demand or during full sync if needed
						// For now, we just index the ID
						this.congregations.set(congId, cong);
					} catch (err) {
						logger.error(`Failed to index congregation ${congId}:`, err);
					}
				}
			}

			logger.info(`Successfully indexed ${this.congregations.size} congregations.`);
		} catch (error) {
			logger.error('Failed to load congregation index:', error);
		}
	}

	getCongregations() {
		return Array.from(this.congregations.values());
	}

	hasCongregation(id: string) {
		return this.congregations.has(id);
	}

	findById(id: string) {
		return this.congregations.get(id);
	}
}

export const congregationRegistry = new CongregationRegistry();
