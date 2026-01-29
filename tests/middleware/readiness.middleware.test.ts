import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextFunction, Request, Response } from 'express';
import { readinessGuard } from '../../src/middleware/readiness.middleware.js';
import { appService } from '../../src/services/index.js';

vi.mock('../../src/services/app.service.js', () => ({
  appService: {
    isReady: false,
  },
}));

describe('readinessGuard Middleware', () => {
  let mockRes: Response;
  let next: NextFunction;

  beforeEach(() => {
    vi.clearAllMocks();

    mockRes = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    } as unknown as Response;

    next = vi.fn();
  });

  it('should allow /health check even if not ready', () => {
    const mockReq = { path: '/health' } as Request;

    appService.isReady = false;

    readinessGuard(mockReq, mockRes, next);

    expect(next).toHaveBeenCalled();
  });

  it('should return 503 if system is not ready', () => {
    const mockReq = { path: '/api/data' } as Request;

    appService.isReady = false;

    readinessGuard(mockReq, mockRes, next);

    expect(mockRes.status).toHaveBeenCalledWith(503);
    expect(mockRes.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.objectContaining({
          code: 'api.server.not_ready',
        }),
      })
    );
  });

  it('should call next() if system is ready', () => {
    const mockReq = { path: '/api/data' } as Request;

    appService.isReady = true;

    readinessGuard(mockReq, mockRes, next);

    expect(next).toHaveBeenCalled();
  });
});
