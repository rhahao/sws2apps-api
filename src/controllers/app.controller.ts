import { Request, Response } from 'express';
import { logger } from '../utils/index.js';
import { appService, congregationRegistry, userRegistry } from '../services/index.js';

/**
 * Controller to handle application-wide metadata and flags
 */
export const getFeatureFlags = async (req: Request, res: Response) => {
	try {
		const installationId = req.headers['installation_id'] as string;
		let userId = req.headers['user'] as string | undefined;

		const usersCount = userRegistry.getUsersCount();
		const congregationsCount = congregationRegistry.getCongregationsCount();
		const installationsCount = appService.installations.all.length;

		const result: Record<string, boolean> = {};

		// Get enabled flags (globally active)
		const enabledFlags = appService.flags.filter((record) => record.status);

		for (const flag of enabledFlags) {
			// 1. Target: APP flag
			if (flag.availability === 'app') {
				if (flag.coverage === 100) {
					result[flag.name] = true;
					continue;
				}

				if (flag.coverage === 0) continue;

				const findInstallation = flag.installations.find((rec) => rec.id === installationId);

				if (findInstallation) {
					result[flag.name] = true;
				} else {
					// Check rollout coverage
					const currentCount = flag.installations.length;
					const currentAvg = installationsCount === 0 ? 0 : (currentCount * 100) / installationsCount;

					if (currentAvg < flag.coverage) {
						result[flag.name] = true;

						// Persist the installation to this flag's list
						flag.installations.push({
							id: installationId,
							registered: new Date().toISOString(),
							status: 'pending', // Initial status
						});

						await appService.saveFlags();
					}
				}
				continue;
			}

			// Resolve User ID if not provided but known from installation
			const knownInstallation = appService.installations.all.find((i) => i.id === installationId);
			userId = userId || knownInstallation?.user;

			// 2. Target: CONGREGATION flag
			if (flag.availability === 'congregation' && userId) {
				const user = userRegistry.findById(userId);
				const congId = user?.profile?.congregation?.id;

				if (congId) {
					const cong = congregationRegistry.findById(congId);

					if (cong) {
						const hasFlag = cong.flags.includes(flag.id);

						if (hasFlag) {
							result[flag.name] = true;
						} else {
							// Check rollout coverage for congregations
							if (flag.coverage === 100) {
								result[flag.name] = true;
								await cong.saveFlags([...cong.flags, flag.id]);
							} else if (flag.coverage > 0) {
								const congsWithFlag = congregationRegistry.getCongregations().filter((c) => c.flags.includes(flag.id)).length;
								const currentAvg = congregationsCount === 0 ? 0 : (congsWithFlag * 100) / congregationsCount;

								if (currentAvg < flag.coverage) {
									result[flag.name] = true;
									await cong.saveFlags([...cong.flags, flag.id]);
								}
							}
						}
					}
				}
			}

			// 3. Target: USER flag
			if (flag.availability === 'user' && userId) {
				const user = userRegistry.findById(userId);
				if (user) {
					const hasFlag = user.flags?.includes(flag.id);

					if (hasFlag) {
						result[flag.name] = true;
					} else {
						// Check rollout coverage for users
						if (flag.coverage === 100) {
							result[flag.name] = true;
							await user.updateFlags([...(user.flags || []), flag.id]);
						} else if (flag.coverage > 0) {
							const usersWithFlag = userRegistry.getUsers().filter((u) => u.flags?.includes(flag.id)).length;
							const currentAvg = usersCount === 0 ? 0 : (usersWithFlag * 100) / usersCount;

							if (currentAvg < flag.coverage) {
								result[flag.name] = true;
								await user.updateFlags([...(user.flags || []), flag.id]);
							}
						}
					}
				}
			}
		}

		// --- Update Installation Registry ---
		const findInstallation = appService.installations.all.find((i) => i.id === installationId);

		let needsSave = false;

		// A. New installation with User ID -> CREATE LINKED
		if (!findInstallation && userId) {
			appService.installations.linked.push({
				user: userId,
				installations: [{ id: installationId, registered: new Date().toISOString() }],
			});
			needsSave = true;
		}

		// B. New installation without User ID -> CREATE PENDING
		if (!findInstallation && !userId) {
			appService.installations.pending.push({
				id: installationId,
				registered: new Date().toISOString(),
			});
			needsSave = true;
		}

		// C. Existing pending installation now has User ID -> MIGRATE TO LINKED
		if (findInstallation?.status === 'pending' && userId) {
			appService.installations.pending = appService.installations.pending.filter((i) => i.id !== installationId);

			const userGroup = appService.installations.linked.find((l) => l.user === userId);
			if (userGroup) {
				userGroup.installations.push({
					id: installationId,
					registered: new Date().toISOString(),
				});
			} else {
				appService.installations.linked.push({
					user: userId,
					installations: [{ id: installationId, registered: new Date().toISOString() }],
				});
			}
			needsSave = true;
		}

		if (needsSave) {
			await appService.saveInstallations();
		}

		logger.info(`Feature flags fetched for installation ${installationId}`);
		res.status(200).json(result);
	} catch (error) {
		logger.error('Error fetching feature flags:', error);
		res.status(500).json({
			success: false,
			error: {
				message: 'Internal server error',
				code: 'api.server.internal_error',
			},
		});
	}
};
