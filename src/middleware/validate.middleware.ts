import { IncomingHttpHeaders } from 'node:http';
import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import type API from '../types/index.js';

/**
 * Higher-order middleware to validate requests using Zod schemas.
 * Automatically returns api.validation.failed on error.
 */
export const validateRequest = (schemas: API.RequestSchemas) => {
	return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
		try {
			if (schemas.headers) {
				req.headers = (await schemas.headers.parseAsync(req.headers)) as IncomingHttpHeaders;
			}
			if (schemas.params) {
				req.params = (await schemas.params.parseAsync(req.params)) as Request['params'];
			}
			if (schemas.query) {
				req.query = (await schemas.query.parseAsync(req.query)) as Request['query'];
			}
			if (schemas.body) {
				req.body = await schemas.body.parseAsync(req.body);
			}

			next();
		} catch (error) {
			if (error instanceof ZodError) {
				const details = error.issues.map((e) => ({
					path: e.path.join('.'),
					message: e.message,
				}));

				res.status(400).json({
					success: false,
					error: {
						message: 'Validation failed',
						code: 'api.validation.failed',
						details,
					},
				});
				return;
			}

			next(error);
		}
	};
};
