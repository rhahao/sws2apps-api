import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client as Client,
  S3ServiceException,
  ListObjectsV2Command,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  HeadObjectCommand,
  CreateBucketCommand,
  ListObjectsCommand,
} from '@aws-sdk/client-s3';
import type API from '../types/index.js';
import Config from '../config/index.js';
import Utility from '../utils/index.js';

const Bucket = Config.ENV.S3.bucketName;

let S3Client: Client;

export const initialize = async () => {
  try {
    S3Client = new Client({
      region: Config.ENV.S3.region,
      credentials: {
        accessKeyId: Config.ENV.S3.accessKeyId,
        secretAccessKey: Config.ENV.S3.secretAccessKey,
      },
      endpoint: Config.ENV.S3.endpoint ? Config.ENV.S3.endpoint : undefined,
      forcePathStyle: !!Config.ENV.S3.endpoint, // Needed for MinIO or other S3-compatible providers
    });
  } catch (error) {
    Utility.Logger.error('Error during storage initialization:', error);
  }
};

export const uploadFile = async (
  key: string,
  body: Buffer | object | string,
  contentType: string,
  metadata: Record<string, string> = {}
) => {
  try {
    let encryptedData = await Utility.Encryption.encrypt(body);

    if (typeof encryptedData === 'string') {
      encryptedData = Buffer.from(encryptedData, 'hex'); // encode string data as buffer
    }

    const command = new PutObjectCommand({
      Bucket,
      Key: key,
      Body: encryptedData,
      ContentType: contentType,
      Metadata: metadata,
    });

    await S3Client.send(command);
  } catch (error) {
    Utility.Logger.error(`Error uploading file ${key}:`, error);
    throw error;
  }
};

export const getFile = async (key: string) => {
  try {
    const command = new GetObjectCommand({
      Bucket,
      Key: key,
    });

    const response = await S3Client.send(command);
    const chunks: Buffer[] = [];

    for await (const chunk of response.Body as AsyncIterable<Uint8Array>) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }

    const buffer = Buffer.concat(chunks);

    const contents = await Utility.Encryption.decrypt(buffer);
    return contents;
  } catch (error) {
    if (
      error instanceof S3ServiceException &&
      error.name !== 'NoSuchKey' &&
      error.$metadata?.httpStatusCode !== 404
    ) {
      Utility.Logger.error(`Error retrieving file ${key}:`, error);
    }

    return;
  }
};

export const listFolders = async (prefix: string) => {
  try {
    const command = new ListObjectsV2Command({
      Bucket,
      Prefix: prefix,
      Delimiter: '/',
    });

    const response = await S3Client.send(command);

    return (response.CommonPrefixes || [])
      .map((p) => p.Prefix)
      .filter((p): p is string => !!p);
  } catch (error) {
    Utility.Logger.error(`Error listing folders with prefix ${prefix}:`, error);

    throw error;
  }
};

export const deleteFile = async (key: string) => {
  try {
    const command = new DeleteObjectCommand({
      Bucket,
      Key: key,
    });

    await S3Client.send(command);
    Utility.Logger.info(`File deleted successfully: ${key}`);
  } catch (error) {
    Utility.Logger.error(`Error deleting file ${key}:`, error);
    throw error;
  }
};

export const deleteFolder = async (prefix: string) => {
  try {
    let isTruncated = true;
    let continuationToken: string | undefined;

    while (isTruncated) {
      const listCommand = new ListObjectsV2Command({
        Bucket,
        Prefix: prefix,
        ContinuationToken: continuationToken,
      });

      const listResponse = await S3Client.send(listCommand);
      const objects = listResponse.Contents;

      if (objects && objects.length > 0) {
        const deleteParams = {
          Bucket,
          Delete: {
            Objects: objects.map((obj) => ({ Key: obj.Key })),
            Quiet: true,
          },
        };

        const deleteCommand = new DeleteObjectsCommand(deleteParams);
        await S3Client.send(deleteCommand);
      }

      isTruncated = !!listResponse.IsTruncated;
      continuationToken = listResponse.NextContinuationToken;
    }

    Utility.Logger.info(
      `Folder and its contents deleted successfully: ${prefix}`
    );
  } catch (error) {
    Utility.Logger.error(`Error deleting folder ${prefix}:`, error);
    throw error;
  }
};

