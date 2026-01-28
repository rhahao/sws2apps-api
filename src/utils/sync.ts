import { SyncResult, DeepPartial } from '../types/index.js';

/**
 * Checks if a value is a plain object.
 */
const isObject = (item: unknown): item is Record<string, unknown> => {
  return item !== null && typeof item === 'object' && !Array.isArray(item);
};

/**
 * Validates if the client's record is newer than the server's.
 */
const isNewer = (clientDate?: string, serverDate?: string): boolean => {
  if (!clientDate) return false;
  if (!serverDate) return true;
  return new Date(clientDate).getTime() > new Date(serverDate).getTime();
};

/**
 * Recursively applies a patch to a target object using 'updatedAt' for conflict resolution.
 */
export const applyDeepSyncPatch = <T extends object>(
  target: T,
  patch: DeepPartial<T>
): SyncResult<T> => {
  let hasChanges = false;

  const merge = (currentValue: unknown, incomingValue: unknown): unknown => {
    // 1. Handle Arrays
    if (Array.isArray(incomingValue)) {
      if (currentValue === undefined) {
        hasChanges = true;
        return incomingValue;
      }

      const resultItems = Array.isArray(currentValue) ? [...currentValue] : [];
      const incomingArray = incomingValue;
      const lockKeys = ['type', 'id', 'talk_number'] as const;

      incomingArray.forEach((patchItem: unknown) => {
        if (isObject(patchItem)) {
          const lockKey = lockKeys.find((k) => k in patchItem);

          if (lockKey) {
            const existingIndex = resultItems.findIndex(
              (l) => isObject(l) && l[lockKey] === patchItem[lockKey]
            );

            if (existingIndex === -1) {
              resultItems.push(patchItem);
              hasChanges = true;
            } else {
              const existingItem = resultItems[existingIndex];
              if (isObject(existingItem)) {
                if (
                  'updatedAt' in patchItem &&
                  typeof patchItem.updatedAt === 'string'
                ) {
                  let isNew = false;
                  if (
                    'updatedAt' in existingItem &&
                    typeof existingItem.updatedAt === 'string'
                  ) {
                    isNew = isNewer(
                      patchItem.updatedAt,
                      existingItem.updatedAt
                    );
                  } else {
                    isNew = true;
                  }

                  if (isNew) {
                    resultItems[existingIndex] = {
                      ...existingItem,
                      ...patchItem,
                    };
                    hasChanges = true;
                  }
                } else {
                  resultItems[existingIndex] = merge(existingItem, patchItem);
                }
              }
            }
          } else {
            resultItems.push(patchItem);
            hasChanges = true;
          }
        }
      });

      return resultItems;
    }

    // 2. Handle Objects
    if (isObject(incomingValue)) {
      if (currentValue === undefined) {
        hasChanges = true;
        return incomingValue;
      }

      if (isObject(currentValue)) {
        if (
          'updatedAt' in incomingValue &&
          typeof incomingValue.updatedAt === 'string'
        ) {
          let isNew = false;
          if (
            'updatedAt' in currentValue &&
            typeof currentValue.updatedAt === 'string'
          ) {
            isNew = isNewer(incomingValue.updatedAt, currentValue.updatedAt);
          } else {
            isNew = true;
          }

          if (isNew) {
            hasChanges = true;
            return { ...currentValue, ...incomingValue };
          }
          return currentValue;
        }

        const mergedResult: Record<string, unknown> = { ...currentValue };

        for (const key in incomingValue) {
          if (Object.prototype.hasOwnProperty.call(incomingValue, key)) {
            const currentPropValue = currentValue[key];
            const incomingPropValue = incomingValue[key];
            mergedResult[key] = merge(currentPropValue, incomingPropValue);
          }
        }
        
        return mergedResult;
      }
    }

    return currentValue;
  };

  const merged = merge(target, patch) as T;

  return { merged, hasChanges };
};
