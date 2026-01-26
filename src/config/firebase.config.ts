import admin from 'firebase-admin';
import { ENV } from './index.js';
import { logger } from '../utils/index.js';

export const initializeFirebaseAdmin = () => {
  try {
    if (!admin.apps.length) {
      const isEmulator = !!process.env.FIREBASE_AUTH_EMULATOR_HOST;

      admin.initializeApp({
        credential: admin.credential.cert({
          projectId: ENV.firebase.projectId,
          privateKey: ENV.firebase.privateKey,
          clientEmail: ENV.firebase.clientEmail,
        }),
      });

      if (isEmulator) {
        logger.info('Firebase Admin initialized with Auth Emulator');
      } else {
        logger.info('Firebase Admin initialized successfully');
      }
    }
  } catch (error) {
    logger.error('Error initializing Firebase Admin:', error);
  }
};
