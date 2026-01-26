import admin from 'firebase-admin';
import { config } from './index.js';
import { logger } from '../utils/index.js';

export const initializeFirebaseAdmin = () => {
  try {
    if (!admin.apps.length) {
      const isEmulator = !!process.env.FIREBASE_AUTH_EMULATOR_HOST;

      admin.initializeApp({
        credential: admin.credential.cert({
          projectId: config.firebase.projectId,
          privateKey: config.firebase.privateKey,
          clientEmail: config.firebase.clientEmail,
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
