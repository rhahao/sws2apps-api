
import { describe, it, expect, vi, beforeEach, Mock } from 'vitest';
import { Request, Response } from 'express';
import { getFeatureFlags } from '../../src/controllers/app.controller.js';
import { appService } from '../../src/services/app.service.js';

// Mock S3 config
vi.mock('../../src/config/s3.config.js', () => ({
  config: {
    S3: {
      bucketName: 'test-bucket',
      region: 'us-east-1',
      accessKeyId: 'test-key',
      secretAccessKey: 'test-secret',
    },
  },
}));

// Mock services
vi.mock('../../src/services/app.service.js', () => ({
  appService: {
    installations: { all: [] },
    evaluateFeatureFlags: vi.fn(),
    updateInstallationRegistry: vi.fn(),
  },
}));

// Mock logger
vi.mock('../../src/utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
  },
}));

describe('getFeatureFlags', () => {
  let req: Partial<Request>;
  let res: Partial<Response>;
  let json: Mock;
  let status: Mock;

  beforeEach(() => {
    json = vi.fn();
    status = vi.fn(() => ({ json }));

    req = {
      headers: {
        'installation': 'test-installation-id',
        'user': 'test-user-id',
      },
    };

    res = { status };

    vi.clearAllMocks();

    (appService.installations.all as any) = [];
  });

  it('should call services and return feature flags on success', async () => {
    const mockFlags = { 'new-feature': true };
    (appService.evaluateFeatureFlags as Mock).mockResolvedValue(mockFlags);
    (appService.updateInstallationRegistry as Mock).mockResolvedValue(undefined);

    await getFeatureFlags(req as Request, res as Response);

    expect(appService.evaluateFeatureFlags).toHaveBeenCalledWith('test-installation-id', 'test-user-id');
    expect(appService.updateInstallationRegistry).toHaveBeenCalledWith('test-installation-id', 'test-user-id');

    expect(status).toHaveBeenCalledWith(200);
    expect(json).toHaveBeenCalledWith(mockFlags);
  });

  it('should derive userId from known installation if not in header', async () => {
    const mockFlags = { 'another-feature': false };
    req.headers = { 'installation': 'known-installation-id' }; // No user header

    (appService.installations.all as any) = [{ id: 'known-installation-id', user: 'derived-user-id', status: 'linked' }];

    (appService.evaluateFeatureFlags as Mock).mockResolvedValue(mockFlags);

    await getFeatureFlags(req as Request, res as Response);

    expect(appService.evaluateFeatureFlags).toHaveBeenCalledWith('known-installation-id', 'derived-user-id');
    expect(appService.updateInstallationRegistry).toHaveBeenCalledWith('known-installation-id', 'derived-user-id');

    expect(status).toHaveBeenCalledWith(200);
    expect(json).toHaveBeenCalledWith(mockFlags);
  });


  it('should handle errors gracefully', async () => {
    const error = new Error('Something went wrong');
    (appService.evaluateFeatureFlags as Mock).mockRejectedValue(error);

    await getFeatureFlags(req as Request, res as Response);

    expect(status).toHaveBeenCalledWith(500);
    expect(json).toHaveBeenCalledWith({
      success: false,
      error: {
        message: 'Internal server error',
        code: 'api.server.internal_error',
      },
    });
  });
});
