import { S3Client } from '@aws-sdk/client-s3';
import { ENV } from './env.js';

export const s3Client = new S3Client({
  region: ENV.S3.region,
  credentials: {
    accessKeyId: ENV.S3.accessKeyId,
    secretAccessKey: ENV.S3.secretAccessKey,
  },
  endpoint: ENV.S3.endpoint ? ENV.S3.endpoint : undefined,
  forcePathStyle: !!ENV.S3.endpoint, // Needed for MinIO or other S3-compatible providers
});
