import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { NextFunction, Request, Response } from 'express';

// Mock services before app is imported
vi.mock('../../src/services/index.js', () => ({
  default: {
    API: {
      isReady: true,
      settings: { clientMinimumVersion: '1.0.0' },
      installations: [],
      evaluateFeatureFlags: vi.fn().mockResolvedValue({}),
      saveInstallations: vi.fn().mockResolvedValue(undefined),
      load: vi.fn(),
    },
    i18n: {
      init: vi.fn().mockResolvedValue(undefined),
      middleware: (req: Request, res: Response, next: NextFunction) => next(),
    },
    Auth: {
      initialize: vi.fn(),
    },
    Congregations: { loadIndex: vi.fn() },
    Users: { loadIndex: vi.fn() },
    Scheduler: { register: vi.fn() },
    Seeder: { runDevelopment: vi.fn() },
    Socket: { init: vi.fn() },
  },
}));

// Mock storage to prevent any file system or S3 calls
vi.mock('../../src/storages/index.js');
// Mock logger to prevent console output during tests
vi.mock('../../src/utils/logger.js');

import supertest from 'supertest';
import app from '../../src/app.js';
import Service from '../../src/services/index.js';

describe('E2E API Tests', () => {
  const request = supertest(app);

  beforeEach(() => {
    vi.clearAllMocks();
    Service.API.isReady = true;
  });

  describe('Public Endpoints', () => {
    describe('GET /', () => {
      it('should return 200 OK with a welcome message', async () => {
        const response = await request.get('/');
        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.message).toBe('sws2apps-api is running');
      });
    });

    describe('GET /health', () => {
      it('should return 200 OK with status READY as API is mocked to be ready', async () => {
        const response = await request.get('/health');
        expect(response.status).toBe(200);
        expect(response.body.status).toBe('READY');
      });
    });
  });

  describe('/api/v4/public', () => {
    describe('GET /feature-flags', () => {
      it('should return 400 Bad Request if installation header is missing', async () => {
        const response = await request.get('/api/v4/public/feature-flags');
        expect(response.status).toBe(400);
        expect(response.body.error.code).toBe('api.validation.failed');
        expect(response.body.error.details[0].message).toBe(
          'Installation ID is required'
        );
      });

      it('should return 200 OK with feature flags for a given installation', async () => {
        const installationId = 'test-installation-id';
        const mockFlags = { 'new-feature': true };

        (Service.API.evaluateFeatureFlags as Mock).mockResolvedValueOnce(
          mockFlags
        );

        const response = await request
          .get('/api/v4/public/feature-flags')
          .set('installation', installationId);

        expect(response.status).toBe(200);
        expect(response.body).toEqual(mockFlags);
        expect(Service.API.evaluateFeatureFlags).toHaveBeenCalledWith(
          installationId,
          undefined
        );
      });

      it('should pass user header to feature flag evaluation if provided', async () => {
        const installationId = 'test-installation-with-user';
        const userId = 'test-user-id';
        
        const mockFlags = { 'user-specific-feature': true };

        (Service.API.evaluateFeatureFlags as Mock).mockResolvedValue(mockFlags);

        const response = await request
          .get('/api/v4/public/feature-flags')
          .set('installation', installationId)
          .set('user', userId);

        expect(response.status).toBe(200);
        expect(response.body).toEqual(mockFlags);
        expect(Service.API.evaluateFeatureFlags).toHaveBeenCalledWith(
          installationId,
          userId
        );
      });
    });
  });

  describe('Readiness Guard', () => {
    it('should block requests to protected routes when API is not ready', async () => {
      // Temporarily set isReady to false for this test
      Service.API.isReady = false;

      const response = await request
        .get('/api/v4/public/feature-flags')
        .set('installation', 'some-id');

      expect(response.status).toBe(503);
      expect(response.body.error.code).toBe('api.server.not_ready');
    });
  });
});
