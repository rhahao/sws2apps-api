import fs from 'node:fs';
import i18next from 'i18next';
import { describe, it, expect, vi, beforeEach, Mock } from 'vitest';
import { initI18n } from '../../src/services/index.js';

vi.mock('node:fs');

vi.mock('i18next', () => ({
  default: {
    init: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('../../src/utils/logger.js');

describe('i18n Utility', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should map standard locales to three-letter codes correctly', async () => {
    // 1. Mock fs to simulate one valid translation file
    (fs.existsSync as Mock).mockReturnValue(true);

    (fs.readFileSync as Mock).mockReturnValue(
      JSON.stringify({ tr_welcome: 'Hello' })
    );

    await initI18n();

    // 2. Check if i18next.init was called with correctly mapped resources
    const spy = vi.spyOn(i18next, 'init');
    expect(spy).toHaveBeenCalled();

    const { calls } = spy.mock    
    const initArgs = calls[0][0];

    // The key in resources should be 'eng'
    expect(initArgs.resources).toHaveProperty('eng');
    expect(initArgs.resources!.eng.main).toEqual({ tr_welcome: 'Hello' });
  });

  it('should catch and log errors if JSON is malformed', async () => {
    (fs.existsSync as Mock).mockReturnValue(true);
    (fs.readFileSync as Mock).mockReturnValue('invalid-json'); // This will cause JSON.parse to throw

    await expect(initI18n()).rejects.toThrow();
  });
});
