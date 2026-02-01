/**
 * Simple SemVer-like version comparison.
 * Returns:
 *  1 if a > b
 * -1 if a < b
 *  0 if a == b
 */
export const compare = (v1: string, v2: string): number => {
  const parts1 = v1.split('.').map(Number);
  const parts2 = v2.split('.').map(Number);

  const length = Math.max(parts1.length, parts2.length);

  for (let i = 0; i < length; i++) {
    const num1 = parts1[i] || 0;
    const num2 = parts2[i] || 0;

    if (num1 > num2) return 1;
    if (num1 < num2) return -1;
  }

  return 0;
};

/**
 * Checks if the current version is greater than or equal to the minimum.
 */
export const isSupported = (current: string, minimum: string): boolean => {
  return compare(current, minimum) >= 0;
};
