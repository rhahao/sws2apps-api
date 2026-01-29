import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextFunction, Request, Response } from 'express';
import { clientValidator } from '../../src/middleware/client-validator.middleware.js';

vi.mock('../../src/services/app.service.js', () => ({
  appService: {
    clientMinimumVersion: '2.0.0'
  }
}));

vi.mock('../../src/utils/logger.js');

describe('clientValidator Middleware', () => {
  let mockReq: Request;
  let mockRes: Response;
  let next: NextFunction;

  beforeEach(() => {
    vi.clearAllMocks();
    mockReq = { headers: {} } as Request
    mockRes = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis()
    } as unknown as Response
    next = vi.fn();
  });

  it('should call next() if appclient is not "Organized"', () => {
    mockReq.headers = { appclient: 'WebBrowser', appversion: '1.0.0' };
    
    clientValidator(mockReq, mockRes, next);

    expect(next).toHaveBeenCalled();
    expect(mockRes.status).not.toHaveBeenCalled();
  });

  it('should call next() if version is equal to or greater than minimum', () => {
    mockReq.headers = { appclient: 'Organized', appversion: '2.0.0' };
    
    clientValidator(mockReq, mockRes, next);

    expect(next).toHaveBeenCalled();
  });

  it('should return 426 if version is outdated', () => {
    mockReq.headers = { appclient: 'Organized', appversion: '1.9.9' };

    clientValidator(mockReq, mockRes, next);

    expect(mockRes.status).toHaveBeenCalledWith(426);
    expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
      success: false,
      error: expect.objectContaining({
        code: 'api.client.upgrade_required',
        minimumVersion: '2.0.0'
      })
    }));
    expect(next).not.toHaveBeenCalled();
  });

  it('should handle malformed versions safely', () => {
    mockReq.headers = { appclient: 'Organized', appversion: 'not-a-version' };
    
    clientValidator(mockReq, mockRes, next);

    expect(mockRes.status).toHaveBeenCalledWith(426);
  });
});