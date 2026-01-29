import { describe, it, expect, vi, beforeEach, Mock } from 'vitest';
import { getAuth } from 'firebase-admin/auth';
import { verifyToken } from '../../src/middleware/auth.middleware.js';
import { ApiError } from '../../src/middleware/error.middleware.js';
import { NextFunction, Request, Response } from 'express';

// Mock Firebase Admin
vi.mock('firebase-admin/auth', () => ({
  getAuth: vi.fn(),
}));

// Mock Logger to keep test output clean
vi.mock('../../src/utils/index.js');

describe('verifyToken Middleware', () => {
  let mockReq: Request
  let mockRes: Response
  let next: NextFunction;

  beforeEach(() => {
    vi.clearAllMocks();
    mockReq = { headers: {} } as Request
    mockRes = {} as Response
    next = vi.fn();
  });

  it('should throw ApiError 401 if no authorization header is present', async () => {
    await verifyToken(mockReq, mockRes, next);

    const error = (next as Mock).mock.calls[0][0];

    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(401);
    expect(error.code).toBe('api.auth.unauthorized');
  });

  it('should throw ApiError 401 if token does not start with Bearer', async () => {
    mockReq.headers!.authorization = 'Basic 12345';
    
    await verifyToken(mockReq, mockRes, next);

    const error = (next as Mock).mock.calls[0][0];

    expect(next).toHaveBeenCalledWith(expect.any(ApiError));
    expect(error.status).toBe(401);
  });

  it('should attach decoded token to req.user and call next() on success', async () => {
    const mockDecodedToken = { uid: 'user_123', email: 'test@test.com' };

    mockReq.headers!.authorization = 'Bearer valid-token';

    // Mock Firebase success
    (getAuth as Mock).mockReturnValue({
      verifyIdToken: vi.fn().mockResolvedValue(mockDecodedToken),
    });

    await verifyToken(mockReq as Request, mockRes as Response, next);

    expect(mockReq["user"]).toEqual(mockDecodedToken);
    expect(next).toHaveBeenCalledWith(); // Called with no arguments = success
  });

  it('should handle Firebase verification failure and return 401', async () => {
    mockReq.headers.authorization = 'Bearer expired-token';

    (getAuth as Mock).mockReturnValue({
      verifyIdToken: vi.fn().mockRejectedValue(new Error('Token expired')),
    });

    await verifyToken(mockReq, mockRes, next);

    const error = (next as Mock).mock.calls[0][0];

    expect(error.status).toBe(401);
    expect(error.code).toBe('api.auth.invalid_token');
  });

  it('should return 503 if Firebase Auth service is not initialized', async () => {
    mockReq.headers.authorization = 'Bearer some-token';

    (getAuth as Mock).mockReturnValue(null); // Simulate service unavailable

    await verifyToken(mockReq, mockRes, next);

    const error = (next as Mock).mock.calls[0][0];
    expect(error.status).toBe(503);
    expect(error.code).toBe('api.auth.service_unavailable');
  });
});