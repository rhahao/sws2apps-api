import { describe, it, expect, vi, beforeEach, Mock } from 'vitest';
import { Request, Response } from 'express';
import { getFeatureFlags } from '../../src/controllers/app.controller.js';
import { appService } from '../../src/services/app.service.js';
import { Installation } from '../../src/types/app.types.js';

// Mock the config for logger
vi.mock('../../src/config/index.js');
vi.mock('../../src/utils/logger.js');
vi.mock('../../src/services/app.service.js');
vi.mock('../../src/services/s3.service.js');

describe('getFeatureFlags', () => {
  let req: Partial<Request>;
  let res: Partial<Response>;
  let json: Mock;
  let status: Mock;

  beforeEach(() => {
    json = vi.fn();
    status = vi.fn(() => ({ json }));
    res = { status };

    vi.clearAllMocks();
  });

  it('should register a new installation if it does not exist', async () => {
    const installationId = 'new-inst';
    const userId = 'user-id';

    req = { headers: { installation: installationId, user: userId } };

    // Mock the getter to return an empty array for this test
    vi.spyOn(appService, 'installations', 'get').mockReturnValue([]);

    const mockFlags = { FLAG_NAME: true };

    (appService.evaluateFeatureFlags as Mock).mockResolvedValue(mockFlags);

    await getFeatureFlags(req as Request, res as Response);

    const { calls } = (appService.saveInstallations as Mock).mock;

    const installations = calls[0][0] as Installation[];

    expect(installations).toHaveLength(1);
    expect(installations.at(0)!.id).toBe(installationId);
    expect(installations.at(0)!.user).toBe(userId);

    expect(status).toHaveBeenCalledWith(200);
    expect(json).toHaveBeenCalledWith(mockFlags);
  });

  it('should return feature flags but NOT save the installation if it already exists', async () => {
    const installationId = 'existing-inst';
    const userId = 'user-123';

    req = {
      headers: {
        installation: installationId,
        user: userId,
      },
    };

    // 1. Mock the registry so the installation IS found
    const existingInstallations: Installation[] = [
      {
        id: installationId,
        user: userId,
        last_used: new Date().toISOString(),
      },
    ];

    vi.spyOn(appService, 'installations', 'get').mockReturnValue(
      existingInstallations
    );

    // 2. Mock the service to return flags
    const mockFlags = { NEW_FEATURE: true };

    (appService.evaluateFeatureFlags as Mock).mockResolvedValue(mockFlags);

    await getFeatureFlags(req as Request, res as Response);

    // 3. ASSERTIONS
    // Ensure we DID NOT call save
    expect(appService.saveInstallations).not.toHaveBeenCalled();

    // Ensure we still got a 200 and the flags
    expect(status).toHaveBeenCalledWith(200);
    expect(json).toHaveBeenCalledWith(mockFlags);
  });
});
