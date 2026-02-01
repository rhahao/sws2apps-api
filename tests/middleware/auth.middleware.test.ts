import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { verifyToken } from '../../src/middleware/auth.middleware.js';
import { ApiError } from '../../src/middleware/error.middleware.js';
import { NextFunction, Request, Response } from 'express';
import Service from '../../src/services/index.js';
import Validator from '../../src/validators/index.js';

// Mock dependencies
vi.mock('../../src/services/index.js', () => ({
  default: {
    Auth: {
      verifyToken: vi.fn(),
    },
  },
}));

vi.mock('../../src/validators/index.js', () => ({
  default: {
    AuthHeaderSchema: {
      safeParse: vi.fn(),
    },
  },
}));

// Mock logger to keep test output clean
vi.mock('../../src/utils/index.js', () => ({
  default: {
    Logger: {
      error: vi.fn(),
    },
  },
}));

describe('verifyToken Middleware', () => {
  let mockReq: Request;
  let mockRes: Response;
  let next: NextFunction;

  beforeEach(() => {
    vi.clearAllMocks();
    mockReq = { headers: {} } as Request;
    mockRes = {} as Response; // Not used in this middleware
    next = vi.fn();
  });

  it('should call next with a 401 ApiError if validation fails', async () => {
    // Simulate Zod validation failure
    (Validator.AuthHeaderSchema.safeParse as Mock).mockReturnValue({
      success: false,
    });

    await verifyToken(mockReq, mockRes, next);

    expect(next).toHaveBeenCalledOnce();
    const error = (next as Mock).mock.calls[0][0];

    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(401);
    expect(error.code).toBe('api.auth.unauthorized');
    expect(error.message).toBe('No token provided or malformed');
  });

  it('should attach decoded token to req.user and call next() on success', async () => {
    const mockToken = 'valid-token';
    const mockDecodedToken = { uid: 'user_123', email: 'test@test.com' };

    mockReq.headers.authorization = `Bearer ${mockToken}`;

    // Simulate Zod validation success
    (Validator.AuthHeaderSchema.safeParse as Mock).mockReturnValue({
      success: true,
      data: `Bearer ${mockToken}`,
    });

    // Mock successful token verification
    (Service.Auth.verifyToken as Mock).mockResolvedValue(mockDecodedToken);

    await verifyToken(mockReq, mockRes, next);

    expect(Service.Auth.verifyToken).toHaveBeenCalledWith(mockToken);
    expect(mockReq.user).toEqual(mockDecodedToken);
    expect(next).toHaveBeenCalledWith(); // Called with no arguments indicates success
  });

  it('should call next with a 401 ApiError if token verification fails', async () => {
    const mockToken = 'invalid-token';
    mockReq.headers.authorization = `Bearer ${mockToken}`;

    // Simulate Zod validation success
    (Validator.AuthHeaderSchema.safeParse as Mock).mockReturnValue({
      success: true,
      data: `Bearer ${mockToken}`,
    });

    // Mock failed token verification
    const verificationError = new Error('Token is invalid!');
    (Service.Auth.verifyToken as Mock).mockRejectedValue(verificationError);

    await verifyToken(mockReq, mockRes, next);

    expect(Service.Auth.verifyToken).toHaveBeenCalledWith(mockToken);
    expect(next).toHaveBeenCalledOnce();
    const error = (next as Mock).mock.calls[0][0];

    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(401);
    expect(error.code).toBe('api.auth.invalid_token');
    expect(error.message).toBe('Unauthorized');
  });
});
