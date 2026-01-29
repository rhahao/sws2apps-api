import { getAuth } from 'firebase-admin/auth';
import { UserGlobalRoleType } from '../types/index.js';
import { User } from '../models/index.js';
import { ENV } from '../config/index.js';
import { logger } from '../utils/index.js';
import { userRegistry } from './user_registry.service.js';

export class SeederService {
  async runDevelopmentSeeder() {
    // Only run in development/test
    if (ENV.nodeEnv === 'production') {
      return;
    }

    const firebaseAuth = getAuth();

    if (!firebaseAuth) {
      logger.warn('Firebase Auth not initialized. Skipping seeder.');
      return;
    }

    logger.info('Running development seeder...');

    const testUsers = [
      {
        id: '8E17906A-DF57-40A3-BE7A-50781EFDBF19',
        uid: 'hGZjWcLTLjzImZCBFsHjHtAuDgrM',
        email: 'admin@test.com',
        role: 'admin' as UserGlobalRoleType,
        firstname: 'Admin',
        lastname: 'Test',
      },
      {
        id: '0F8A0AC2-B4D9-4D9C-991C-965631E1A589',
        uid: 'CmoPmwOni3mQHJWECP98b5tS9zvi',
        email: 'vip@test.com',
        role: 'vip' as UserGlobalRoleType,
        firstname: 'User',
        lastname: 'Test',
      },
    ];

    // 1. Bulk import users into Firebase Auth
    try {
      const usersToImport = testUsers.map((u) => ({
        uid: u.uid,
        email: u.email,
        displayName: `${u.firstname} ${u.lastname}`,
        providerData: [
          {
            uid: u.uid,
            email: u.email,
            displayName: `${u.firstname} ${u.lastname}`,
            providerId: 'google.com',
          },
        ],
      }));

      await firebaseAuth.importUsers(usersToImport);
      logger.info('Firebase users setup (import complete)');
    } catch (error) {
      logger.error('Failed to import Firebase users:', error);
    }

    for (const testUser of testUsers) {
      try {
        // 2. Ensure user exists in S3 via Registry check
        if (!userRegistry.has(testUser.id)) {
          const user = new User(testUser.id);
          const timestamp = new Date().toISOString();

          // 1. Set server-side identity & roles (Quiet save)
          await user.applyServerProfilePatch({
            role: testUser.role,
            auth_uid: testUser.uid,
            createdAt: timestamp,
          });

          // 2. Set client-mutable names (Triggers ETag v1)
          await user.applyProfilePatch({
            firstname: { value: testUser.firstname, updatedAt: timestamp },
            lastname: { value: testUser.lastname, updatedAt: timestamp },
          });

          logger.info(`Seeded new test user: ${testUser.id}`);
        } else {
          logger.info(`S3 storage already provisioned for: ${testUser.id}`);
        }
      } catch (error) {
        logger.error(`Failed to seed user ${testUser.id}:`, error);
      }
    }
  }
}

export const seederService = new SeederService();
