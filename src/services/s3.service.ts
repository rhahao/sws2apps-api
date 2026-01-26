import {
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
  HeadObjectCommand,
  CreateBucketCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { GenericError } from '../types/index.js';
import { ENV, s3Client } from '../config/index.js';
import { logger } from '../utils/index.js';

class S3Service {
  private bucket: string;

  constructor() {
    this.bucket = ENV.S3.bucketName;
  }

  async uploadFile(
    key: string,
    body: Buffer | Uint8Array | Blob | string,
    contentType: string,
    metadata: Record<string, string> = {}
  ) {
    try {
      const command = new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
        Metadata: metadata,
        // Explicitly set ContentLength for strings to prevent "unknown stream length" warnings
        ContentLength:
          typeof body === 'string' ? Buffer.byteLength(body) : undefined,
      });

      await s3Client.send(command);

      return { key, bucket: this.bucket };
    } catch (error) {
      logger.error(`Error uploading file ${key}:`, error);
      throw error;
    }
  }

  async getFileUrl(key: string, expiresIn = 3600): Promise<string> {
    try {
      const command = new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
      });

      const url = await getSignedUrl(s3Client, command, { expiresIn });
      return url;
    } catch (error) {
      logger.error(`Error generating presigned URL for ${key}:`, error);
      throw error;
    }
  }

  async getFile(key: string): Promise<string | null> {
    try {
      const command = new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
      });

      const response = await s3Client.send(command);
      const content = await response.Body?.transformToString();
      return content || '';
    } catch (error) {
      const err = error as GenericError;

      // Ignore logs for missing files (NoSuchKey) as it's an expected case in our logic
      if (err.name !== 'NoSuchKey' && err.$metadata?.httpStatusCode !== 404) {
        logger.error(`Error retrieving file ${key}:`, error);
      }

      return null;
    }
  }

  async listObjects(prefix: string) {
    try {
      const command = new ListObjectsV2Command({
        Bucket: this.bucket,
        Prefix: prefix,
      });

      const response = await s3Client.send(command);
      return response.Contents || [];
    } catch (error) {
      logger.error(`Error listing objects with prefix ${prefix}:`, error);
      throw error;
    }
  }

  async listFolders(prefix: string) {
    try {
      const command = new ListObjectsV2Command({
        Bucket: this.bucket,
        Prefix: prefix,
        Delimiter: '/',
      });

      const response = await s3Client.send(command);
      return (response.CommonPrefixes || [])
        .map((p) => p.Prefix)
        .filter((p): p is string => !!p);
    } catch (error) {
      logger.error(`Error listing folders with prefix ${prefix}:`, error);
      throw error;
    }
  }

  async fileExists(key: string): Promise<boolean> {
    try {
      const command = new HeadObjectCommand({
        Bucket: this.bucket,
        Key: key,
      });

      await s3Client.send(command);
      return true;
    } catch (error) {
      const err = error as GenericError;

      if (err.name === 'NotFound' || err.$metadata?.httpStatusCode === 404) {
        return false;
      }
      throw error;
    }
  }

  async deleteFile(key: string) {
    try {
      const command = new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: key,
      });

      await s3Client.send(command);
      logger.info(`File deleted successfully: ${key}`);
    } catch (error) {
      logger.error(`Error deleting file ${key}:`, error);
      throw error;
    }
  }

  async getObjectMetadata(key: string): Promise<Record<string, string>> {
    try {
      const command = new HeadObjectCommand({
        Bucket: this.bucket,
        Key: key,
      });

      const response = await s3Client.send(command);
      return response.Metadata || {};
    } catch (error) {
      const err = error as GenericError;

      if (err.name === 'NotFound' || err.$metadata?.httpStatusCode === 404) {
        return {};
      }
      logger.error(`Error retrieving metadata for ${key}:`, error);
      throw error;
    }
  }

  async ensureBucketExists(): Promise<void> {
    try {
      const command = new CreateBucketCommand({
        Bucket: this.bucket,
      });

      await s3Client.send(command);
      logger.info(`Bucket created successfully: ${this.bucket}`);
    } catch (error) {
      const err = error as GenericError;

      if (
        err.name === 'BucketAlreadyExists' ||
        err.name === 'BucketAlreadyOwnedByYou'
      ) {
        return;
      }

      logger.error(`Error ensuring bucket exists (${this.bucket}):`, error);

      throw error;
    }
  }
}

export const s3Service = new S3Service();
