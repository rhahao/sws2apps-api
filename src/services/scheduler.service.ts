import type API from '../types/index.js';
import Utility from '../utils/index.js';

class SchedulerService {
  private tasks: Map<string, API.ScheduledTask> = new Map();
  // Store timers so we can clear them later
  private timers: Map<string, NodeJS.Timeout[]> = new Map();

  register(task: API.ScheduledTask) {
    if (this.tasks.has(task.name)) {
      Utility.Logger.warn(
        `Task [${task.name}] is already registered. Skipping.`
      );
      return;
    }

    this.tasks.set(task.name, task);
    this.timers.set(task.name, []);

    if (task.runOnInit) {
      const startDelay = Math.floor(Math.random() * 5000) + 1000;
      const initTimer = setTimeout(() => this._executeTask(task), startDelay);
      this.timers.get(task.name)?.push(initTimer);
    }

    const intervalTimer = setInterval(
      () => this._executeTask(task),
      task.interval
    );
    this.timers.get(task.name)?.push(intervalTimer);

    Utility.Logger.info(
      `Task [${task.name}] registered (Interval: ${task.interval / 1000 / 60}m)`
    );
  }

  /**
   * Stops and removes all registered tasks and clears their timers.
   */
  stopAll() {
    for (const taskName of this.tasks.keys()) {
      const taskTimers = this.timers.get(taskName) || [];
      taskTimers.forEach((timer) => clearInterval(timer));
      this.timers.delete(taskName);
    }
    this.tasks.clear();
    Utility.Logger.info('All scheduled tasks have been stopped.');
  }

  private async _executeTask(task: API.ScheduledTask) {
    try {
      Utility.Logger.info(`Executing scheduled task: ${task.name}...`);
      await task.run();
      Utility.Logger.info(`Task [${task.name}] executed successfully.`);
    } catch (error) {
      Utility.Logger.error(
        `Error executing scheduled task [${task.name}]:`,
        error
      );
    }
  }
}

export default new SchedulerService();
