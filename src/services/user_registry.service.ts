import { logger } from '../utils/index.js';
import { User } from '../models/index.js';
import { s3Service } from './s3.service.js';

class UserRegistry {
	private users: Map<string, User> = new Map();

	get count() {
		return Array.from(this.users.values()).filter((u) => u.profile?.role !== 'admin').length;
	}

	private getUsers() {
		return Array.from(this.users.values());
	}

	public async loadIndex() {
		try {
			const startTime = Date.now();
			logger.info('Indexing users from storage...');

			const folders = await s3Service.listFolders('users/');
			this.users.clear();

			const userIds = folders.map((f) => f.split('/')[1]).filter((id): id is string => !!id);

			// Process in concurrent batches to optimize startup speed
			const CONCURRENCY_LIMIT = 20;
			let processedCount = 0;

			for (let i = 0; i < userIds.length; i += CONCURRENCY_LIMIT) {
				const batch = userIds.slice(i, i + CONCURRENCY_LIMIT);

				await Promise.all(
					batch.map(async (userId) => {
						processedCount++;
						try {
							logger.info(`Indexing user ${userId} (${processedCount}/${userIds.length})...`);
							const user = new User(userId);
							await user.load();
							this.users.set(userId, user);
						} catch (err) {
							logger.error(`Failed to load user ${userId} during indexing:`, err);
						}
					}),
				);
			}

			const duration = ((Date.now() - startTime) / 1000).toFixed(2);
			logger.info(`Successfully indexed ${this.users.size} users in ${duration}s.`);
		} catch (error) {
			logger.error('Failed to load user index:', error);
		}
	}

	public has(id: string) {
		return this.users.has(id);
	}

	public findById(id: string) {
		return this.users.get(id);
	}

	public findByEmail(email: string) {
		const users = this.getUsers()

		return users.find(user => user.email?.toLowerCase() === email.toLowerCase())
	}

	public async performHistoryMaintenance() {
		logger.info('Starting daily history maintenance...');

		const users = this.getUsers();

		let usersCleaned = 0;

		const cutoff = new Date();
		
		cutoff.setMonth(cutoff.getMonth() - 6);

		for (const user of users) {
			try {
				// 1. Maintain History (Mutations)
				const mutations = await user.fetchMutations();
				const { pruned, hasChanged } = user.cleanupMutations(mutations, cutoff);

				if (hasChanged) {
					await user.saveMutations(pruned);
				}

				// 2. Maintain Active Sessions
				// Note: _sessions are already loaded during Registry indexing
				const sessionsPruned = user.cleanupSessions(cutoff);

				if (sessionsPruned) {
					await user.saveSessions(user.sessions);
				}

				if (hasChanged || sessionsPruned) {
					usersCleaned++;
				}
			} catch (error) {
				logger.error(`Failed maintenance for user ${user.id}:`, error);
			}
		}

		logger.info(`History maintenance completed. Cleaned ${usersCleaned} users.`);
	}
}

export const userRegistry = new UserRegistry();
