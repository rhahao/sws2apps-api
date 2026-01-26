import { describe, it, expect } from 'vitest';
import { compareVersions, isVersionSupported } from '../../src/utils/version.js';

describe('compareVersions', () => {
  it('should return 0 for equal versions', () => {
    expect(compareVersions('1.0.0', '1.0.0')).toBe(0);
    expect(compareVersions('1.2.3', '1.2.3')).toBe(0);
    expect(compareVersions('1.0', '1.0')).toBe(0);
  });

  it('should return 1 if v1 > v2', () => {
    expect(compareVersions('2.0.0', '1.0.0')).toBe(1);
    expect(compareVersions('1.1.0', '1.0.0')).toBe(1);
    expect(compareVersions('1.0.1', '1.0.0')).toBe(1);
    expect(compareVersions('1.2.0', '1.1.9')).toBe(1);
    expect(compareVersions('1.0.0.1', '1.0.0')).toBe(1); // v1 has more parts
  });

  it('should return -1 if v1 < v2', () => {
    expect(compareVersions('1.0.0', '2.0.0')).toBe(-1);
    expect(compareVersions('1.0.0', '1.1.0')).toBe(-1);
    expect(compareVersions('1.0.0', '1.0.1')).toBe(-1);
    expect(compareVersions('1.1.9', '1.2.0')).toBe(-1);
    expect(compareVersions('1.0.0', '1.0.0.1')).toBe(-1); // v2 has more parts
  });

  it('should handle versions with different number of parts correctly', () => {
    expect(compareVersions('1.0', '1.0.0')).toBe(0);
    expect(compareVersions('1.0.0', '1.0')).toBe(0);
    expect(compareVersions('1.1', '1.0.0')).toBe(1);
    expect(compareVersions('1.0.0', '1.1')).toBe(-1);
    expect(compareVersions('1.0.1', '1.0')).toBe(1);
    expect(compareVersions('1.0', '1.0.1')).toBe(-1);
  });

  it('should handle zero versions', () => {
    expect(compareVersions('0.0.0', '0.0.0')).toBe(0);
    expect(compareVersions('1.0.0', '0.0.0')).toBe(1);
    expect(compareVersions('0.0.0', '1.0.0')).toBe(-1);
  });

  it('should handle complex version strings', () => {
    expect(compareVersions('1.2.3.4', '1.2.3.4')).toBe(0);
    expect(compareVersions('1.2.3.5', '1.2.3.4')).toBe(1);
    expect(compareVersions('1.2.3.4', '1.2.3.5')).toBe(-1);
  });
});

describe('isVersionSupported', () => {
  it('should return true if current >= minimum', () => {
    expect(isVersionSupported('1.0.0', '1.0.0')).toBe(true);
    expect(isVersionSupported('1.0.1', '1.0.0')).toBe(true);
    expect(isVersionSupported('2.0.0', '1.0.0')).toBe(true);
    expect(isVersionSupported('1.1', '1.0')).toBe(true);
    expect(isVersionSupported('1.0.0.1', '1.0.0')).toBe(true);
  });

  it('should return false if current < minimum', () => {
    expect(isVersionSupported('1.0.0', '1.0.1')).toBe(false);
    expect(isVersionSupported('1.0.0', '1.1.0')).toBe(false);
    expect(isVersionSupported('1.0.0', '2.0.0')).toBe(false);
    expect(isVersionSupported('1.0', '1.1')).toBe(false);
    expect(isVersionSupported('1.0.0', '1.0.0.1')).toBe(false);
  });
});
