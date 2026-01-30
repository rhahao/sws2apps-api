import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  UserRegistry,
  userRegistry,
} from '../../src/services/user_registry.service.js';
import { s3Service } from '../../src/services/s3.service.js';
import { User } from '../../src/models/index.js';
import { encryptData } from '../../src/utils/encryption.js';
import { FirebaseAuthError } from 'firebase-admin/auth';

/* -------------------- Firebase & Service Mocks -------------------- */
const mockUpdateUser = vi.fn().mockResolvedValue({});
const mockGetUserByEmail = vi.fn();
const mockCreateUser = vi.fn();
const mockCreateCustomToken = vi.fn().mockResolvedValue('mock-login-token');
const mockDeleteUser = vi.fn().mockResolvedValue({});

vi.mock('firebase-admin/auth', () => {
  class MockFirebaseAuthError extends Error {
    code: string;
    constructor(code: string) {
      super(code);
      this.code = code;
    }
  }

  return {
    FirebaseAuthError: MockFirebaseAuthError,
    getAuth: vi.fn(() => ({
      updateUser: mockUpdateUser,
      getUserByEmail: mockGetUserByEmail,
      createUser: mockCreateUser,
      createCustomToken: mockCreateCustomToken,
      deleteUser: mockDeleteUser,
    })),
  };
});

vi.mock('../../src/utils/logger.js');
vi.mock('../../src/services/s3.service.js');

/* -------------------- User Model Mock -------------------- */
vi.mock('../../src/models/index.js', () => ({
  User: vi.fn().mockImplementation(function (id) {
    this.id = id;
    // Define readonly properties safely
    Object.defineProperty(this, 'email', { value: undefined, writable: true });
    Object.defineProperty(this, 'sessions', { value: [], writable: true });
    Object.defineProperty(this, 'profile', {
      value: { role: 'vip' },
      writable: true,
    });

    this.load = vi.fn();
    this.applyServerProfilePatch = vi.fn();
    this.applyProfilePatch = vi.fn();
    this.fetchMutations = vi.fn().mockResolvedValue([]);
    this.cleanupMutations = vi
      .fn()
      .mockReturnValue({ pruned: [], hasChanged: false });
    this.cleanupSessions = vi.fn().mockReturnValue(false);
    this.saveMutations = vi.fn();
    this.saveSessions = vi.fn();
    return this;
  }),
}));

/* -------------------- Encryption Mock -------------------- */
vi.mock('../../src/utils/encryption.js', () => ({
  encryptData: vi.fn((d) => `MOCK_ENC_${d}`),
  decryptData: vi.fn((d) =>
    d?.startsWith('MOCK_ENC_') ? d.replace('MOCK_ENC_', '') : null
  ),
}));

/* -------------------- Helper -------------------- */
const buildHandshake = (overrides = {}) =>
  encryptData(
    JSON.stringify({
      e: 'auth@test.com',
      c: '123456',
      x: Date.now() + 10_000,
      isMagic: true,
      ...overrides,
    })
  );

