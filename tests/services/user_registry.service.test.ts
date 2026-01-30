import { describe, it, expect, vi, beforeEach, Mock } from 'vitest';
import { userRegistry } from '../../src/services/user_registry.service.js';
import { s3Service } from '../../src/services/s3.service.js';
import { User } from '../../src/models/index.js';
import { UserSession } from '../../src/types/index.js';

vi.mock('../../src/utils/logger.js');
vi.mock('../../src/services/s3.service.js');

vi.mock('../../src/models/index.js', () => {
  return {
    User: vi.fn().mockImplementation(function (id) {
      this.id = id;
      this.profile = { role: 'user' };
      this.sessions = []; // Default empty
      this.load = vi.fn().mockResolvedValue(undefined);
      return this;
    }),
  };
});

describe('UserRegistry', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.mocked(s3Service.listFolders).mockResolvedValue([]);
    await userRegistry.loadIndex();
  });

  describe('Indexing & VisitorId', () => {
    it('should build the visitor index correctly during loadIndex', async () => {
      vi.mocked(s3Service.listFolders).mockResolvedValue(['users/user1/']);

      (User as Mock).mockImplementation(function (id) {
        this.id = id;
        this.sessions = [{ visitorid: 'v-123' }, { visitorid: 'v-456' }];
        this.load = vi.fn().mockResolvedValue(undefined);
        return this;
      });

      await userRegistry.loadIndex();

      // Test O(1) lookups
      expect(userRegistry.findByVisitorId('v-123')).toBeDefined();
      expect(userRegistry.findByVisitorId('v-456')).toBeDefined();
      expect(userRegistry.findByVisitorId('v-123')?.id).toBe('user1');
      expect(userRegistry.findByVisitorId('unknown')).toBeUndefined();
    });

    it('should rebuild the index and remove old sessions after maintenance', async () => {
      vi.mocked(s3Service.listFolders).mockResolvedValue(['users/user1/']);

      let mockSessions = [{ visitorid: 'active' }, { visitorid: 'stale' }];

      (User as Mock).mockImplementation(function (id) {
        this.id = id;
        this.sessions = mockSessions;
        this.load = vi.fn().mockResolvedValue(undefined);
        this.fetchMutations = vi.fn().mockResolvedValue([]);
        this.cleanupMutations = vi
          .fn()
          .mockReturnValue({ pruned: [], hasChanged: false });

        // Simulate session pruning
        this.cleanupSessions = vi.fn().mockImplementation(() => {
          mockSessions = [{ visitorid: 'active' }]; // Remove 'stale'
          this.sessions = mockSessions;
          return true; // Indicates change
        });

        this.saveSessions = vi.fn().mockResolvedValue(undefined);
        return this;
      });

      await userRegistry.loadIndex();
      expect(userRegistry.findByVisitorId('stale')).toBeDefined();

      await userRegistry.performHistoryMaintenance();

      // After maintenance, the index should be rebuilt
      expect(userRegistry.findByVisitorId('active')).toBeDefined();
      expect(userRegistry.findByVisitorId('stale')).toBeUndefined();
    });
  });

  describe('Search & Maintenance (Existing)', () => {
    it('should find users by email (case-insensitive)', async () => {
      vi.mocked(s3Service.listFolders).mockResolvedValue(['users/alice/']);
      (User as Mock).mockImplementation(function (id) {
        this.id = id;
        this.email = 'alice@gmail.com';
        this.sessions = [];
        this.load = vi.fn().mockResolvedValue(undefined);
        return this;
      });

      await userRegistry.loadIndex();

      const found = userRegistry.findByEmail('Alice@gmail.com');
      expect(found).toBeDefined();
      expect(found!.id).toBe('alice');
    });

    it('should only call rebuildVisitorIndex if users were cleaned', async () => {
      vi.mocked(s3Service.listFolders).mockResolvedValue(['users/user1/']);

      (User as Mock).mockImplementation(function (id) {
        this.id = id;
        this.sessions = [];
        this.load = vi.fn().mockResolvedValue(undefined);
        this.fetchMutations = vi.fn().mockResolvedValue([]);
        this.cleanupMutations = vi
          .fn()
          .mockReturnValue({ pruned: [], hasChanged: false });
        this.cleanupSessions = vi.fn().mockReturnValue(false); // No changes
        return this;
      });

      await userRegistry.loadIndex();

      // We spy on the private method via prototype or check the result of findByVisitorId
      const rebuildSpy = vi.spyOn(
        userRegistry as unknown as { rebuildVisitorIndex: () => void },
        'rebuildVisitorIndex'
      );

      await userRegistry.performHistoryMaintenance();

      expect(rebuildSpy).not.toHaveBeenCalled();
    });

    it('should perform a hot-update of the visitorIndex using updateIndexForUser', async () => {
      // 1. Setup a mock user that isn't in the registry yet
      const visitorId = 'hot-session-999';
      
      // Use your template to create a specific mock instance
      (User as Mock).mockImplementation(function (id) {
        this.id = id;
        this.sessions = [{ visitorid: visitorId }];
        this.load = vi.fn().mockResolvedValue(undefined);
        return this;
      });
    
      const newUser = new User('user_999');
    
      // 2. Pre-verify: The index should be empty/unaware of this session
      expect(userRegistry.findByVisitorId(visitorId)).toBeUndefined();
    
      // 3. Action: Perform the quick update
      userRegistry.updateIndexForUser(newUser);
    
      // 4. Assertion: O(1) lookup should now work instantly
      const foundUser = userRegistry.findByVisitorId(visitorId);
      expect(foundUser).toBeDefined();
      expect(foundUser?.id).toBe('user_999');
    });
  });
});
