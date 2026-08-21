import { seedRng } from '@berlin/engine';
import { clientMessageSchema } from '@berlin/shared';
import { describe, expect, it } from 'vitest';
import {
  CODENAME_MAX_LENGTH,
  generateCodename,
  loadIdentity,
  saveIdentity,
  type StorageLike,
} from './identity.js';

/** In-memory stand-in for localStorage — satisfies getItem/setItem/removeItem,
 * runs under Vitest's default `node` environment with no DOM package added. */
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

describe('generateCodename', () => {
  it('never exceeds CODENAME_MAX_LENGTH', () => {
    for (let i = 0; i < 100; i++) {
      const name = generateCodename(seedRng(`codename-${i}`));
      expect(name.length).toBeLessThanOrEqual(CODENAME_MAX_LENGTH);
    }
  });

  it('never contains a character outside [A-Za-z ]', () => {
    for (let i = 0; i < 100; i++) {
      const name = generateCodename(seedRng(`codename-charset-${i}`));
      expect(name).toMatch(/^[A-Za-z ]+$/);
    }
  });
});

describe('saveIdentity / loadIdentity', () => {
  it('round-trips the same identity through storage', () => {
    const storage = new MemoryStorage();
    const identity = { playerId: 'p-1', codename: 'Iron Falcon' };
    saveIdentity(identity, storage);
    expect(loadIdentity(storage)).toEqual(identity);
  });

  it('generates and persists a fresh identity on first call, then returns it again', () => {
    const storage = new MemoryStorage();
    const first = loadIdentity(storage);
    const second = loadIdentity(storage);
    expect(second).toEqual(first);
    expect(first.codename.length).toBeGreaterThan(0);
    expect(typeof first.playerId).toBe('string');
    expect(first.playerId.length).toBeGreaterThan(0);
  });

  it('discards a corrupt (non-JSON) stored value and generates a fresh identity, without throwing', () => {
    const storage = new MemoryStorage();
    storage.setItem('berlin1988.identity', 'not-json{{{');
    let identity: { playerId: string; codename: string } | undefined;
    expect(() => {
      identity = loadIdentity(storage);
    }).not.toThrow();
    expect(identity?.codename.length).toBeGreaterThan(0);
  });

  it('discards a stored codename longer than CODENAME_MAX_LENGTH', () => {
    const storage = new MemoryStorage();
    storage.setItem(
      'berlin1988.identity',
      JSON.stringify({ playerId: 'x', codename: 'a'.repeat(25) }),
    );
    const identity = loadIdentity(storage);
    expect(identity.codename.length).toBeLessThanOrEqual(CODENAME_MAX_LENGTH);
  });
});

describe('the 20-character cap is authoritative on the server, not only the client', () => {
  it('rejects a 25-character codename in clientMessageSchema', () => {
    const result = clientMessageSchema.safeParse({
      type: 'CREATE',
      codename: 'a'.repeat(25),
    });
    expect(result.success).toBe(false);
  });

  it('accepts a codename at exactly CODENAME_MAX_LENGTH', () => {
    const result = clientMessageSchema.safeParse({
      type: 'CREATE',
      codename: 'a'.repeat(CODENAME_MAX_LENGTH),
    });
    expect(result.success).toBe(true);
  });
});
