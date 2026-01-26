import { ListObjectsCommand, DeleteObjectsCommand } from '@aws-sdk/client-s3';
import { GenericError } from '../types/index.js';
import { config, s3Client } from '../config/index.js';
import { s3Service } from '../services/index.js';
import { logger } from '../utils/index.js';

const emptyBucket = async () => {
	const bucketName = config.S3.bucketName;
	logger.info(`Emptying bucket: ${bucketName}...`);

	const maxRetries = 5;
	let retryCount = 0;

	while (retryCount < maxRetries) {
		try {
			// Ensure bucket exists before trying to empty it
			await s3Service.ensureBucketExists();

			let truncated = true;
			let page = 1;

			while (truncated) {
				const listCommand = new ListObjectsCommand({
					Bucket: bucketName,
				});

				const response = await s3Client.send(listCommand);

				if (!response.Contents || response.Contents.length === 0) {
					logger.info('Bucket is already empty.');
					truncated = false;
					break;
				}

				logger.info(`Page ${page}: Found ${response.Contents.length} objects.`);

				const objectsToDelete = response.Contents.map((obj) => ({
					Key: obj.Key,
				}));

				const deleteCommand = new DeleteObjectsCommand({
					Bucket: bucketName,
					Delete: {
						Objects: objectsToDelete,
					},
				});

				await s3Client.send(deleteCommand);
				logger.info(`Deleted ${objectsToDelete.length} objects.`);

				truncated = response.IsTruncated ?? false;
				page++;
			}

			logger.info(`Successfully emptied bucket: ${bucketName}`);
			return; // Success, exit function
		} catch (error) {
			const err = error as GenericError;

			if ((err.code === 'ECONNREFUSED' || err.name === 'TimeoutError') && retryCount < maxRetries) {
				retryCount++;
				logger.warn(`Connection failed (Attempt ${retryCount}/${maxRetries}). Retrying in 2s...`);
				await new Promise((resolve) => setTimeout(resolve, 2000));
			} else if (err.name === 'NoSuchBucket') {
				logger.info(`Bucket '${bucketName}' does not exist. Skipping empty.`);
				return;
			} else {
				logger.error('Error emptying bucket:', error);
				process.exit(1);
			}
		}
	}
};

emptyBucket();
