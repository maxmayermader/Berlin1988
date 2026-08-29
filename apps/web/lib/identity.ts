import { nextInt, seedRng } from '@berlin/engine';
import type { RngState } from '@berlin/shared';

/**
 * Player identity — an auto-generated Cold War codename plus a locally
 * stable id — persisted to localStorage under D-09 (no login, no name-entry
 * step). This is the only place in the app that constructs a codename: the
 * pool below is a hand-authored, reviewed, fixed word list, never a
 * random-character or generative construction that could produce unreviewed
 * output (see this plan's threat register, T-... prohibition on offensive
 * auto-assigned identities).
 */

export const CODENAME_MAX_LENGTH = 20;

const STORAGE_KEY = 'berlin1988.identity';

// Hand-authored, reviewed, Cold War-register adjectives. Fixed pool, fully
// readable at review time — the longest entry is 7 characters.
const ADJECTIVES = [
  'Iron',
  'Silent',
  'Grey',
  'Cold',
  'Hidden',
  'Quiet',
  'Steel',
  'Dark',
  'Amber',
  'Frozen',
  'Velvet',
  'Shadow',
  'Copper',
  'Granite',
  'Winter',
  'Ashen',
] as const;

// Hand-authored, reviewed noun pool — birds and mammals, no political
// figures, no slurs, no sexual content. The longest entry is 7 characters,
// so every adjective+noun pair is at most 15 characters, well under
// CODENAME_MAX_LENGTH.
const NOUNS = [
  'Sparrow',
  'Falcon',
  'Raven',
  'Fox',
  'Wolf',
  'Owl',
  'Hawk',
  'Lynx',
  'Otter',
  'Heron',
  'Marten',
  'Badger',
  'Kestrel',
  'Merlin',
  'Osprey',
  'Viper',
] as const;

export interface Identity {
  readonly playerId: string;
  readonly codename: string;
}

/** Anything with getItem/setItem/removeItem satisfies this — the browser's
 *  own localStorage, or a plain in-memory stub under Vitest's default
 *  `node` environment (no DOM package needed to test this module). */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem?(key: string): void;
}

function browserStorage(): StorageLike | null {
  return typeof window === 'undefined' ? null : window.localStorage;
}

/** A codename drawn from the fixed adjective+noun pools — never longer than
 *  CODENAME_MAX_LENGTH, never containing a character outside [A-Za-z ]. */
export function generateCodename(rng: RngState): string {
  const adjective = ADJECTIVES[nextInt(rng, ADJECTIVES.length)] ?? ADJECTIVES[0];
  const noun = NOUNS[nextInt(rng, NOUNS.length)] ?? NOUNS[0];
  return `${adjective} ${noun}`;
}

/** Not the engine's seeded PRNG — a locally stable id needs no replay
 *  guarantee, only browser-side uniqueness. Uses crypto, never the
 *  platform's non-seeded random source. */
function randomLocalId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${nextInt(seedRng(String(Date.now())), 1_000_000_000)}`;
}

function freshIdentity(): Identity {
  const rng = seedRng(randomLocalId());
  return { playerId: randomLocalId(), codename: generateCodename(rng) };
}

function isValidIdentity(value: unknown): value is Identity {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Partial<Identity>;
  return (
    typeof candidate.playerId === 'string' &&
    candidate.playerId.length > 0 &&
    typeof candidate.codename === 'string' &&
    candidate.codename.length > 0 &&
    candidate.codename.length <= CODENAME_MAX_LENGTH
  );
}

/**
 * Loads the persisted identity, generating and persisting a fresh one if
 * none exists yet. A corrupt, non-JSON, or over-length stored value is
 * discarded and regenerated rather than thrown.
 */
export function loadIdentity(storage: StorageLike | null = browserStorage()): Identity {
  if (storage) {
    const raw = storage.getItem(STORAGE_KEY);
    if (raw) {
      try {
        const parsed: unknown = JSON.parse(raw);
        if (isValidIdentity(parsed)) return parsed;
      } catch {
        // corrupt or non-JSON value — fall through and regenerate
      }
    }
  }
  const fresh = freshIdentity();
  saveIdentity(fresh, storage);
  return fresh;
}

export function saveIdentity(identity: Identity, storage: StorageLike | null = browserStorage()): void {
  if (!storage) return;
  storage.setItem(STORAGE_KEY, JSON.stringify(identity));
}
