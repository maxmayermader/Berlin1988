import { PHANTOM } from '@berlin/engine';
import type { CardId, Loadout } from '@berlin/shared';
import { create } from 'zustand';

/**
 * The single persisted loadout (D-01) — one player, one CardId[10] draft,
 * seeded from the Phantom preset the first time a player opens the
 * deckbuilder, then freely edited and overwritten in place on every change.
 * Mirrors apps/web/lib/identity.ts's StorageLike + browserStorage() +
 * load-or-seed shape line for line; the store is a dumb container, never a
 * repair layer — it hands validateLoadout() whatever is stored, corrupted or
 * not, rather than truncating, sorting, or de-duplicating anything itself.
 */

export const LOADOUT_STORAGE_KEY = 'berlin1988.loadout';

/** Anything with getItem/setItem satisfies this — the browser's own
 *  localStorage, or a plain in-memory stub under Vitest's default `node`
 *  environment (no DOM package needed to test this module). Mirrors
 *  identity.ts's StorageLike exactly. */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem?(key: string): void;
}

function browserStorage(): StorageLike | null {
  return typeof window === 'undefined' ? null : window.localStorage;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string');
}

/**
 * Loads the persisted loadout, seeding and persisting a fresh Phantom copy
 * if none exists yet. A missing key, a non-JSON value, a non-array value, or
 * an array containing a non-string entry all fall through to the Phantom
 * seed. Anything shaped like a list of strings — a four-card partial deck, a
 * ten-unknown-id deck — is returned unchanged: validateLoadout() is the one
 * voice that describes what is wrong with a loadout's *contents*, this
 * function only guards against a value that isn't a loadout-shaped value at
 * all.
 */
export function loadLoadout(storage: StorageLike | null = browserStorage()): Loadout {
  if (storage) {
    const raw = storage.getItem(LOADOUT_STORAGE_KEY);
    if (raw) {
      try {
        const parsed: unknown = JSON.parse(raw);
        if (isStringArray(parsed)) return parsed as CardId[];
      } catch {
        // corrupt or non-JSON value — fall through and reseed
      }
    }
  }
  const fresh: Loadout = [...PHANTOM];
  saveLoadout(fresh, storage);
  return fresh;
}

/**
 * Persists a loadout. Returns `true` on success, `false` if `setItem`
 * itself threw (Safari private browsing, quota exceeded) — a swallowed
 * write failure is exactly the silent discard this plan prohibits, so the
 * caller (useLoadoutStore) records the failure as `saveStatus` rather than
 * this function eating it. A null storage (the server-render case) is a
 * silent no-op success: there is nothing to fail.
 */
export function saveLoadout(loadout: Loadout, storage: StorageLike | null = browserStorage()): boolean {
  if (!storage) return true;
  try {
    storage.setItem(LOADOUT_STORAGE_KEY, JSON.stringify(loadout));
    return true;
  } catch {
    return false;
  }
}

/** Mirrors matchStore's OrderStatus shape (apps/web/lib/matchStore.ts) —
 *  'storage-failed' is the one state OrderStatus has no analog for, added
 *  for the localStorage-write-failure case this store's own persistence
 *  layer can hit that the network-backed store never does. */
export interface LoadoutSaveStatus {
  readonly state: 'idle' | 'pending' | 'accepted' | 'rejected' | 'storage-failed';
  readonly message?: string;
}

interface LoadoutStore {
  readonly loadout: CardId[];
  /** False until hydrate() has run once on mount — never read localStorage
   *  at create() time (02-RESEARCH.md Pitfall 1): that runs during Next.js's
   *  server render pass, where `window` doesn't exist. */
  readonly hydrated: boolean;
  readonly saveStatus: LoadoutSaveStatus;
  hydrate: () => void;
  /** D-02: a full overwrite, never a merge — the entire array is replaced
   *  and persisted immediately. */
  loadPreset: (preset: Loadout) => void;
  setSaveStatus: (status: LoadoutSaveStatus) => void;
}

export const useLoadoutStore = create<LoadoutStore>((set) => ({
  loadout: [...PHANTOM],
  hydrated: false,
  saveStatus: { state: 'idle' },
  hydrate: () => {
    const loaded = loadLoadout();
    set({ loadout: [...loaded] as CardId[], hydrated: true });
  },
  loadPreset: (preset) => {
    const next = [...preset] as CardId[];
    const saved = saveLoadout(next);
    set({
      loadout: next,
      saveStatus: saved ? { state: 'idle' } : {
        state: 'storage-failed',
        message: "Couldn't save changes in this browser. Your edits won't persist after you leave this page.",
      },
    });
  },
  setSaveStatus: (status) => set({ saveStatus: status }),
}));
