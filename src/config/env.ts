import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

export const config = {
	port: process.env.PORT || 8000,
	nodeEnv: process.env.NODE_ENV || 'development',
	logtailSourceToken: process.env.LOGTAIL_SOURCE_TOKEN,
	logtailEndpoint: process.env.LOGTAIL_ENDPOINT || 'https://in.logs.betterstack.com',
	secEncryptKey: process.env.SEC_ENCRYPT_KEY,
	S3: {
		region: process.env.S3_REGION || 'us-east-1',
		accessKeyId: process.env.S3_ACCESS_KEY_ID || '',
		secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || '',
		bucketName: process.env.S3_BUCKET_NAME || '',
		endpoint: process.env.S3_ENDPOINT,
	},
	firebase: {
		projectId: process.env.FIREBASE_PROJECT_ID || '',
		privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n') || '',
		clientEmail: process.env.FIREBASE_CLIENT_EMAIL || '',
	},
	cors: {
		allowedOrigins: process.env.ALLOWED_ORIGINS?.split(',') || ['*'],
	},
	rateLimit: {
		windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10),
		max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100', 10),
	},
	fileUpload: {
		maxSize: parseInt(process.env.MAX_FILE_SIZE || '52428800', 10), // 50MB
		allowedTypes: process.env.ALLOWED_FILE_TYPES?.split(',') || ['image/jpg', 'image/png', 'application/json'],
		presignedUrlExpiration: parseInt(process.env.PRESIGNED_URL_EXPIRATION || '3600', 10),
	},
};
