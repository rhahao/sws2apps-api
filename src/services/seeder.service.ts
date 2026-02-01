import type API from '../types/index.js';
import AuthService from './auth.service.js';
import Model from '../models/index.js';
import Config from '../config/index.js';
import Utility from '../utils/index.js';
import Users from './users.service.js';

export class SeederService {
  async runDevelopment() {
    // Only run in development/test
    if (Config.ENV.nodeEnv === 'production') {
      return;
    }

    Utility.Logger.info('Running development seeder...');

    const testUsers = [
      {
        id: '8E17906A-DF57-40A3-BE7A-50781EFDBF19',
        uid: 'hGZjWcLTLjzImZCBFsHjHtAuDgrM',
        email: 'admin@test.com',
        role: 'admin' as API.UserGlobalRoleType,
        firstname: 'Admin',
        lastname: 'Test',
      },
      {
        id: '0F8A0AC2-B4D9-4D9C-991C-965631E1A589',
        uid: 'CmoPmwOni3mQHJWECP98b5tS9zvi',
        email: 'vip@test.com',
        role: 'vip' as API.UserGlobalRoleType,
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

      await AuthService.importUsers(usersToImport);
      Utility.Logger.info('Firebase users setup (import complete)');
    } catch (error) {
      Utility.Logger.error('Failed to import Firebase users:', error);
    }

    for (const testUser of testUsers) {
      try {
        // 2. Ensure user exists in S3 via Registry check
        if (!Users.has(testUser.id)) {
          const user = new Model.User(testUser.id);
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

          Utility.Logger.info(`Seeded new test user: ${testUser.id}`);
        } else {
          Utility.Logger.info(
            `S3 storage already provisioned for: ${testUser.id}`
          );
        }
      } catch (error) {
        Utility.Logger.error(`Failed to seed user ${testUser.id}:`, error);
      }
    }
  }
}

export default new SeederService();
