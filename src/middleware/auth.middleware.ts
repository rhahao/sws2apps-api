import { Request, Response, NextFunction } from 'express';
import { getAuth } from 'firebase-admin/auth';
import { logger } from '../utils/index.js';
import { ApiError } from './error.middleware.js';
import { AuthHeaderSchema } from '../validators/index.js';


export const verifyToken = async (
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    // 2. Validate Header Structure
    const headerResult = AuthHeaderSchema.safeParse(req.headers.authorization);
    
    if (!headerResult.success) {
      throw new ApiError(401, 'api.auth.unauthorized', 'No token provided or malformed');
    }

    const token = headerResult.data.split(' ')[1];
    const firebaseAuth = getAuth();

    if (!firebaseAuth) {
      throw new ApiError(503, 'api.auth.service_unavailable', 'Auth service unavailable');
    }

    const decodedToken = await firebaseAuth.verifyIdToken(token);

    // Attach the typed, validated data
    req.user = decodedToken

    next();
  } catch (error: unknown) {
    if (error instanceof ApiError) return next(error);
    
    logger.error('Authentication Error', error);
    next(new ApiError(401, 'api.auth.invalid_token', 'Unauthorized'));
  }
};