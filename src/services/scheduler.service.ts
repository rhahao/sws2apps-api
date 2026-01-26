import { ScheduledTask } from '../types/index.js';
import { logger } from '../utils/index.js';

class SchedulerService {
	private tasks: Map<string, ScheduledTask> = new Map();

	/**
	 * Register a recurring task with the scheduler.
	 */
	register(task: ScheduledTask) {
		if (this.tasks.has(task.name)) {
			logger.warn(`Task [${task.name}] is already registered. Skipping.`);
			return;
		}

		this.tasks.set(task.name, task);

		// Initial run if requested
		if (task.runOnInit) {
			// Small random delay to prevent startup thundering herd
			const startDelay = Math.floor(Math.random() * 5000) + 1000;
			setTimeout(() => this._executeTask(task), startDelay);
		}

		// Schedule recurring interval
		setInterval(() => this._executeTask(task), task.interval);

		logger.info(`Task [${task.name}] registered (Interval: ${task.interval / 1000 / 60}m)`);
	}

	private async _executeTask(task: ScheduledTask) {
		try {
			logger.info(`Executing scheduled task: ${task.name}...`);
			await task.run();
			logger.info(`Task [${task.name}] executed successfully.`);
		} catch (error) {
			logger.error(`Error executing scheduled task [${task.name}]:`, error);
		}
	}
}

export const schedulerService = new SchedulerService();
