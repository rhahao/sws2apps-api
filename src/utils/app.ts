import { CookieOptions } from 'express';

export const cookieOptions: CookieOptions = {
	httpOnly: false,
	signed: false,
	secure: true,
	sameSite: 'none',
	maxAge: 400 * 24 * 60 * 60 * 1000,
};