import { describe, expect, it } from 'vitest';
import type { StorageLike } from './identity.js';
import { consumeKicked, markKicked } from './kicked.js';

/** In-memory stand-in for sessionStorage — mirrors identity.test.ts's
 *  MemoryStorage, runs under Vitest's default `node` environment. */
class MemoryStorage implements StorageLike {
  private readonly store = new Map<string, string>();
  getItem(key: string): string | null {
    return this.store.has(key) ? (this.store.get(key) ?? null) : null;
  }
  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }
  removeItem(key: string): void {
    this.store.delete(key);
  }
}

describe('markKicked / consumeKicked (one-shot flag)', () => {
  it('markKicked() then consumeKicked() returns true; a second consumeKicked() immediately after returns false', () => {
    const storage = new MemoryStorage();
    markKicked(storage);
    expect(consumeKicked(storage)).toBe(true);
    expect(consumeKicked(storage)).toBe(false);
  });

  it('consumeKicked() on a storage that has never been marked returns false', () => {
    const storage = new MemoryStorage();
    expect(consumeKicked(storage)).toBe(false);
  });

  it('consumeKicked() with a null storage returns false and does not throw', () => {
    expect(() => {
      expect(consumeKicked(null)).toBe(false);
    }).not.toThrow();
  });

  it('markKicked() with a null storage is a no-op and does not throw', () => {
    expect(() => markKicked(null)).not.toThrow();
  });

  it('a corrupt stored value is treated as not-kicked and cleared', () => {
    const storage = new MemoryStorage();
    storage.setItem('berlin1988.kicked', 'not-the-marker');
    expect(consumeKicked(storage)).toBe(false);
    // cleared — a second read finds nothing, proving it was removed, not left corrupt
    expect(consumeKicked(storage)).toBe(false);
    storage.setItem('berlin1988.kicked', 'not-the-marker');
    expect(storage.getItem('berlin1988.kicked')).toBe('not-the-marker');
    consumeKicked(storage);
    expect(storage.getItem('berlin1988.kicked')).toBeNull();
  });
});
