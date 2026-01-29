import { describe, it, expect } from 'vitest';
import { GenericObject } from '../../src/types/index.js';
import { applyDeepSyncPatch } from '../../src/utils/index.js';

describe('applyDeepSyncPatch() - Strict Timestamp Sync', () => {
  describe('Object Level Synchronization', () => {
    it('should update properties when the patch has a newer updatedAt', () => {
      const target = { name: 'Original', updatedAt: '2026-01-01T10:00:00Z' };
      const patch = { name: 'Updated', updatedAt: '2026-01-25T18:00:00Z' };

      const { merged, hasChanges } = applyDeepSyncPatch(target, patch);

      expect(hasChanges).toBe(true);
      expect(merged.name).toBe(patch.name);
      expect(merged.updatedAt).toBe(patch.updatedAt);
    });

    it('should merge new properties when the taget does not have updatedAt', () => {
      const target: GenericObject = { name: 'Original', extra: 'extra prop' };
      const patch: GenericObject = {
        name: 'Updated',
        updatedAt: '2026-01-25T18:00:00Z',
      };

      const { merged, hasChanges } = applyDeepSyncPatch(target, patch);

      expect(hasChanges).toBe(true);
      expect(merged.extra).toBe(target.extra);
      expect(merged.name).toBe(patch.name);
      expect((merged as GenericObject).updatedAt).toBe(patch.updatedAt);
    });

    it('should reject updates when the patch has an older updatedAt', () => {
      const target = { status: 'active', updatedAt: '2026-01-25T12:00:00Z' };
      const patch = { status: 'inactive', updatedAt: '2026-01-20T12:00:00Z' };

      const { merged, hasChanges } = applyDeepSyncPatch(target, patch);

      expect(hasChanges).toBe(false);
      expect(merged.status).toBe(target.status);
    });

    it('should add a new property only if the updatedAt is newer than the target container', () => {
      const target = {
        uid: 'user-1',
        updatedAt: '2026-01-01T00:00:00Z',
      } as GenericObject;
      const patch = { role: 'admin', updatedAt: '2026-01-02T00:00:00Z' };

      const { merged, hasChanges } = applyDeepSyncPatch(target, patch);

      expect(hasChanges).toBe(true);
      expect((merged as GenericObject).role).toBe('admin');
    });
  });

  describe('Existence Checks (Fast-Exit Logic)', () => {
    it('should immediately add new nested objects if missing in target', () => {
      const target = { auth_uid: 'abc-123' } as GenericObject;

      const patch = {
        profile: {
          firstname: 'User',
          updatedAt: '2026-01-25T22:21:22Z',
        },
      };

      const { merged, hasChanges } = applyDeepSyncPatch(target, patch);

      expect(hasChanges).toBe(true);
      expect(merged.profile).toEqual(patch.profile);
      expect(merged.auth_uid).toBe('abc-123');
    });

    it('should immediately add new arrays if missing in target', () => {
      const target = { id: 'test' } as GenericObject;

      const patch = {
        tags: [{ id: 1, name: 'first' }],
      };

      const { merged, hasChanges } = applyDeepSyncPatch(target, patch);

      expect(hasChanges).toBe(true);
      expect(merged.tags).toHaveLength(1);
      expect((merged.tags as GenericObject[])[0].name).toBe('first');
    });
  });

  describe('Array Synchronization with Identity (Lock Keys)', () => {
    it('should update an existing array item if its specific updatedAt is newer', () => {
      const target = {
        items: [{ id: 'i1', val: 'old', updatedAt: '2026-01-01T00:00:00Z' }],
      };
      const patch = {
        items: [{ id: 'i1', val: 'new', updatedAt: '2026-01-25T00:00:00Z' }],
      };

      const { merged, hasChanges } = applyDeepSyncPatch(target, patch);
      const items = merged.items as GenericObject[];

      expect(hasChanges).toBe(true);
      expect(items[0].val).toBe('new');
    });

    it('should sync talks using talk_number as lock key', () => {
      const target = {
        talks: [
          { talk_number: 5, title: 'Old', updatedAt: '2026-01-01T00:00:00Z' },
        ],
      };
      const patch = {
        talks: [
          { talk_number: 5, title: 'New', updatedAt: '2026-01-25T00:00:00Z' },
        ],
      };

      const { merged, hasChanges } = applyDeepSyncPatch(target, patch);
      const talks = merged.talks as GenericObject[];

      expect(hasChanges).toBe(true);
      expect(talks[0].title).toBe('New');
    });

    it('should append new items to an existing array', () => {
      const target = { items: [{ id: 'i1', val: 'A' }] };
      const patch = { items: [{ id: 'i2', val: 'B' }] };

      const { merged, hasChanges } = applyDeepSyncPatch(target, patch);

      expect(hasChanges).toBe(true);
      expect(merged.items).toHaveLength(2);
    });
  });

  describe('Recursive Last-Write-Wins Logic', () => {
    it('should skip update for nested items if patch timestamp is stale', () => {
      const target = {
        talks: [
          {
            talk_number: 101,
            details: { title: 'Keep', updatedAt: '2026-01-25T10:00:00Z' },
          },
        ],
      };

      const patch = {
        talks: [
          {
            talk_number: 101,
            details: { title: 'Overwrite', updatedAt: '2026-01-20T10:00:00Z' },
          },
        ],
      };

      const { merged, hasChanges } = applyDeepSyncPatch(target, patch);
      const details = merged.talks[0].details;

      expect(hasChanges).toBe(false);
      expect(details.title).toBe('Keep');
    });

    it('should perform partial updates across the tree', () => {
      const target = {
        info: { status: 'old', updatedAt: '2026-01-01T00:00:00Z' },
        meta: { version: 1, updatedAt: '2026-01-25T00:00:00Z' },
      };
      const patch = {
        info: { status: 'new', updatedAt: '2026-01-20T00:00:00Z' },
        meta: { version: 2, updatedAt: '2026-01-20T00:00:00Z' },
      };

      const { merged, hasChanges } = applyDeepSyncPatch(target, patch);

      expect(hasChanges).toBe(true);
      expect((merged.info as GenericObject).status).toBe('new');
      expect((merged.meta as GenericObject).version).toBe(1); // Stale patch ignored
    });

    it('should NOT mark changes if timestamps are identical', () => {
      const target = { val: 'A', updatedAt: '2026-01-25T12:00:00Z' };
      const patch = { val: 'B', updatedAt: '2026-01-25T12:00:00Z' };

      const { hasChanges } = applyDeepSyncPatch(target, patch);
      expect(hasChanges).toBe(false);
    });
  });
});
