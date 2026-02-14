import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import schedulerService from '../../src/services/scheduler.service.js';
import Utility from '../../src/utils/index.js';

vi.mock('../../src/utils/index.js');

describe('SchedulerService', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should register a task and schedule its interval', async () => {
    const mockTask = {
      name: 'maintenance',
      interval: 60000, // 1 minute
      run: vi.fn().mockResolvedValue(undefined),
      runOnInit: false,
    };

    schedulerService.register(mockTask);

    // Fast-forward 1 minute
    await vi.advanceTimersByTimeAsync(60000);

    expect(mockTask.run).toHaveBeenCalledTimes(1);
    expect(Utility.Logger.info).toHaveBeenCalledWith(expect.stringContaining('Task [maintenance] registered'));
  });

  it('should respect the runOnInit flag with a random delay', async () => {
    const mockTask = {
      name: 'init-task',
      interval: 3600000,
      run: vi.fn().mockResolvedValue(undefined),
      runOnInit: true,
    };

    schedulerService.register(mockTask);

    // After registration, it shouldn't have run immediately
    expect(mockTask.run).not.toHaveBeenCalled();

    // Fast-forward 6 seconds (max possible random delay + buffer)
    await vi.advanceTimersByTimeAsync(6000);

    expect(mockTask.run).toHaveBeenCalledTimes(1);
  });

  it('should prevent duplicate registration', () => {
    const mockTask = {
      name: 'unique-task',
      interval: 1000,
      run: vi.fn(),
    };

    schedulerService.register(mockTask);
    schedulerService.register(mockTask); // Second call

    expect(Utility.Logger.warn).toHaveBeenCalledWith(expect.stringContaining('already registered'));
  });

  it('should continue scheduling even if the task fails', async () => {
    const failingTask = {
      name: 'failing-task',
      interval: 1000,
      run: vi.fn()
        .mockRejectedValueOnce(new Error('First fail'))
        .mockResolvedValue(undefined),
    };

    schedulerService.register(failingTask);

    // Jump 1 second for first run (fail)
    await vi.advanceTimersByTimeAsync(1000);
    expect(Utility.Logger.error).toHaveBeenCalledWith(expect.stringContaining('Error'), expect.any(Error));

    // Jump another 1 second for second run (success)
    await vi.advanceTimersByTimeAsync(1000);
    expect(failingTask.run).toHaveBeenCalledTimes(2);
  });
});

describe('SchedulerService Cleanup', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    schedulerService.stopAll();
    vi.useRealTimers();
  });

  it('should stop all tasks and prevent further execution', async () => {
    const mockTask = {
      name: 'cleanup-test',
      interval: 1000,
      run: vi.fn().mockResolvedValue(undefined),
    };

    schedulerService.register(mockTask);

    // Run once
    await vi.advanceTimersByTimeAsync(1000);
    expect(mockTask.run).toHaveBeenCalledTimes(1);

    // Stop everything
    schedulerService.stopAll();

    // Advance time again - should NOT run a second time
    await vi.advanceTimersByTimeAsync(1000);
    expect(mockTask.run).toHaveBeenCalledTimes(1);
  });
});