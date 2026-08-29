import { DEFAULT_RULESET, HUNTER, OLIGARCH, PHANTOM, SPIDER, STARTER_LOADOUTS, validateLoadout } from '@berlin/engine';
import type { CardId } from '@berlin/shared';
import { describe, expect, it } from 'vitest';
import { loadLoadout, LOADOUT_STORAGE_KEY, saveLoadout, type StorageLike } from './loadoutStore.js';

/** In-memory stand-in for localStorage — copies apps/web/lib/identity.test.ts's
 *  fixture rather than reaching for a DOM environment. Tracks a write count
 *  so the pure-read behavior can be asserted on the fixture itself, not a
 *  spy. */
class MemoryStorage implements StorageLike {
  private readonly store = new Map<string, string>();
  writeCount = 0;
  getItem(key: string): string | null {
    return this.store.has(key) ? (this.store.get(key) ?? null) : null;
  }
  setItem(key: string, value: string): void {
    this.writeCount += 1;
    this.store.set(key, value);
  }
  removeItem(key: string): void {
    this.store.delete(key);
  }
}

/** A storage whose setItem always throws — the persistence-failure row
 *  (Safari private browsing, quota exceeded). */
class ThrowingStorage implements StorageLike {
  getItem(): string | null {
    return null;
  }
  setItem(): void {
    throw new Error('QuotaExceededError');
  }
}

const PRESETS = { PHANTOM, HUNTER, OLIGARCH, SPIDER } as const;

describe('loadLoadout', () => {
  it('against empty storage returns a ten-card array deep-equal to PHANTOM, and persists it', () => {
    const storage = new MemoryStorage();
    const result = loadLoadout(storage);
    expect(result).toEqual([...PHANTOM]);
    expect(storage.getItem(LOADOUT_STORAGE_KEY)).not.toBeNull();
    expect(JSON.parse(storage.getItem(LOADOUT_STORAGE_KEY)!)).toEqual([...PHANTOM]);
  });

  it('called twice in a row against unchanged storage returns deep-equal arrays and performs no write on the second call', () => {
    const storage = new MemoryStorage();
    const first = loadLoadout(storage); // seeds storage — one write
    const writesAfterFirst = storage.writeCount;
    const second = loadLoadout(storage);
    expect(second).toEqual(first);
    expect(storage.writeCount).toBe(writesAfterFirst);
  });

  it('against a stored non-JSON string returns the Phantom seed instead of throwing', () => {
    const storage = new MemoryStorage();
    storage.setItem(LOADOUT_STORAGE_KEY, 'not-json{{{');
    let result: CardId[] | undefined;
    expect(() => {
      result = loadLoadout(storage) as CardId[];
    }).not.toThrow();
    expect(result).toEqual([...PHANTOM]);
  });

  it.each([
    ['an object', JSON.stringify({ not: 'an array' })],
    ['a number', JSON.stringify(42)],
    ['null', JSON.stringify(null)],
  ])('against stored valid JSON that is %s returns the Phantom seed', (_label, raw) => {
    const storage = new MemoryStorage();
    storage.setItem(LOADOUT_STORAGE_KEY, raw);
    expect(loadLoadout(storage)).toEqual([...PHANTOM]);
  });

  it('against a stored array containing a non-string entry returns the Phantom seed', () => {
    const storage = new MemoryStorage();
    storage.setItem(LOADOUT_STORAGE_KEY, JSON.stringify(['card-a', 42, 'card-b']));
    expect(loadLoadout(storage)).toEqual([...PHANTOM]);
  });

  it('against a stored array of ten unknown-but-string card ids returns those ids unchanged', () => {
    const storage = new MemoryStorage();
    const unknown = Array.from({ length: 10 }, (_, i) => `not_a_real_card_${i}`);
    storage.setItem(LOADOUT_STORAGE_KEY, JSON.stringify(unknown));
    expect(loadLoadout(storage)).toEqual(unknown);
  });

  it('against a stored array of four card ids returns those four unchanged', () => {
    const storage = new MemoryStorage();
    const partial = [...PHANTOM].slice(0, 4);
    storage.setItem(LOADOUT_STORAGE_KEY, JSON.stringify(partial));
    expect(loadLoadout(storage)).toEqual(partial);
  });

  it('against a null storage (the server-render case) does not throw and returns the Phantom seed', () => {
    expect(() => loadLoadout(null)).not.toThrow();
    expect(loadLoadout(null)).toEqual([...PHANTOM]);
  });
});

describe('saveLoadout / loadLoadout round trip', () => {
  it('round-trips the same array through storage', () => {
    const storage = new MemoryStorage();
    saveLoadout([...HUNTER] as CardId[], storage);
    expect(loadLoadout(storage)).toEqual([...HUNTER]);
  });

  it('against a storage whose setItem throws does not itself throw, and reports the failure to its caller', () => {
    const storage = new ThrowingStorage();
    let result: boolean | undefined;
    expect(() => {
      result = saveLoadout([...PHANTOM] as CardId[], storage);
    }).not.toThrow();
    expect(result).toBe(false);
  });

  it('against a null storage is a no-op and does not throw, reporting success', () => {
    let result: boolean | undefined;
    expect(() => {
      result = saveLoadout([...PHANTOM] as CardId[], null);
    }).not.toThrow();
    expect(result).toBe(true);
  });
});

describe('the four starter presets (loaded via saveLoadout as loadPreset would)', () => {
  for (const [name, preset] of Object.entries(PRESETS)) {
    it(`${name}: replaces the entire stored array, deep-equal to the engine export, with no leftover from a previous deck`, () => {
      const storage = new MemoryStorage();
      saveLoadout([...OLIGARCH] as CardId[], storage); // a different deck already stored
      saveLoadout([...preset] as CardId[], storage); // D-02: full overwrite
      const result = loadLoadout(storage);
      expect(result).toEqual([...preset]);
      const leftoverFromPrevious = ([...OLIGARCH] as string[]).filter((id) => !preset.includes(id as never));
      for (const id of leftoverFromPrevious) {
        expect(result).not.toContain(id);
      }
    });

    it(`${name}: re-saving the already-loaded preset leaves the stored value deep-equal and does not grow or duplicate the array`, () => {
      const storage = new MemoryStorage();
      saveLoadout([...preset] as CardId[], storage);
      saveLoadout([...preset] as CardId[], storage);
      const result = loadLoadout(storage);
      expect(result).toEqual([...preset]);
      expect(result).toHaveLength(preset.length);
    });

    it(`${name}: yields zero violations from validateLoadout against DEFAULT_RULESET`, () => {
      expect(validateLoadout(preset, DEFAULT_RULESET)).toEqual([]);
    });
  }

  it('STARTER_LOADOUTS exposes exactly these four presets by name', () => {
    expect(new Set(Object.keys(STARTER_LOADOUTS))).toEqual(new Set(Object.keys(PRESETS)));
  });
});
