import { ScheduledTask } from '../types/index.js';
import { logger } from '../utils/index.js';

class SchedulerService {
  private tasks: Map<string, ScheduledTask> = new Map();
  // Store timers so we can clear them later
  private timers: Map<string, NodeJS.Timeout[]> = new Map();

  register(task: ScheduledTask) {
    if (this.tasks.has(task.name)) {
      logger.warn(`Task [${task.name}] is already registered. Skipping.`);
      return;
    }

    this.tasks.set(task.name, task);
    this.timers.set(task.name, []);

    if (task.runOnInit) {
      const startDelay = Math.floor(Math.random() * 5000) + 1000;
      const initTimer = setTimeout(() => this._executeTask(task), startDelay);
      this.timers.get(task.name)?.push(initTimer);
    }

    const intervalTimer = setInterval(() => this._executeTask(task), task.interval);
    this.timers.get(task.name)?.push(intervalTimer);

    logger.info(`Task [${task.name}] registered (Interval: ${task.interval / 1000 / 60}m)`);
  }

  /**
   * Stops and removes all registered tasks and clears their timers.
   */
  stopAll() {
    for (const taskName of this.tasks.keys()) {
      const taskTimers = this.timers.get(taskName) || [];
      taskTimers.forEach(timer => clearInterval(timer));
      this.timers.delete(taskName);
    }
    this.tasks.clear();
    logger.info('All scheduled tasks have been stopped.');
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