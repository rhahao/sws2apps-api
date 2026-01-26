import { describe, it, expect, beforeEach, vi, Mock } from 'vitest';
import { User } from '../../src/models/user.model.js';
import { s3Service } from '../../src/services/s3.service.js';

// Mock s3Service
vi.mock('../../src/services/s3.service.js', () => ({
  s3Service: {
    getFile: vi.fn(),
    uploadFile: vi.fn(),
    getObjectMetadata: vi.fn(),
  },
}));

// Mock logger
vi.mock('../../src/utils/index.js', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    logger: {
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
    },
  };
});

// Mock the config for logger (since logger now uses it directly)
vi.mock('../../src/config/index.js', () => ({
  config: {
    nodeEnv: 'development',
    logtailSourceToken: 'test-token',
    logtailEndpoint: 'test-endpoint',
  },
}));

describe('User Model - applyBatchedChanges', () => {
  let user: User;
  const userId = 'test-user-id';

  beforeEach(() => {
    user = new User(userId);
    vi.clearAllMocks();

    // Mock default file content
    (s3Service.getFile as Mock).mockImplementation(async (key: string) => {
      if (key.includes('profile.json')) {
        return JSON.stringify({
          firstname: { value: 'Original', updatedAt: '2026-01-01T00:00:00Z' },
          lastname: { value: 'Original', updatedAt: '2026-01-01T00:00:00Z' },
        });
      }
      if (key.includes('settings.json')) {
        return JSON.stringify({
          backup_automatic: {
            value: 'enabled',
            updatedAt: '2026-01-01T00:00:00Z',
          },
          theme_follow_os_enabled: {
            value: 'true',
            updatedAt: '2026-01-01T00:00:00Z',
          },
          hour_credits_enabled: {
            value: 'true',
            updatedAt: '2026-01-01T00:00:00Z',
          },
          data_view: { value: 'default', updatedAt: '2026-01-01T00:00:00Z' },
        });
      }
      if (key.includes('mutations.json')) {
        return JSON.stringify([]);
      }
      return null;
    });

    (s3Service.getObjectMetadata as Mock).mockResolvedValue({ etag: 'v0' });
    (s3Service.uploadFile as Mock).mockResolvedValue({});
  });

  it('should apply a single profile patch and save with history', async () => {
    await user.load(); // Load initial data

    const patch = {
      firstname: { value: 'Updated', updatedAt: '2026-01-25T00:00:00Z' },
    };
    await user.applyBatchedChanges([{ scope: 'profile', patch: patch }]);

    expect(user.profile?.firstname.value).toBe('Updated');
    expect(s3Service.uploadFile).toHaveBeenCalledWith(
      `users/${userId}/mutations.json`,
      expect.any(String),
      'application/json'
    );
    expect(s3Service.uploadFile).toHaveBeenCalledWith(
      `users/${userId}/profile.json`,
      expect.any(String),
      'application/json'
    );
    expect(user.ETag).toBe('v1'); // ETag should be bumped
  });

  it('should apply a single settings patch and save with history', async () => {
    await user.load();

    const patch = {
      theme_follow_os_enabled: {
        value: 'disabled',
        updatedAt: '2026-01-25T00:00:00Z',
      },
    };
    await user.applyBatchedChanges([{ scope: 'settings', patch: patch }]);

    expect(user.settings?.theme_follow_os_enabled.value).toBe('disabled');
    expect(s3Service.uploadFile).toHaveBeenCalledWith(
      `users/${userId}/mutations.json`,
      expect.any(String),
      'application/json'
    );
    expect(s3Service.uploadFile).toHaveBeenCalledWith(
      `users/${userId}/settings.json`,
      expect.any(String),
      'application/json'
    );
    expect(user.ETag).toBe('v1');
  });

  it('should apply multiple patches across different scopes and save with history', async () => {
    await user.load();

    const profilePatch = {
      firstname: { value: 'John', updatedAt: '2026-01-25T01:00:00Z' },
    };
    const settingsPatch = {
      hour_credits_enabled: {
        value: 'false',
        updatedAt: '2026-01-25T02:00:00Z',
      },
    };

    await user.applyBatchedChanges([
      { scope: 'profile', patch: profilePatch },
      { scope: 'settings', patch: settingsPatch },
    ]);

    expect(user.profile?.firstname.value).toBe('John');
    expect(user.settings?.hour_credits_enabled.value).toBe('false');

    expect(s3Service.uploadFile).toHaveBeenCalledWith(
      `users/${userId}/mutations.json`,
      expect.any(String),
      'application/json'
    );
    expect(s3Service.uploadFile).toHaveBeenCalledWith(
      `users/${userId}/profile.json`,
      expect.any(String),
      'application/json'
    );
    expect(s3Service.uploadFile).toHaveBeenCalledWith(
      `users/${userId}/settings.json`,
      expect.any(String),
      'application/json'
    );
    expect(user.ETag).toBe('v1');
  });

  it('should not save if no actual changes are made by patches', async () => {
    await user.load();
    const initialProfile = { ...user.profile };
    const initialSettings = { ...user.settings };

    const profilePatch = {
      firstname: { value: 'Original', updatedAt: '2026-01-01T00:00:00Z' },
    }; // Older timestamp, no change
    const settingsPatch = {
      backup_automatic: { value: 'enabled', updatedAt: '2026-01-01T00:00:00Z' },
    }; // Same value and timestamp, no change

    await user.applyBatchedChanges([
      { scope: 'profile', patch: profilePatch },
      { scope: 'settings', patch: settingsPatch },
    ]);

    expect(user.profile).toEqual(initialProfile);
    expect(user.settings).toEqual(initialSettings);
    // Expect uploadFile not to have been called for mutations, profile, or settings
    expect(s3Service.uploadFile).not.toHaveBeenCalledWith(
      `users/${userId}/mutations.json`,
      expect.any(String),
      'application/json'
    );
    expect(s3Service.uploadFile).not.toHaveBeenCalledWith(
      `users/${userId}/profile.json`,
      expect.any(String),
      'application/json'
    );
    expect(s3Service.uploadFile).not.toHaveBeenCalledWith(
      `users/${userId}/settings.json`,
      expect.any(String),
      'application/json'
    );
    expect(user.ETag).toBe('v0'); // ETag should not be bumped
  });

  it('should handle partial updates in profile patch', async () => {
    await user.load();

    const patch = {
      firstname: { value: 'NewFName', updatedAt: '2026-01-25T00:00:00Z' },
      lastname: { value: 'NewLName', updatedAt: '2026-01-25T00:00:00Z' },
    };
    await user.applyBatchedChanges([{ scope: 'profile', patch: patch }]);

    expect(user.profile?.firstname.value).toBe('NewFName');
    expect(user.profile?.lastname?.value).toBe('NewLName'); // lastname was not mocked initially, should be added
    expect(user.ETag).toBe('v1');
  });

  it('should handle partial updates in settings patch', async () => {
    await user.load();

    const patch = {
      theme_follow_os_enabled: {
        value: 'true',
        updatedAt: '2026-01-25T00:00:00Z',
      },
    };
    await user.applyBatchedChanges([{ scope: 'settings', patch: patch }]);

    expect(user.settings?.theme_follow_os_enabled.value).toBe('true');
    expect(user.ETag).toBe('v1');
  });
});
