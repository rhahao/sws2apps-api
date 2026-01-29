import { describe, it, expect, vi, beforeEach } from 'vitest';
import { seederService } from '../../src/services/seeder.service.js';
import { ENV } from '../../src/config/index.js';
import * as firebaseAdmin from 'firebase-admin/auth';

// Mock Dependencies
vi.mock('firebase-admin/auth', () => ({
  getAuth: vi.fn(() => ({
    importUsers: vi.fn().mockResolvedValue({}),
  })),
}));

describe('SeederService', () => {
  it('### SAFETY CHECK: should abort immediately if ENV is production', async () => {
    vi.clearAllMocks();
    ENV.nodeEnv = 'production';

    const authSpy = vi.spyOn(firebaseAdmin, 'getAuth');

    await seederService.runDevelopmentSeeder();

    // The code should return before ever calling getAuth()
    expect(authSpy).not.toHaveBeenCalled();
  });
});
