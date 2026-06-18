/**
 * Deeply merges a source object into a target object.
 * Does not mutate the target object, returning a new merged object instead.
 * Array properties are overwritten rather than concatenated.
 */
export function deepMerge<T extends Record<string, any>>(target: T, source: any): T {
  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    return target;
  }
  
  const result = { ...target };
  for (const key of Object.keys(source)) {
    const sourceValue = source[key];
    const targetValue = result[key];
    
    if (sourceValue !== null && sourceValue !== undefined) {
      if (typeof sourceValue === 'object' && !Array.isArray(sourceValue)) {
        if (targetValue && typeof targetValue === 'object' && !Array.isArray(targetValue)) {
          result[key as keyof T] = deepMerge(targetValue, sourceValue);
        } else {
          result[key as keyof T] = { ...sourceValue };
        }
      } else {
        result[key as keyof T] = sourceValue;
      }
    }
  }
  return result;
}

