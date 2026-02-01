import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextFunction, Request, Response } from 'express';
import { readinessGuard } from '../../src/middleware/readiness.middleware.js';
import Service from '../../src/services/index.js';

// The middleware uses Service.API.isReady, so we mock the index service
vi.mock('../../src/services/index.js', () => ({
  default: {
    API: {
      isReady: false, // Default state for tests
    },
  },
}));

describe('readinessGuard Middleware', () => {
  let mockRes: Partial<Response>;
  let next: NextFunction;

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset the mock's state before each test
    Service.API.isReady = false;
    mockRes = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    };
    next = vi.fn();
  });

  it('should allow /health check even if not ready', () => {
    const mockReq = { path: '/health' } as Request;

    readinessGuard(mockReq, mockRes as Response, next);

    expect(next).toHaveBeenCalled();
    expect(mockRes.status).not.toHaveBeenCalled();
  });

  it('should return 503 if system is not ready and path is not /health', () => {
    const mockReq = { path: '/api/data' } as Request;

    readinessGuard(mockReq, mockRes as Response, next);

    expect(mockRes.status).toHaveBeenCalledWith(503);
    expect(mockRes.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.objectContaining({
          code: 'api.server.not_ready',
        }),
      })
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('should call next() if system is ready', () => {
    const mockReq = { path: '/api/data' } as Request;
    Service.API.isReady = true; // Set state to ready for this test

    readinessGuard(mockReq, mockRes as Response, next);

    expect(next).toHaveBeenCalled();
    expect(mockRes.status).not.toHaveBeenCalled();
  });
});
