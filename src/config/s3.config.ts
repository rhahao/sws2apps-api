import { S3Client } from '@aws-sdk/client-s3';
import { config } from './env.js';

export const s3Client = new S3Client({
	region: config.S3.region,
	credentials: {
		accessKeyId: config.S3.accessKeyId,
		secretAccessKey: config.S3.secretAccessKey,
	},
	endpoint: config.S3.endpoint ? config.S3.endpoint : undefined,
	forcePathStyle: !!config.S3.endpoint, // Needed for MinIO or other S3-compatible providers
});