/* -------------------- Lean Test Suite -------------------- */
describe('UserRegistry (Lean Suite)', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.mocked(s3Service.listFolders).mockResolvedValue([]);
    await userRegistry.loadIndex();
  });

  /* ---------------- User Creation ---------------- */

  it('creates a user and syncs with Firebase', async () => {
    await userRegistry.create({
      auth_uid: 'fb_123',
      firstname: 'Jane',
      lastname: 'Doe',
      email: 'jane@example.com',
    });

    expect(mockUpdateUser).toHaveBeenCalledWith(
      'fb_123',
      expect.objectContaining({
        email: 'jane@example.com',
        displayName: 'Jane Doe',
      })
    );
  });

  it('indexes user so it can be found by email', async () => {
    (User as any).mockImplementationOnce(function (id) {
      this.id = id;
      this.sessions = [];
      this.profile = { role: 'user', auth_uid: 'fb_123' };
      this.email = 'jane@example.com';
      this.load = vi.fn().mockResolvedValue(undefined);
      this.applyServerProfilePatch = vi.fn();
      this.applyProfilePatch = vi.fn();
    });

    await userRegistry.create({
      auth_uid: 'fb_123',
      firstname: 'Jane',
      lastname: 'Doe',
      email: 'jane@example.com',
    });

    expect(userRegistry.findByEmail('jane@example.com')).toBeDefined();
  });

  it('rethrows Firebase errors and does not mutate registry', async () => {
    mockUpdateUser.mockRejectedValueOnce(new Error('Firebase Error'));

    await expect(
      userRegistry.create({
        auth_uid: 'fail',
        firstname: 'X',
        lastname: 'Y',
        email: 'fail@example.com',
      })
    ).rejects.toThrow('Firebase Error');

    expect(userRegistry.count).toBe(0);
  });

  /* ---------------- Pocket User ---------------- */

  it('encrypts pocket code on creation', async () => {
    const user = await userRegistry.createPocket({
      user_firstname: 'Secure',
      user_lastname: 'User',
      user_secret_code: 'raw_code',
      cong_id: 'C1',
      cong_role: [],
      cong_person_uid: 'P1',
    });

    expect(encryptData).toHaveBeenCalledWith('raw_code');
    expect(userRegistry.has(user.id)).toBe(true);
  });

  /* ---------------- verifyAndCreate ---------------- */

  it('fails on invalid handshake', async () => {
    await expect(
      userRegistry.verifyAndCreate({ handshake: 'bad' })
    ).rejects.toThrow('api.auth.invalid_handshake');
  });

  it('fails on expired handshake', async () => {
    const expired = buildHandshake({ x: Date.now() - 1000 });
    await expect(
      userRegistry.verifyAndCreate({ handshake: expired })
    ).rejects.toThrow('api.auth.otp_expired');
  });

  it('fails on wrong OTP for non-magic', async () => {
    const h = buildHandshake({ isMagic: false });
    await expect(
      userRegistry.verifyAndCreate({ handshake: h, otp: 'wrong' })
    ).rejects.toThrow('api.auth.invalid_otp');
  });

  it('creates user via magic link when not found in Firebase', async () => {
    mockGetUserByEmail.mockRejectedValueOnce(
      new FirebaseAuthError('auth/user-not-found')
    );
    mockCreateUser.mockResolvedValueOnce({ uid: 'fb_magic' });

    const result = await userRegistry.verifyAndCreate({
      handshake: buildHandshake({ e: 'magic@test.com' }),
    });
    expect(result.token).toBe('mock-login-token');
  });

  it('reuses existing Firebase user if found', async () => {
    mockGetUserByEmail.mockResolvedValueOnce({ uid: 'fb_old' });
    await userRegistry.verifyAndCreate({
      handshake: buildHandshake({ e: 'existing@test.com' }),
    });
    expect(mockCreateUser).not.toHaveBeenCalled();
  });

  /* ---------------- Indexing ---------------- */

  it('indexes visitor sessions during loadIndex', async () => {
    vi.mocked(s3Service.listFolders).mockResolvedValue(['users/u1/']);
    (User as any).mockImplementationOnce(function (id) {
      this.id = id;
      Object.defineProperty(this, 'sessions', {
        value: [{ visitorid: 'v-123' }],
        writable: true,
      });
      this.load = vi.fn();
    });

    await userRegistry.loadIndex();
    expect(userRegistry.findByVisitorId('v-123')).toBeDefined();
  });

  it('removes visitor session from index', () => {
    const u = new User('u1');
    (u as any).sessions.push({ visitorid: 'v-123' });
    userRegistry.updateIndexForUser(u);

    userRegistry.removeVisitorSession('v-123');
    expect(userRegistry.findByVisitorId('v-123')).toBeUndefined();
  });

  /* ---------------- Deletion ---------------- */

  it('deletes user from Firebase', async () => {
    const u = new User('del');
    Object.defineProperty(u, 'profile', {
      value: { auth_uid: 'fb_del' },
      writable: true,
    });
    userRegistry.updateIndexForUser(u);

    await userRegistry.delete('del');
    expect(mockDeleteUser).toHaveBeenCalledWith('fb_del');
  });

  it('deletes user folder from S3', async () => {
    const u = new User('del2');
    Object.defineProperty(u, 'profile', {
      value: { auth_uid: 'fb_del2' },
      writable: true,
    });
    userRegistry.updateIndexForUser(u);

    await userRegistry.delete('del2');
    expect(s3Service.deleteFolder).toHaveBeenCalledWith('users/del2/');
  });

  it('removes user from registry after deletion', async () => {
    const u = new User('del3');
    Object.defineProperty(u, 'profile', {
      value: { auth_uid: 'fb_del3' },
      writable: true,
    });
    userRegistry.updateIndexForUser(u);

    await userRegistry.delete('del3');
    expect(userRegistry.has('del3')).toBe(false);
  });

  it('continues deletion if Firebase fails', async () => {
    const u = new User('del4');
    Object.defineProperty(u, 'profile', {
      value: { auth_uid: 'fb_fail' },
      writable: true,
    });
    userRegistry.updateIndexForUser(u);

    mockDeleteUser.mockRejectedValueOnce(new Error('fail'));
    const result = await userRegistry.delete('del4');
    expect(result).toBe(true);
    expect(s3Service.deleteFolder).toHaveBeenCalled();
  });

  /* ---------------- Maintenance ---------------- */

  it('skips rebuild if no changes', async () => {
    const spy = vi.spyOn(userRegistry as any, 'rebuildVisitorIndex');
    await userRegistry.performHistoryMaintenance();
    expect(spy).not.toHaveBeenCalled();
  });

  it('rebuilds index if changes occur', async () => {
    (User as any).mockImplementationOnce(function (id) {
      this.id = id;
      this.sessions = [];
      this.fetchMutations = vi.fn().mockResolvedValue([{}]);
      this.load = vi.fn().mockResolvedValue(undefined);
      this.cleanupMutations = vi
        .fn()
        .mockReturnValue({ pruned: [], hasChanged: true });
      this.saveMutations = vi.fn().mockResolvedValue(undefined);
      this.cleanupSessions = vi.fn().mockReturnValue(false);
      this.saveSessions = vi.fn().mockResolvedValue(undefined);
    });

    const user = new User('u2');
    await user.load();

    userRegistry.updateIndexForUser(user);

    type UserRegistryTestable = UserRegistry & {
      rebuildVisitorIndex: () => void;
    };

    const spy = vi.spyOn(
      userRegistry as UserRegistryTestable,
      'rebuildVisitorIndex'
    );
    await userRegistry.performHistoryMaintenance();
    expect(spy).toHaveBeenCalled();
  });

  /* ---------------- Auth Link Generation ---------------- */

  it('generates OTP and links correctly', () => {
    const { browserLink, emailLink, otp } = userRegistry.generateAuthLink({
      email: 'test@example.com',
      origin: 'http://localhost:4050',
    });

    expect(otp).toMatch(/^\d{6}$/);
    expect(browserLink).not.toEqual(emailLink);
    expect(browserLink).toContain('handshake=');
  });
});
