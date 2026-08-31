/**
 * Browser storage is an enhancement, not a requirement for practising.
 * Some privacy modes, embedded browsers, and full storage quotas throw when
 * localStorage is accessed. Keeping those failures contained lets the
 * workspace remain usable and fall back to in-memory state.
 */
export const readBrowserStorage = (key: string): string | null => {
  if (typeof window === "undefined") return null;

  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
};

export const writeBrowserStorage = (key: string, value: string): boolean => {
  if (typeof window === "undefined") return false;

  try {
    window.localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
};

export const removeBrowserStorage = (key: string): boolean => {
  if (typeof window === "undefined") return false;

  try {
    window.localStorage.removeItem(key);
    return true;
  } catch {
    return false;
  }
};
