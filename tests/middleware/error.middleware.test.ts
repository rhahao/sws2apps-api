import { describe, it, expect, vi, beforeEach, Mock } from 'vitest';
import { NextFunction, Request, Response } from 'express';
import {
  errorHandler,
  notFoundHandler,
  ApiError,
} from '../../src/middleware/error.middleware.js';

vi.mock('../../src/utils/logger.js');

describe('Error Middleware', () => {
  let mockReq: Request;
  let mockRes: Response;
  let next: NextFunction;

  beforeEach(() => {
    vi.clearAllMocks();
    mockReq = { path: '/test-path' } as unknown as Request;
    mockRes = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    } as unknown as Response;
    next = vi.fn();
    // Reset env to default
    process.env.NODE_ENV = 'test';
  });

  describe('errorHandler', () => {
    it('should format responses correctly for ApiError', () => {
      const error = new ApiError(403, 'api.auth.forbidden', 'Access Denied');

      errorHandler(error, mockReq, mockRes, next);

      expect(mockRes.status).toHaveBeenCalledWith(403);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: {
          message: 'Access Denied',
          code: 'api.auth.forbidden',
        },
      });
    });

    it('should default to 500 for generic Errors', () => {
      const error = new Error('Database crash');

      errorHandler(error, mockReq, mockRes, next);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            code: 'api.server.internal_error',
          }),
        })
      );
    });

    it('should hide stack traces and generic messages in production', () => {
      process.env.NODE_ENV = 'production';

      const error = new Error('Sensitive Database Error');

      errorHandler(error, mockReq, mockRes, next);

      const jsonResponse = (mockRes.json as Mock).mock.calls[0][0];
      expect(jsonResponse.error.message).toBe('Internal server error');
      expect(jsonResponse.error.stack).toBeUndefined();
    });

    it('should show stack traces and real messages in development', () => {
      process.env.NODE_ENV = 'development';
      const error = new Error('Specific Debug Info');

      errorHandler(error, mockReq, mockRes, next);

      const jsonResponse = (mockRes.json as Mock).mock.calls[0][0];
      expect(jsonResponse.error.message).toBe('Specific Debug Info');
      expect(jsonResponse.error.stack).toBeDefined();
    });
  });

  describe('notFoundHandler', () => {
    it('should return 404 with the path info', () => {
      notFoundHandler(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: {
          message: 'Route not found',
          code: 'api.server.not_found',
          path: '/test-path',
        },
      });
    });
  });
});
