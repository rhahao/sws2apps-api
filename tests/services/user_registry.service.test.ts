import { describe, it, expect, vi, beforeEach, Mock } from 'vitest';
import { userRegistry } from '../../src/services/user_registry.service.js';
import { s3Service } from '../../src/services/s3.service.js';
import { User } from '../../src/models/index.js';
import { getAuth } from 'firebase-admin/auth';

// 1. Define stable mock references for Firebase
const mockUpdateUser = vi.fn().mockResolvedValue({});
const mockGetUser = vi.fn().mockImplementation((uid) => ({
  uid,
  email: 'mock-user@example.com',
  providerData: [{ providerId: 'password' }],
}));

// 2. Mock Firebase Admin Auth using the stable references
vi.mock('firebase-admin/auth', () => ({
  getAuth: vi.fn(() => ({
    updateUser: mockUpdateUser,
    getUser: mockGetUser,
  })),
}));

vi.mock('../../src/utils/index.js', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
}));

vi.mock('../../src/services/s3.service.js');

// 3. Mock User Model
vi.mock('../../src/models/index.js', () => {
  return {
    User: vi.fn().mockImplementation(function (id) {
      this.id = id;
      this.sessions = [];
      this.profile = { role: 'user' };
      this.load = vi.fn().mockResolvedValue(undefined);
      this.save = vi.fn().mockResolvedValue(undefined);
      this.applyServerProfilePatch = vi.fn().mockResolvedValue(undefined);
      this.applyProfilePatch = vi.fn().mockResolvedValue(undefined);
      this.fetchMutations = vi.fn().mockResolvedValue([]);
      this.saveMutations = vi.fn().mockResolvedValue(undefined);
      this.saveSessions = vi.fn().mockResolvedValue(undefined);
      this.cleanupMutations = vi
        .fn()
        .mockReturnValue({ pruned: [], hasChanged: false });
      this.cleanupSessions = vi.fn().mockReturnValue(false);
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

  describe('User Creation', () => {
    it('should create a new user, sync with Firebase, and update the index', async () => {
      const params = {
        auth_uid: 'fb_123',
        firstname: 'Jane',
        lastname: 'Doe',
        email: 'jane@example.com',
      };

      // Specific mock implementation for this test case
      (User as Mock).mockImplementation(function (id) {
        this.id = id;
        this.sessions = [];
        this.save = vi.fn().mockResolvedValue(undefined);
        this.load = vi.fn().mockImplementation(async () => {
          this.email = 'jane@example.com';
          return undefined;
        });
        this.applyServerProfilePatch = vi.fn();
        this.applyProfilePatch = vi.fn();
        return this;
      });

      const user = await userRegistry.create(params);

      // Verify Firebase update using the stable variable
      expect(mockUpdateUser).toHaveBeenCalledWith(
        'fb_123',
        expect.objectContaining({
          displayName: 'Jane Doe',
        })
      );

      // Verify Registry state
      expect(userRegistry.has(user!.id)).toBe(true);
      expect(userRegistry.findByEmail('jane@example.com')).toBeDefined();
    });

    it('should handle creation errors gracefully and rethrow', async () => {
      // 1. Force the Firebase mock to fail
      mockUpdateUser.mockRejectedValueOnce(new Error('Firebase Error'));

      const params = {
        auth_uid: 'fail',
        firstname: 'X',
        lastname: 'Y',
        email: 'fail@example.com', // Trigger the Firebase branch
      };

      // 2. Clear the User mock implementation for this test to ensure
      // no "Jane Doe" side effects are lingering from previous implementation overrides
      (User as Mock).mockImplementation(function (id) {
        this.id = id;
        this.applyServerProfilePatch = vi.fn();
        this.applyProfilePatch = vi.fn();
        this.load = vi.fn();
        return this;
      });

      // 3. Execution & Assertion
      await expect(userRegistry.create(params)).rejects.toThrow(
        'Firebase Error'
      );

      // 4. Verify the user was NOT added to the map
      expect(userRegistry.count).toBe(0);
    });
  });

  describe('Indexing & VisitorId', () => {
    it('should build the visitor index correctly during loadIndex', async () => {
      vi.mocked(s3Service.listFolders).mockResolvedValue(['users/user1/']);

      (User as Mock).mockImplementation(function (id) {
        this.id = id;
        this.sessions = [{ visitorid: 'v-123' }];
        this.load = vi.fn().mockResolvedValue(undefined);
        return this;
      });

      await userRegistry.loadIndex();
      expect(userRegistry.findByVisitorId('v-123')).toBeDefined();
    });
  });

  describe('Search & Hot-Patching', () => {
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
      expect(userRegistry.findByEmail('ALICE@gmail.com')).toBeDefined();
    });

    it('should perform a hot-update of the visitorIndex using updateIndexForUser', async () => {
      const visitorId = 'hot-session-999';
      (User as Mock).mockImplementation(function (id) {
        this.id = id;
        this.sessions = [{ visitorid: visitorId }];
        this.load = vi.fn().mockResolvedValue(undefined);
        return this;
      });

      const newUser = new User('user_999');
      userRegistry.updateIndexForUser(newUser);

      expect(userRegistry.findByVisitorId(visitorId)).toBeDefined();
      expect(userRegistry.findById('user_999')).toBeDefined();
    });
  });

  describe('User Deletion', () => {
    const mockDeleteUser = vi.fn().mockResolvedValue({});

    // Update the getAuth mock for this block
    beforeEach(() => {
      vi.mocked(getAuth as Mock).mockReturnValue({
        deleteUser: mockDeleteUser,
      });
    });

    it('should delete from Firebase, S3, and the Registry', async () => {
      // 1. Setup an existing user in the registry
      const userId = 'USER_TO_DELETE';
      const visitorId = 'session_to_purge';

      (User as Mock).mockImplementation(function (id) {
        this.id = id;
        this.profile = { auth_uid: 'fb_delete_123' };
        this.sessions = [{ visitorid: visitorId }];
        this.load = vi.fn().mockResolvedValue(undefined);
        return this;
      });

      const user = new User(userId);
      userRegistry.updateIndexForUser(user);

      // 2. Action
      const result = await userRegistry.delete(userId);

      // 3. Assertions
      expect(result).toBe(true);
      expect(mockDeleteUser).toHaveBeenCalledWith('fb_delete_123');
      expect(s3Service.deleteFolder).toHaveBeenCalledWith(`users/${userId}/`);

      // 4. Verify memory is clean
      expect(userRegistry.has(userId)).toBe(false);
      expect(userRegistry.findByVisitorId(visitorId)).toBeUndefined();
    });

    it('should return false if the user does not exist', async () => {
      const result = await userRegistry.delete('non_existent_id');
      
      expect(result).toBe(false);
      expect(mockDeleteUser).not.toHaveBeenCalled();
    });
  });

  describe('Maintenance', () => {
    it('should not rebuild index if no users were cleaned', async () => {
      vi.mocked(s3Service.listFolders).mockResolvedValue(['users/user1/']);
      const rebuildSpy = vi.spyOn(
        userRegistry as unknown as { rebuildVisitorIndex: () => void },
        'rebuildVisitorIndex'
      );

      await userRegistry.performHistoryMaintenance();
      expect(rebuildSpy).not.toHaveBeenCalled();
    });
  });
});
