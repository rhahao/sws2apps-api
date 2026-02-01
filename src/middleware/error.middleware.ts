import { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import Utility from '../utils/index.js';

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
	Utility.Logger.error('Error occurred:', err);

	if (err instanceof ZodError) {
		res.status(400).json({
			success: false,
			error: {
				message: 'There was an error with your request.',
				code: 'api.server.validation_error',
				...(process.env.NODE_ENV === 'development' && { issues: err.issues }),
			},
		});
		return;
	}

	if (err instanceof ApiError) {
		const message = err.message || 'An error occurred.';
		res.status(err.status).json({
			success: false,
			error: {
				message,
				code: err.code,
				...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
			},
		});
		return;
	}

	// Generic error for unhandled cases
	const message = process.env.NODE_ENV === 'development' ? err.message : 'Internal server error';
	res.status(500).json({
		success: false,
		error: {
			message,
			code: 'api.server.internal_error',
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
