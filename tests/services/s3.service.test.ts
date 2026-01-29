import { describe, it, expect, vi, beforeEach, Mock } from 'vitest';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { s3Client } from '../../src/config/index.js';
import { s3Service } from '../../src/services/s3.service.js';

// Mock the client
vi.mock('../../src/config/index.js', () => ({
  s3Client: { send: vi.fn() },
  ENV: { S3: { bucketName: 'test-bucket' } },
  logger: { error: vi.fn(), info: vi.fn() }
}));

describe('S3Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should calculate correct ContentLength for strings with multi-byte characters', async () => {
    const key = 'test.txt';
    const body = '🚀';
    
    await s3Service.uploadFile(key, body, 'text/plain');
  
    // 1. Get the command from the mock
    const lastCall = vi.mocked(s3Client.send as Mock).mock.calls[0][0];
  
    // 2. Cast it to PutObjectCommand to access .input.ContentLength
    const command = lastCall as PutObjectCommand;
    
    expect(command.input.ContentLength).toBe(4);
  });

  it('should return null and not log error for missing files in getFile', async () => {
    const error = new Error('NoSuchKey');
    error.name = 'NoSuchKey';

    vi.mocked(s3Client.send).mockRejectedValue(error);

    const result = await s3Service.getFile('missing.json');

    expect(result).toBeNull();
  });



it('should correctly map folder prefixes in listFolders', async () => {
  vi.mocked(s3Client.send as Mock).mockResolvedValue({
    CommonPrefixes: [{ Prefix: 'folder1/' }, { Prefix: 'folder2/' }]
  });

  const folders = await s3Service.listFolders('root/');

  expect(folders).toEqual(['folder1/', 'folder2/']);
});
});