import { Request, Response, NextFunction } from 'express';
import { ApiError } from './error.middleware.js';
import Service from '../services/index.js';
import Utility from '../utils/index.js';
import Validator from '../validators/index.js';

export const verifyToken = async (
  req: Request,
  res: Response,
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

    if (!decodedToken) {
      throw new ApiError(
        403,
        'api.auth.unauthorized',
        'No token provided or malformed'
      );
    }

    const visitorid = req.signedCookies.visitorid;

    if (!visitorid) {
      throw new ApiError(
        403,
        'api.auth.session_revoked',
        'user session revoked'
      );
    }

    const user = Service.Users.findByAuthUid(decodedToken.uid);

    if (!user) {
      throw new ApiError(403, 'api.auth.not_found', 'user account not found');
    }

    const findSession = user.sessions.find(
      (session) => session.visitorid === visitorid
    );

    if (!findSession) {
      res.clearCookie('visitorid');

      throw new ApiError(
        403,
        'api.auth.session_revoked',
        'user session revoked'
      );
    }

    req.user = user;

    next();
  } catch (error: unknown) {
    if (error instanceof ApiError) return next(error);

    Utility.Logger.error('Authentication Error', error);

    next(new ApiError(401, 'api.auth.invalid_token', 'Unauthorized'));
  }
};
