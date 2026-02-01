import { Request, Response, NextFunction } from 'express';
import { ApiError } from './error.middleware.js';
import Service from '../services/index.js';
import Utility from '../utils/index.js';
import Validator from '../validators/index.js';

export const verifyToken = async (
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const headerResult = Validator.AuthHeaderSchema.safeParse(
      req.headers.authorization
    );

    if (!headerResult.success) {
      throw new ApiError(
        401,
        'api.auth.unauthorized',
        'No token provided or malformed'
      );
    }

    const token = headerResult.data.split(' ')[1];
    const decodedToken = await Service.Auth.verifyToken(token);

    // Attach the typed, validated data
    req.user = decodedToken;

    next();
  } catch (error: unknown) {
    if (error instanceof ApiError) return next(error);

    Utility.Logger.error('Authentication Error', error);

    next(new ApiError(401, 'api.auth.invalid_token', 'Unauthorized'));
  }
};
