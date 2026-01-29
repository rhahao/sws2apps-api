import { NextFunction, Request, Response } from 'express';
import { logger } from '../utils/index.js';

/**
 * Custom error class with machine-readable code
 */
export class ApiError extends Error {
	constructor(
		public status: number,
		public code: string,
		message: string,
	) {
		super(message);
		Object.setPrototypeOf(this, ApiError.prototype);
	}
}

/**
 * Global error handling middleware
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const errorHandler = (err: Error, _req: Request, res: Response, _next: NextFunction): void => {
	// Log the full error for server-side auditing
	logger.error('Error occurred:', err);

	const statusCode = err instanceof ApiError ? err.status : 500;
	const code = err instanceof ApiError ? err.code : 'api.server.internal_error';

	// In production, we don't leak internal error messages unless they are explicitly set in ApiError
	const message = err instanceof ApiError || process.env.NODE_ENV === 'development' ? err.message : 'Internal server error';

	res.status(statusCode).json({
		success: false,
		error: {
			message,
			code,
			...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
		},
	});
};

/**
 * 404 Not Found handler
 */
export const notFoundHandler = (req: Request, res: Response): void => {
	res.status(404).json({
		success: false,
		error: {
			message: 'Route not found',
			code: 'api.server.not_found',
			path: req.path,
		},
	});
};
