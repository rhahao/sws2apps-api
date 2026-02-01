import { getAuth, UpdateRequest, UserImportRecord } from 'firebase-admin/auth';
import admin from 'firebase-admin';
import Config from '../config/index.js';
import Utility from '../utils/index.js';

class AuthService {
  public async initialize() {
    try {
      const isEmulator = !!process.env.FIREBASE_AUTH_EMULATOR_HOST;

      admin.initializeApp({
        credential: admin.credential.cert({
          projectId: Config.ENV.firebase.projectId,
          privateKey: Config.ENV.firebase.privateKey,
          clientEmail: Config.ENV.firebase.clientEmail,
        }),
      });

      if (isEmulator) {
        Utility.Logger.info('Auth initialized with Emulator');
      } else {
        Utility.Logger.info('Auth initialized successfully');
      }
    } catch (error) {
      Utility.Logger.error('Error initializing Auth service:', error);
      throw error;
    }
  }

  public async verifyToken(token: string) {
    try {
      const decodedToken = await getAuth().verifyIdToken(token);
      return decodedToken;
    } catch (error) {
      Utility.Logger.error('Error verifying Auth token:', error);
      throw error;
    }
  }

  public async getUserInfo(uid: string) {
    try {
      const user = await getAuth().getUser(uid);

      if (!user) return;

      const result = { email: user.email!, provider: 'email' };

      if (user) {
        const providerId = user.providerData[0]?.providerId;
        if (providerId) result.provider = providerId;
      }

      return result;
    } catch (error) {
      Utility.Logger.error('Error getting Auth user:', error);
      throw error;
    }
  }

  public async importUsers(users: UserImportRecord[]) {
    try {
      const result = await getAuth().importUsers(users);
      return result;
    } catch (error) {
      Utility.Logger.error('Error importing Auth users:', error);
      throw error;
    }
  }

  public async updateUser(uid: string, properties: UpdateRequest) {
    try {
      await getAuth().updateUser(uid, properties);
    } catch (error) {
      Utility.Logger.error('Error updating Auth user:', error);
      throw error;
    }
  }

  public async deleteUser(uid: string) {
    await getAuth().deleteUser(uid);
  }
}

export default new AuthService();
