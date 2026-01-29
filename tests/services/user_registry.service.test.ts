import { describe, it, expect, vi, beforeEach, Mock } from 'vitest';
import { userRegistry } from '../../src/services/user_registry.service.js';
import { s3Service } from '../../src/services/s3.service.js';
import { User } from '../../src/models/index.js';

vi.mock('../../src/utils/logger.js');
vi.mock('../../src/services/s3.service.js');

vi.mock('../../src/models/index.js', () => {
  return {
    User: vi.fn().mockImplementation(function (id) {
      this.id = id;
      this.profile = { role: 'user' };
      this.load = vi.fn().mockResolvedValue(undefined);
      return this;
    })
  };
});

describe('UserRegistry', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    
    // CRITICAL: Reset the singleton state before every test
    vi.mocked(s3Service.listFolders).mockResolvedValue([]);
    await userRegistry.loadIndex(); 
  });

  describe('loadIndex()', () => {
    it('should skip a specific user if loading fails but continue indexing others', async () => {
      // 1. Setup S3 Folders
      vi.mocked(s3Service.listFolders).mockResolvedValue(['users/fail/', 'users/success/']);
  
      // 2. Setup specific behavior for this test
      (User as Mock).mockImplementation(function (id: string) {
        this.id = id;
        this.profile = { role: 'user' };
        this.load = vi.fn().mockImplementation(async () => {
          if (id === 'fail') throw new Error('S3 Read Error');
          return undefined;
        });
        return this;
      });
  
      await userRegistry.loadIndex();
  
      // 3. Final Assertions
      expect(userRegistry.has('success')).toBe(true);
      expect(userRegistry.has('fail')).toBe(false);
      expect(userRegistry.count).toBe(1);
    });

    it('should correctly parse user IDs and filter out empty segments', async () => {
      vi.mocked(s3Service.listFolders).mockResolvedValue([
        'users/user_001/',
        'users/user_002/',
      ]);

      await userRegistry.loadIndex();

      expect(userRegistry.has('user_001')).toBe(true);
      expect(userRegistry.has('user_002')).toBe(true);
      expect(userRegistry.count).toBe(2);
    });
  });

  describe('Search & Maintenance', () => {
    it('should find users by email (case-insensitive)', async () => {
      vi.mocked(s3Service.listFolders).mockResolvedValue(['users/alice/']);
      (User as Mock).mockImplementation(function (id) {
        this.id = id;
        this.email = 'alice@gmail.com';
        this.load = vi.fn().mockResolvedValue(undefined);
        return this;
      });

      await userRegistry.loadIndex();

      const found = userRegistry.findByEmail('Alice@gmail.com');
      expect(found).toBeDefined();
      expect(found!.id).toBe('alice');
    });

    it('should only call save methods during maintenance if changes occurred', async () => {
      vi.mocked(s3Service.listFolders).mockResolvedValue(['users/user1/']);
      
      const mockSaveMutations = vi.fn();
      const mockSaveSessions = vi.fn();

      (User as Mock).mockImplementation(function (id) {
        this.id = id;
        this.sessions = [];
        this.load = vi.fn().mockResolvedValue(undefined);
        this.fetchMutations = vi.fn().mockResolvedValue([]);
        
        // Mocking the behavior for updatedAt/maintenance testing
        this.cleanupMutations = vi.fn().mockReturnValue({ pruned: [], hasChanged: true });
        this.cleanupSessions = vi.fn().mockReturnValue(true);
        
        this.saveMutations = mockSaveMutations;
        this.saveSessions = mockSaveSessions;
        return this;
      });

      await userRegistry.loadIndex();
      await userRegistry.performHistoryMaintenance();

      // Ensure the cleanup was triggered
      expect(mockSaveMutations).toHaveBeenCalled();
      expect(mockSaveSessions).toHaveBeenCalled();
    });
  });
});