import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextFunction, Request, Response } from 'express';
import { clientValidator } from '../../src/middleware/client-validator.middleware.js';

// The middleware uses Service.API.settings, so we mock the index service
vi.mock('../../src/services/index.js', () => ({
  default: {
    API: {
      settings: {
        clientMinimumVersion: '2.0.0'
      }
    }
  }
}));

vi.mock('../../src/utils/logger.js');

describe('clientValidator Middleware', () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let next: NextFunction;

  beforeEach(() => {
    vi.clearAllMocks();
    mockReq = { headers: {} };
    mockRes = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis()
    };
    next = vi.fn();
  });

  it('should call next() if appclient is not "Organized"', () => {
    mockReq.headers = { appclient: 'WebBrowser', appversion: '1.0.0' };
    
    clientValidator(mockReq as Request, mockRes as Response, next);

    expect(next).toHaveBeenCalled();
    expect(mockRes.status).not.toHaveBeenCalled();
  });

  describe('when appclient is "Organized"', () => {
    beforeEach(() => {
      mockReq.headers = { ...mockReq.headers, appclient: 'Organized' };
    });

    it('should call next() if version is equal to minimum', () => {
      mockReq.headers!.appversion = '2.0.0';
      clientValidator(mockReq as Request, mockRes as Response, next);
      expect(next).toHaveBeenCalled();
    });

    it('should call next() if version is greater than minimum', () => {
      mockReq.headers!.appversion = '2.1.0';
      clientValidator(mockReq as Request, mockRes as Response, next);
      expect(next).toHaveBeenCalled();
    });

    const expectedError = {
        success: false,
        error: expect.objectContaining({
          code: 'api.client.upgrade_required',
          minimumVersion: '2.0.0'
        })
      };

    it('should return 426 if version is outdated', () => {
      mockReq.headers!.appversion = '1.9.9';
      clientValidator(mockReq as Request, mockRes as Response, next);

      expect(mockRes.status).toHaveBeenCalledWith(426);
      expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining(expectedError));
      expect(next).not.toHaveBeenCalled();
    });

    it('should return 426 if appversion header is missing', () => {
      clientValidator(mockReq as Request, mockRes as Response, next);

      expect(mockRes.status).toHaveBeenCalledWith(426);
      expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining(expectedError));
      expect(next).not.toHaveBeenCalled();
    });

    it('should return 426 for malformed versions', () => {
      mockReq.headers!.appversion = 'not-a-version';
      clientValidator(mockReq as Request, mockRes as Response, next);

      expect(mockRes.status).toHaveBeenCalledWith(426);
      expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining(expectedError));
      expect(next).not.toHaveBeenCalled();
    });
  });
});
