import type { DirectoryEntry } from '@berlin/shared';
import { describe, expect, it } from 'vitest';
import { CONNECTING_LABEL, EMPTY_BODY, EMPTY_HEADING, lobbyRows } from './lobbyList.js';

/**
 * Covers 03-01-PLAN.md Task 2's last two <behavior> bullets: lobbyRows()
 * never reorders its input, and two entries that would otherwise look
 * identical (same hostCodename, same seat counts) still produce two rows
 * with distinct keys because rows are keyed by `code`.
 */

function entry(overrides: Partial<DirectoryEntry> = {}): DirectoryEntry {
  return {
    code: 'AAAAAA',
    seatsFilled: 1,
    seatsTotal: 4,
    hostCodename: 'Iron Falcon',
    ...overrides,
  };
}

describe('lobbyRows', () => {
  it('preserves the argument array order exactly, never sorting', () => {
    const lobbies = [
      entry({ code: 'a-code', hostCodename: 'Alpha' }),
      entry({ code: 'b-code', hostCodename: 'Bravo' }),
      entry({ code: 'c-code', hostCodename: 'Charlie' }),
      entry({ code: 'd-code', hostCodename: 'Delta' }),
    ];
    expect(lobbyRows(lobbies).map((r) => r.code)).toEqual(['a-code', 'b-code', 'c-code', 'd-code']);
  });

  it('gives two entries with identical hostCodename and seat counts distinct keys, keyed by code', () => {
    const lobbies = [
      entry({ code: 'AAAAAA', hostCodename: 'Iron Falcon', seatsFilled: 2, seatsTotal: 4 }),
      entry({ code: 'BBBBBB', hostCodename: 'Iron Falcon', seatsFilled: 2, seatsTotal: 4 }),
    ];
    const rows = lobbyRows(lobbies);
    expect(rows).toHaveLength(2);
    expect(rows[0]?.key).not.toBe(rows[1]?.key);
    expect(rows.map((r) => r.key)).toEqual(['AAAAAA', 'BBBBBB']);
  });
});

describe('lobbyList empty/connecting copy constants (Task 3)', () => {
  it('EMPTY_HEADING, EMPTY_BODY and CONNECTING_LABEL are non-empty, distinct strings', () => {
    const values = [EMPTY_HEADING, EMPTY_BODY, CONNECTING_LABEL];
    for (const value of values) {
      expect(typeof value).toBe('string');
      expect(value.length).toBeGreaterThan(0);
    }
    expect(new Set(values).size).toBe(values.length);
  });

  it('lobbyRows([]) returns an empty array — the value the empty-state branch keys off', () => {
    expect(lobbyRows([])).toEqual([]);
  });
});
