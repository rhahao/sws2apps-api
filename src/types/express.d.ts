import { DecodedIdToken } from 'firebase-admin/auth';

declare global {
	namespace Express {
		interface Request {
			user?: DecodedIdToken; // Decoded Firebase ID token
		}
	}
}
