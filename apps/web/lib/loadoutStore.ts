import { budgetPointsOf, DEFAULT_RULESET, PHANTOM, tryGetCard, validateLoadout } from '@berlin/engine';
import { ICONS, SECTORS, type CardId, type IconType, type Loadout, type LoadoutViolation, type Sector } from '@berlin/shared';
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

const STORAGE_FAILED_STATUS: LoadoutSaveStatus = {
  state: 'storage-failed',
  message: "Couldn't save changes in this browser. Your edits won't persist after you leave this page.",
};

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
  /** D-03: never refuses. Appends to the end of the draft and persists
   *  immediately, even past ten cards — WRONG_SIZE is what reports that,
   *  not a blocked action. */
  add: (cardId: CardId) => void;
  /** D-03: never refuses. Drops the first entry matching `cardId` and
   *  persists immediately; a no-op (no write) if the id isn't present. */
  remove: (cardId: CardId) => void;
  setSaveStatus: (status: LoadoutSaveStatus) => void;
}

export const useLoadoutStore = create<LoadoutStore>((set, get) => ({
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
    set({ loadout: next, saveStatus: saved ? { state: 'idle' } : STORAGE_FAILED_STATUS });
  },
  add: (cardId) => {
    const next = [...get().loadout, cardId];
    const saved = saveLoadout(next);
    set({ loadout: next, saveStatus: saved ? { state: 'idle' } : STORAGE_FAILED_STATUS });
  },
  remove: (cardId) => {
    const current = get().loadout;
    const index = current.indexOf(cardId);
    if (index === -1) return; // nothing to remove — no write, no state change
    const next = [...current];
    next.splice(index, 1);
    const saved = saveLoadout(next);
    set({ loadout: next, saveStatus: saved ? { state: 'idle' } : STORAGE_FAILED_STATUS });
  },
  setSaveStatus: (status) => set({ saveStatus: status }),
}));

/**
 * Everything the legality meter renders, derived from validateLoadout() and
 * budgetPointsOf() — the engine's own answer, verbatim (02-RESEARCH.md
 * Pitfall 2: a client-side calculator that agrees "almost always" is a save
 * button enabled while the room rejects the payload). This function computes
 * no rule of its own: `isLegal` is `violations.length === 0` and nothing
 * more; `iconCounts`/`colorsPresent` are a display tally over the same cards
 * validateLoadout() already resolved, never a second pass/fail judgment.
 *
 * `violatingCardIds` is attribution, not a second rules engine — it can only
 * ever name a tile once the engine has already reported ICON_LIMIT or
 * UNKNOWN_CARD for this exact draft; OVER_BUDGET and TOO_FEW_COLORS
 * contribute no tiles, because neither violation has a single culprit card.
 */
export interface LoadoutLegality {
  readonly violations: readonly LoadoutViolation[];
  readonly budgetPoints: number;
  readonly cardCount: number;
  /** One entry per ICONS member, present even at zero. Includes passives —
   *  they count against the per-icon maximum too. */
  readonly iconCounts: Readonly<Record<IconType, number>>;
  /** One entry per SECTORS member, present (as false) even when absent. */
  readonly colorsPresent: Readonly<Record<Sector, boolean>>;
  /** The exact tiles responsible for an ICON_LIMIT or UNKNOWN_CARD
   *  violation the engine already reported. Empty whenever neither code is
   *  present, regardless of what else is wrong with the draft. */
  readonly violatingCardIds: readonly CardId[];
  readonly isLegal: boolean;
}

function violatingCardIdsFor(loadout: readonly CardId[], violations: readonly LoadoutViolation[]): CardId[] {
  const out: CardId[] = [];

  if (violations.some((v) => v.code === 'ICON_LIMIT')) {
    const seenPerIcon = new Map<IconType, number>();
    for (const id of loadout) {
      const card = tryGetCard(id);
      if (!card) continue;
      const seen = (seenPerIcon.get(card.icon) ?? 0) + 1;
      seenPerIcon.set(card.icon, seen);
      if (seen > DEFAULT_RULESET.maxPerIcon) out.push(id);
    }
  }

  if (violations.some((v) => v.code === 'UNKNOWN_CARD')) {
    for (const id of loadout) {
      if (!tryGetCard(id)) out.push(id);
    }
  }

  return out;
}

export function loadoutLegality(loadout: readonly CardId[]): LoadoutLegality {
  const violations = validateLoadout(loadout, DEFAULT_RULESET);

  const iconCounts = Object.fromEntries(ICONS.map((icon) => [icon, 0])) as Record<IconType, number>;
  const colorsPresent = Object.fromEntries(SECTORS.map((sector) => [sector, false])) as Record<Sector, boolean>;
  for (const id of loadout) {
    const card = tryGetCard(id);
    if (!card) continue;
    iconCounts[card.icon] += 1;
    colorsPresent[card.sector] = true;
  }

  return Object.freeze({
    violations,
    budgetPoints: budgetPointsOf(loadout),
    cardCount: loadout.length,
    iconCounts: Object.freeze(iconCounts),
    colorsPresent: Object.freeze(colorsPresent),
    violatingCardIds: Object.freeze(violatingCardIdsFor(loadout, violations)),
    isLegal: violations.length === 0,
  });
}
