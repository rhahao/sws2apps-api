import { logger } from '../utils/index.js';
import { User } from '../models/index.js';
import { s3Service } from './s3.service.js';
import { FirebaseAuthError, getAuth } from 'firebase-admin/auth';

class UserRegistry {
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

      await newUser.applyServerProfilePatch({
        auth_uid,
        createdAt: new Date().toISOString(),
        role: 'vip',
      });

      await newUser.applyProfilePatch({
        firstname: { value: firstname, updatedAt: new Date().toISOString() },
        lastname: { value: lastname, updatedAt: new Date().toISOString() },
      });

      await newUser.load();

      this.updateIndexForUser(newUser);

      return newUser;
    } catch (error) {
      logger.error(`Failed to create user ${params.auth_uid}:`, error);

      throw error;
    }
  }

  /**
   * Deletes a user from Firebase, S3, and the local registry.
   */
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
          if (authError instanceof FirebaseAuthError) {
            if (authError.code !== 'auth/user-not-found') {
              throw authError;
            }
          }
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
}

export const userRegistry = new UserRegistry();
