import type { StorageLike } from './identity.js';

/**
 * A one-shot "you were just kicked" flag persisted across the redirect from
 * the lobby route to the home page. Modelled on socket.ts's
 * storeRoomToken/readRoomToken sessionStorage pair (survives a same-tab
 * navigation, clears on tab close — exactly the lifetime this flag needs)
 * and on identity.ts's injectable-storage pattern, so this module is
 * testable under Vitest's node environment with no DOM package.
 */

export const KICKED_BANNER_COPY = 'You were removed from the lobby by the host.';

const STORAGE_KEY = 'berlin1988.kicked';
const MARKER = '1';

function browserStorage(): StorageLike | null {
  return typeof window === 'undefined' ? null : window.sessionStorage;
}

/** Sets the one-shot flag. No-op on a null storage (server-side render, no window). */
export function markKicked(storage: StorageLike | null = browserStorage()): void {
  if (!storage) return;
  storage.setItem(STORAGE_KEY, MARKER);
}

/**
 * Reads the flag and clears it in the same call — that's what makes the
 * banner appear exactly once after a removal and never on an ordinary home
 * page visit. A corrupt stored value (anything other than the fixed marker)
 * is treated as not-kicked and cleared, mirroring loadIdentity's
 * discard-and-regenerate discipline. Returns false without throwing on a
 * null storage.
 */
export function consumeKicked(storage: StorageLike | null = browserStorage()): boolean {
  if (!storage) return false;
  const raw = storage.getItem(STORAGE_KEY);
  if (raw === null) return false;
  storage.removeItem?.(STORAGE_KEY);
  return raw === MARKER;
}
