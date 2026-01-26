import { Response } from 'express';
import type { ApiResponse } from '../types/common.types.js';

/**
 * Send a successful JSON response
 */
export const sendSuccess = <T>(
  res: Response,
  data: T,
  statusCode: number = 200,
): Response => {
  const response: ApiResponse<T> = {
    success: true,
    data,
  };
  return res.status(statusCode).json(response);
};

/**
 * Send an error JSON response.
 * Follows the 'api.[context].[code]' standard for machine-readable errors.
 */
export const sendError = (
  res: Response,
  message: string,
  statusCode: number = 500,
  code: string = 'api.server.internal_error',
): Response => {
  const response: ApiResponse = {
    success: false,
    error: {
      message,
      code,
    },
  };
  return res.status(statusCode).json(response);
};
