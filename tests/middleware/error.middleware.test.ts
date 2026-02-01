import { describe, it, expect, vi, beforeEach, Mock } from 'vitest';
import { NextFunction, Request, Response } from 'express';
import {
  errorHandler,
  notFoundHandler,
  ApiError,
} from '../../src/middleware/error.middleware.js';
import { ZodError } from 'zod';

vi.mock('../../src/utils/logger.js');

describe('Error Middleware', () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let next: NextFunction;

  beforeEach(() => {
    vi.clearAllMocks();
    mockReq = { path: '/test-path' };
    mockRes = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    };
    next = vi.fn();
    // Reset env to default
    process.env.NODE_ENV = 'test';
  });

  describe('errorHandler', () => {
    it('should format responses correctly for ApiError', () => {
      const error = new ApiError(403, 'api.auth.forbidden', 'Access Denied');

      errorHandler(error, mockReq as Request, mockRes as Response, next);

      expect(mockRes.status).toHaveBeenCalledWith(403);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: {
          message: 'Access Denied',
          code: 'api.auth.forbidden',
        },
      });
    });

    it('should default to 500 and not be an ApiError for generic Errors', () => {
      const error = new Error('Database crash');

      errorHandler(error, mockReq as Request, mockRes as Response, next);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            code: 'api.server.internal_error',
          }),
        })
      );
      expect(next).not.toHaveBeenCalledWith(expect.any(ApiError));
    });

    it('should handle ZodError gracefully', () => {
      const error = new ZodError([]); // Simplified ZodError

      errorHandler(error, mockReq as Request, mockRes as Response, next);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            code: 'api.server.validation_error',
            message: 'There was an error with your request.',
          }),
        })
      );
    });

    it('should hide stack traces and generic messages in production', () => {
      process.env.NODE_ENV = 'production';
      const error = new Error('Sensitive Database Error');

      errorHandler(error, mockReq as Request, mockRes as Response, next);

      const jsonResponse = (mockRes.json as Mock).mock.calls[0][0];
      expect(jsonResponse.error.message).toBe('Internal server error');
      expect(jsonResponse.error.stack).toBeUndefined();
    });

    it('should show stack traces and real messages in development', () => {
      process.env.NODE_ENV = 'development';
      const error = new Error('Specific Debug Info');

      errorHandler(error, mockReq as Request, mockRes as Response, next);

      const jsonResponse = (mockRes.json as Mock).mock.calls[0][0];
      expect(jsonResponse.error.message).toBe('Specific Debug Info');
      expect(jsonResponse.error.stack).toBeDefined();
    });
  });

  describe('notFoundHandler', () => {
    it('should return 404 with the path info', () => {
      notFoundHandler(mockReq as Request, mockRes as Response);

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
