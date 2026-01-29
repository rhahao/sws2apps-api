import { describe, it, expect, vi } from 'vitest';
import supertest from 'supertest';
import app from '../../src/app.js';

// Mock logger
vi.mock('../../src/utils/logger.js');

vi.mock('../../src/services/index.js', () => ({
  appService: {
    isReady: true, // This is the key to bypassing the readinessGuard
    installations: [],
    flags: [],
    evaluateFeatureFlags: vi.fn().mockResolvedValue({ FLAG: true }),
    updateInstallationRegistry: vi.fn().mockResolvedValue(undefined),
    saveFlags: vi.fn().mockResolvedValue(undefined),
    saveInstallations: vi.fn().mockResolvedValue(undefined),
  },
  userRegistry: {
    getUsersCount: vi.fn().mockReturnValue(0),
    findById: vi.fn().mockReturnValue(undefined),
    getUsers: vi.fn().mockReturnValue([]),
    updateFlags: vi.fn().mockResolvedValue(undefined),
  },
  congregationRegistry: {
    getCongregationsCount: vi.fn().mockReturnValue(0),
    findById: vi.fn().mockReturnValue(undefined),
    getCongregations: vi.fn().mockReturnValue([]),
    saveFlags: vi.fn().mockResolvedValue(undefined),
  },
  firebaseService: {
    all: vi.fn().mockResolvedValue({}),
  },
  s3Service: {},
  scheduler: {},
  seeder: {},
  initStorage: {},
  initI18n: () => Promise.resolve(),
  i18nMiddleware: (req, res, next) => next(),
}));

describe('Public Endpoints', () => {
  const request = supertest(app);

  describe('GET /', () => {
    it('should return 200 OK with a welcome message', async () => {
      const response = await request.get('/');
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('sws2apps-api is running');
    });
  });

  describe('GET /health', () => {
    it('should return 200 OK with the service status', async () => {
      const response = await request.get('/health');
      expect(response.status).toBe(200);
      expect(response.body.status).toBe('READY');
    });
  });

  describe('GET /api/v4/public/feature-flags', () => {
    it('should return 200 OK with an empty object for a valid request', async () => {
      const response = await request
        .get('/api/v4/public/feature-flags')
        .set('installation', 'test-installation-id');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ FLAG: true });
    });

    it('should return 400 Bad Request if installation header is missing', async () => {
      const response = await request.get('/api/v4/public/feature-flags');

      expect(response.status).toBe(400);
    });
  });
});
