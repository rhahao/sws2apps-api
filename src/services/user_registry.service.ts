import { FirebaseAuthError, getAuth } from 'firebase-admin/auth';
import randomstring from 'randomstring';
import { decryptData, encryptData, logger } from '../utils/index.js';
import { User } from '../models/index.js';
import { s3Service } from './s3.service.js';
import { AppRoleType, GenericObject } from '../types/index.js';

export class UserRegistry {
  private users: Map<string, User> = new Map();
  private visitorIndex: Map<string, string> = new Map();

  get count() {
    return Array.from(this.users.values()).filter(
      (u) => u.profile?.role !== 'admin'
    ).length;
  }

  private getUsers() {
    return Array.from(this.users.values());
  }

  private indexUserSessions(user: User) {
    user.sessions.forEach((session) => {
      if (session.visitorid) {
        this.visitorIndex.set(session.visitorid, user.id);
      }
    });
  }

  private rebuildVisitorIndex() {
    this.visitorIndex.clear();

    for (const user of this.users.values()) {
      this.indexUserSessions(user);
    }
  }

  public async loadIndex() {
    try {
      const startTime = Date.now();
      logger.info('Indexing users from storage...');

      const folders = await s3Service.listFolders('users/');
      this.users.clear();

      const userIds = folders
        .map((f) => f.split('/')[1])
        .filter((id): id is string => !!id);

      // Process in concurrent batches to optimize startup speed
      const CONCURRENCY_LIMIT = 20;
      let processedCount = 0;

      for (let i = 0; i < userIds.length; i += CONCURRENCY_LIMIT) {
        const batch = userIds.slice(i, i + CONCURRENCY_LIMIT);

        await Promise.all(
          batch.map(async (userId) => {
            processedCount++;
            try {
              logger.info(
                `Indexing user ${userId} (${processedCount}/${userIds.length})...`
              );
              const user = new User(userId);

              await user.load();

              this.users.set(userId, user);

              this.indexUserSessions(user);
            } catch (err) {
              logger.error(
                `Failed to load user ${userId} during indexing:`,
                err
              );
            }
          })
        );
      }

      const duration = ((Date.now() - startTime) / 1000).toFixed(2);
      logger.info(
        `Successfully indexed ${this.users.size} users in ${duration}s.`
      );
    } catch (error) {
      logger.error('Failed to load user index:', error);
    }
  }

  public has(id: string) {
    return this.users.has(id);
  }

  public findById(id: string) {
    return this.users.get(id);
  }

  public findByEmail(email: string) {
    const users = this.users.values();

    return users.find(
      (user) => user.email?.toLowerCase() === email.toLowerCase()
    );
  }

  public findByVisitorId(visitorId: string) {
    const userId = this.visitorIndex.get(visitorId);

    return userId ? this.users.get(userId) : undefined;
  }

  public updateIndexForUser(user: User) {
    this.users.set(user.id, user);

    this.indexUserSessions(user);
  }

  public removeVisitorSession(visitorId: string) {
    this.visitorIndex.delete(visitorId);
  }

  public async performHistoryMaintenance() {
    logger.info('Starting daily history maintenance...');

    const users = this.getUsers();

    let usersCleaned = 0;

    const cutoff = new Date();

    cutoff.setMonth(cutoff.getMonth() - 6);

    for (const user of users) {
      try {
        // 1. Maintain History (Mutations)
        const mutations = await user.fetchMutations();
        const { pruned, hasChanged } = user.cleanupMutations(mutations, cutoff);

        if (hasChanged) {
          await user.saveMutations(pruned);
        }

        // 2. Maintain Active Sessions
        // Note: _sessions are already loaded during Registry indexing
        const sessionsPruned = user.cleanupSessions(cutoff);

        if (sessionsPruned) {
          await user.saveSessions(user.sessions);
        }

        if (hasChanged || sessionsPruned) {
          usersCleaned++;
        }
      } catch (error) {
        logger.error(`Failed maintenance for user ${user.id}:`, error);
      }
    }

    if (usersCleaned > 0) {
      this.rebuildVisitorIndex();
    }

    logger.info(
      `History maintenance completed. Cleaned ${usersCleaned} users.`
    );
  }

  public async create(params: {
    auth_uid: string;
    firstname: string;
    lastname: string;
    email?: string;
  }) {
    try {
      const { auth_uid, firstname, lastname, email } = params;

      if (email) {
        let displayName = firstname;

        if (lastname) {
          if (!displayName) {
            displayName = lastname;
          } else {
            displayName += ` ${lastname}`;
          }
        }

        await getAuth().updateUser(auth_uid, {
          email: email,
          displayName: displayName,
        });
      }

      const userId = crypto.randomUUID().toUpperCase();

      const newUser = new User(userId);
      const now = new Date().toISOString();

      await newUser.applyServerProfilePatch({
        auth_uid,
        createdAt: now,
        role: 'vip',
      });

      await newUser.applyProfilePatch({
        firstname: { value: firstname, updatedAt: now },
        lastname: { value: lastname, updatedAt: now },
      });

      await newUser.load();

      this.updateIndexForUser(newUser);

      return newUser;
    } catch (error) {
      logger.error(`Failed to create user ${params.auth_uid}:`, error);

      throw error;
    }
  }

