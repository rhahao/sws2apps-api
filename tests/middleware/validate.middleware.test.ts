import { describe, it, expect, vi, beforeEach, Mock } from 'vitest';
import { z } from 'zod';
import { NextFunction, Request, Response } from 'express';
import { validateRequest } from '../../src/middleware/validate.middleware.js';
import type API from '../types/index.js';

describe('validateRequest Middleware', () => {
  let mockRes: Partial<Response>
  let next: NextFunction;

  beforeEach(() => {
    vi.clearAllMocks();
    mockRes = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    }
    next = vi.fn();
  });

  it('should successfully validate and update req.body', async () => {
    const schema = {
      body: z.object({
        name: z.string(),
        age: z.number(),
      }),
    };
    
    const mockReq = { body: { name: 'Alice', age: 30, extra: 'discarded' } } as Request;

    const middleware = validateRequest(schema);

    await middleware(mockReq, mockRes as Response, next);

    expect(next).toHaveBeenCalledWith();
    // Zod usually strips unknown keys by default if using .parse()
    expect(mockReq.body).toEqual({ name: 'Alice', age: 30 });
  });

  it('should validate headers and reject invalid ones', async () => {
    const schema = {
      headers: z.object({
        installation: z.uuid(),
      }),
    };
  
    const mockReq = { headers: { installation: 'invalid' } } as unknown as Request;
    const middleware = validateRequest(schema);
  
    await middleware(mockReq, mockRes as Response, next);
  
    expect(mockRes.status).toHaveBeenCalledWith(400);
    expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
      error: expect.objectContaining({
        code: 'api.validation.failed',
      }),
    }));
    expect(next).not.toHaveBeenCalled();
  });
  

  it('should handle Zod transformation/coercion (e.g., for updatedAt)', async () => {
    const schema = {
      body: z.object({
        updatedAt: z.coerce.date(), // String to Date object
      }),
    };
    
    const mockReq = { body: { updatedAt: '2026-01-25T10:00:00Z' } } as Request;

    const middleware = validateRequest(schema);

    await middleware(mockReq, mockRes as Response, next);

    expect(mockReq.body.updatedAt).toBeInstanceOf(Date);
    expect(mockReq.body.updatedAt.getFullYear()).toBe(2026);
  });

  it('should return 400 with details if validation fails', async () => {
    const schema = {
      query: z.object({
        id: z.uuid()
      }),
    };
    
    const mockReq = { query: { id: 'not-a-uuid' } } as unknown as Request;
    const middleware = validateRequest(schema);

    await middleware(mockReq, mockRes as Response, next);

    expect(mockRes.status).toHaveBeenCalledWith(400);
    expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
      success: false,
      error: expect.objectContaining({
        code: 'api.validation.failed',
        details: expect.arrayContaining([
          expect.objectContaining({ path: 'id' })
        ]),
      }),
    }));
    expect(next).not.toHaveBeenCalled();
  });

  it('should call next(error) if a non-Zod error occurs', async () => {
    const schema = {
      body: {
        // Force an error inside parseAsync
        parseAsync: vi.fn().mockRejectedValue(new Error('Unexpected Crash')),
      }
    }
    
    const mockReq = { body: {} } as Request;

    const middleware = validateRequest(schema as unknown as API.RequestSchemas);

    await middleware(mockReq, mockRes as Response, next);

    expect(next).toHaveBeenCalledWith(expect.any(Error));
    expect((next as Mock).mock.calls[0][0].message).toBe('Unexpected Crash');
  });
});