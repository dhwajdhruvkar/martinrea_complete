/**
 * Tiny typed wrapper around window.localStorage with JSON serialisation.
 * Safe to call in non-browser contexts (returns null / no-op).
 */

function safeGet(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function readJSON<T>(key: string, fallback: T): T {
  const ls = safeGet();
  if (!ls) return fallback;
  const raw = ls.getItem(key);
  if (raw == null) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function writeJSON<T>(key: string, value: T): void {
  const ls = safeGet();
  if (!ls) return;
  try {
    ls.setItem(key, JSON.stringify(value));
  } catch {
    /* quota exceeded — ignore */
  }
}

export function remove(key: string): void {
  const ls = safeGet();
  if (!ls) return;
  ls.removeItem(key);
}

export const STORAGE_KEYS = {
  authToken: 'martinrea.auth.token',
  authUser: 'martinrea.auth.user',
  invoiceRegistry: 'martinrea.invoices.knownIds',
  recentSearches: 'martinrea.search.recent',
} as const;