  public async delete(userId: string) {
    try {
      const user = this.users.get(userId);

      if (!user) {
        logger.warn(`Delete failed: User ${userId} not found in registry.`);
        return false;
      }

      // 1. Delete from Firebase Auth if auth_uid exists
      const authUid = user.profile?.auth_uid;

      if (authUid) {
        try {
          await getAuth().deleteUser(authUid);
        } catch (authError) {
          // just log firebase error but proceed with S3 delete
          logger.error(`Failed to delete firebase user ${authUid}:`, authError);
        }
      }

      // 2. Delete S3 Folder (users/{userId}/)
      await s3Service.deleteFolder(`users/${userId}/`);

      // 3. Remove from Registry and rebuild Visitor Index
      this.users.delete(userId);
      this.rebuildVisitorIndex();

      logger.info(`User ${userId} deleted successfully from all systems.`);

      return true;
    } catch (error) {
      logger.error(`Failed to delete user ${userId}:`, error);

      throw error;
    }
  }

  public async createPocket(params: {
    user_firstname: string;
    user_lastname: string;
    user_secret_code: string;
    cong_id: string;
    cong_role: AppRoleType[];
    cong_person_uid: string;
  }) {
    try {
      const {
        user_firstname,
        user_lastname,
        user_secret_code,
        cong_id,
        cong_role,
        cong_person_uid,
      } = params;

      // 1. Generate internal ID and initialize Model
      const userId = crypto.randomUUID().toUpperCase();
      const newUser = new User(userId);
      const now = new Date().toISOString();

      // 2. Apply "Pocket" specific profile patches
      await newUser.applyServerProfilePatch({
        role: 'pocket',
        createdAt: now,
        congregation: {
          id: cong_id,
          pocket_invitation_code: encryptData(user_secret_code),
          account_type: 'pocket',
          cong_role,
          user_local_uid: cong_person_uid,
        },
      });

      await newUser.applyProfilePatch({
        firstname: { value: user_firstname, updatedAt: now },
        lastname: { value: user_lastname, updatedAt: now },
      });

      this.updateIndexForUser(newUser);

      logger.info(
        `Pocket user created: ${userId} for congregation: ${cong_id}`
      );

      return newUser;
    } catch (error) {
      logger.error(`Failed to create pocket user:`, error);
      throw error;
    }
  }

  public generateAuthLink(params: { email: string; origin: string }) {
    const { email, origin } = params;

    try {
      const user = this.findByEmail(email);

      const claims: GenericObject = {
        email,
      };

      if (user) {
        claims.uid = user.profile.auth_uid;
      }

      const emailOTP = randomstring.generate({ length: 6, charset: 'numeric' });
      const expires = Date.now() + 5 * 60 * 1000;

      // Does NOT allow magic login. Requires 'c' (code) to be provided by user.
      const browserHandshake = encryptData(
        JSON.stringify({
          e: email,
          c: emailOTP,
          x: expires,
          isMagic: false,
        })
      );

      // Contains the same data but 'isMagic' is true.
      const emailHandshake = encryptData(
        JSON.stringify({
          e: email,
          c: emailOTP,
          x: expires,
          isMagic: true,
        })
      );

      const browserLink = `${origin}/#/?handshake=${encodeURIComponent(
        browserHandshake
      )}`;

      const emailLink = `${origin}/#/?handshake=${encodeURIComponent(
        emailHandshake
      )}`;

      return { browserLink, emailLink, otp: emailOTP };
    } catch (error) {
      logger.error(`Failed to generate auth link:`, error);
      throw error;
    }
  }

  public async verifyAndCreate(params: { handshake: string; otp?: string }) {
    const { handshake, otp } = params;

    try {
      // 1. Decrypt the handshake
      const decrypted = decryptData(handshake);

      if (!decrypted) throw new Error('api.auth.invalid_handshake');

      const {
        e: email,
        c: correctCode,
        x: expires,
        isMagic,
      } = JSON.parse(decrypted);

      // 1. Validate Expiry
      if (Date.now() > expires) throw new Error('api.auth.otp_expired');

      // 2. Dual-Path Verification
      // If not a magic link, we MUST validate the OTP
      if (!isMagic) {
        if (!otp || otp !== correctCode) {
          throw new Error('api.auth.invalid_otp');
        }
      }

      // 3. The Commit Moment
      const auth = getAuth();

      let authUid: string;

      try {
        const userRecord = await auth.getUserByEmail(email);
        authUid = userRecord.uid;
      } catch (error) {
        if (
          error instanceof FirebaseAuthError &&
          error.code === 'auth/user-not-found'
        ) {
          const newUser = await auth.createUser({ email });
          authUid = newUser.uid;
        } else {
          throw error;
        }
      }

      // 4. Create S3 Record
      let user = this.findByEmail(email);

      if (!user) {
        user = await this.create({
          auth_uid: authUid,
          firstname: '',
          lastname: '',
          email,
        });
      }

      // 5. Generate the actual login token
      const loginToken = await auth.createCustomToken(authUid);

      return { token: loginToken, user };
    } catch (error) {
      logger.error(`Failed to verify and create user:`, error);

      throw error;
    }
  }
}

export const userRegistry = new UserRegistry();
