import { Request, Response, NextFunction } from 'express';
import { getAuth } from 'firebase-admin/auth';
import { logger } from '../utils/index.js';
import { ApiError } from './error.middleware.js';

export const verifyToken = async (
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader?.startsWith('Bearer ')) {
      throw new ApiError(401, 'api.auth.unauthorized', 'No token provided');
    }

    const token = authHeader.split('Bearer ')[1];

    const firebaseAuth = getAuth();

    if (!firebaseAuth) {
      throw new ApiError(
        503,
        'api.auth.service_unavailable',
        'Authentication service is currently unavailable'
      );
    }

    const decodedToken = await firebaseAuth.verifyIdToken(token);

    // Attach user to request
    req.user = decodedToken;

    next();
  } catch (error: unknown) {
    // If it's already an ApiError, just pass it through
    if (error instanceof ApiError) {
      return next(error);
    }

    logger.error('Authentication Error', error);

    next(new ApiError(401, 'api.auth.invalid_token', 'Unauthorized'));
  }
};