export const getObjectMetadata = async (
  key: string
): Promise<Record<string, string>> => {
  try {
    const command = new HeadObjectCommand({
      Bucket,
      Key: key,
    });

    const response = await S3Client.send(command);
    return response.Metadata || {};
  } catch (error) {
    if (
      error instanceof S3ServiceException &&
      (error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404)
    ) {
      return {};
    }

    Utility.Logger.error(`Error retrieving metadata for ${key}:`, error);
    throw error;
  }
};

export const ensureBucketExists = async () => {
  try {
    const command = new CreateBucketCommand({
      Bucket,
    });

    await S3Client.send(command);

    Utility.Logger.info(`Bucket created successfully: ${Bucket}`);
  } catch (error) {
    if (
      error instanceof S3ServiceException &&
      (error.name === 'BucketAlreadyExists' ||
        error.name === 'BucketAlreadyOwnedByYou')
    ) {
      return;
    }

    Utility.Logger.error(`Error ensuring bucket exists (${Bucket}):`, error);

    throw error;
  }
};

export const clearBucket = async () => {
  try {
    Utility.Logger.info(`Emptying bucket: ${Bucket}...`);

    const maxRetries = 5;
    let retryCount = 0;

    while (retryCount < maxRetries) {
      try {
        // Ensure bucket exists before trying to empty it
        await ensureBucketExists();

        let truncated = true;
        let page = 1;

        while (truncated) {
          const listCommand = new ListObjectsCommand({
            Bucket,
          });

          const response = await S3Client.send(listCommand);

          if (!response.Contents || response.Contents.length === 0) {
            Utility.Logger.info('Bucket is already empty.');
            truncated = false;
            break;
          }

          Utility.Logger.info(
            `Page ${page}: Found ${response.Contents.length} objects.`
          );

          const objectsToDelete = response.Contents.map((obj) => ({
            Key: obj.Key,
          }));

          const deleteCommand = new DeleteObjectsCommand({
            Bucket,
            Delete: {
              Objects: objectsToDelete,
            },
          });

          await S3Client.send(deleteCommand);
          Utility.Logger.info(`Deleted ${objectsToDelete.length} objects.`);

          truncated = response.IsTruncated ?? false;
          page++;
        }

        Utility.Logger.info(`Successfully emptied bucket: ${Bucket}`);
        return; // Success, exit function
      } catch (error) {
        const err = error as API.GenericError;

        if (
          (err.code === 'ECONNREFUSED' || err.name === 'TimeoutError') &&
          retryCount < maxRetries
        ) {
          retryCount++;
          Utility.Logger.warn(
            `Connection failed (Attempt ${retryCount}/${maxRetries}). Retrying in 2s...`
          );
          await new Promise((resolve) => setTimeout(resolve, 2000));
        } else if (err.name === 'NoSuchBucket') {
          Utility.Logger.info(
            `Bucket '${Bucket}' does not exist. Skipping empty.`
          );
          return;
        } else {
          Utility.Logger.error('Error emptying bucket:', error);
          process.exit(1);
        }
      }
    }
  } catch (error) {
    Utility.Logger.error(`Error when emptying bucket (${Bucket}):`, error);

    throw error;
  }
};

export const fileExists = async (key: string) => {
  try {
    const command = new HeadObjectCommand({
      Bucket,
      Key: key,
    });

    await S3Client.send(command);
    return true;
  } catch (error) {
    const err = error as API.GenericError;

    if (err.name === 'NotFound' || err.$metadata?.httpStatusCode === 404) {
      return false;
    }

    throw error;
  }
};
