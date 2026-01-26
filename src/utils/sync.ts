import { GenericObject, SyncResult } from '../types/index.js';

/**
 * Checks if a value is a plain object.
 */
const isObject = (item: unknown) => {
  return item && typeof item === 'object' && !Array.isArray(item);
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
export const applyDeepSyncPatch = <T extends GenericObject>(
  target: T,
  patch: T
): SyncResult<T> => {
  let hasChanges = false;

  const merge = (currentValue: unknown, incomingValue: unknown): unknown => {
    // 1. Handle Arrays
    if (Array.isArray(incomingValue)) {
      // FAST EXIT: If target property doesn't exist, adopt the whole array and exit
      if (currentValue === undefined) {
        hasChanges = true;
        return incomingValue;
      }

      const resultItems = Array.isArray(currentValue) ? [...currentValue] : [];
      const incomingArray = incomingValue as unknown[];
      const lockKeys = ['type', 'id', 'talk_number'] as const;

      incomingArray.forEach((patchItem: unknown) => {
        if (isObject(patchItem)) {
          const itemObj = patchItem as GenericObject;
          const lockKey = lockKeys.find((k) => k in itemObj);

          if (lockKey) {
            const existingIndex = resultItems.findIndex(
              (l) =>
                isObject(l) &&
                (l as GenericObject)[lockKey] === itemObj[lockKey]
            );

            if (existingIndex === -1) {
              // Item not found: Add it
              resultItems.push(itemObj);
              hasChanges = true;
            } else {
              // Item found: Identity Match
              const existingItem = resultItems[existingIndex] as GenericObject;

              // GATEKEEPER: If both items have updatedAt, it's the final authority
              if ('updatedAt' in itemObj) {
                let isNew = false;

                if ('updatedAt' in existingItem) {
                  const incomingDate = itemObj.updatedAt as string;
                  const existingDate = existingItem.updatedAt as string;

                  isNew = isNewer(incomingDate, existingDate);
                } else {
                  isNew = true;
                }

                if (isNew) {
                  resultItems[existingIndex] = {
                    ...(existingItem ?? {}),
                    ...itemObj,
                  };
                  hasChanges = true;
                }
              } else {
                // No timestamps: Perform deep merge.
                // The merge() function will handle updating the 'hasChanges' flag internally.
                resultItems[existingIndex] = merge(
                  existingItem,
                  itemObj
                ) as GenericObject;
              }
            }
          } else {
            // No Lock Key found: This array item cannot be tracked by identity.
            // Usually, we skip or push, but in sync logic, we'd typically push as new.
            resultItems.push(itemObj);
            hasChanges = true;
          }
        }
      });

      return resultItems;
    }

    // 2. Handle Objects
    if (isObject(incomingValue)) {
      const incomingObj = incomingValue as GenericObject;

      // NEW CHECK: If the target doesn't have this property at all
      if (currentValue === undefined) {
        hasChanges = true;
        return incomingObj; // Add the new object and exit this branch
      }

      // If we have a target, ensure it's treated as an object
      const currentObj = (
        isObject(currentValue) ? currentValue : {}
      ) as GenericObject;

      // GATEKEEPER: If both have updatedAt, this is the final authority.
      if ('updatedAt' in incomingObj) {
        let isNew = false;

        if ('updatedAt' in currentObj) {
          const incomingDate = incomingObj.updatedAt as string;
          const existingDate = currentObj.updatedAt as string;

          isNew = isNewer(incomingDate, existingDate);
        } else {
          isNew = true;
        }

        if (isNew) {
          hasChanges = true;
          return { ...(currentObj ?? {}), ...incomingObj };
        }
        return currentObj;
      }

      // If we reach here, we are doing a deep merge because timestamps are missing on one or both sides.
      const mergedResult: GenericObject = { ...currentObj };
      for (const key in incomingObj) {
        mergedResult[key] = merge(currentObj[key], incomingObj[key]);
      }
      return mergedResult;
    }

    return currentValue;
  };

  const merged = merge(target, patch) as T;

  return { merged, hasChanges };
};
