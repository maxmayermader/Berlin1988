import type { LobbySeat, LobbySnapshot } from '@berlin/shared';
import { describe, expect, it } from 'vitest';
import {
  NOT_READY_BADGE_TEXT,
  READY_BADGE_TEXT,
  readySummary,
  seatRows,
  shouldShowCountdown,
} from './seatRows.js';

function seat(overrides: Partial<LobbySeat> & { index: number }): LobbySeat {
  return {
    playerId: null,
    codename: null,
    faction: 'RED',
    kind: 'OPEN',
    ready: false,
    ...overrides,
  };
}

function snapshot(seats: LobbySeat[], startsAt: number | null = null): LobbySnapshot {
  return { code: 'ABCDEF', phase: 'LOBBY', hostPlayerId: 'p0', startsAt, seats };
}

describe('apps/web/lib/seatRows (pure view model)', () => {
  it('a mixed-ready snapshot yields exactly one ready badge and exactly one not-ready badge', () => {
    const rows = seatRows(
      snapshot([
        seat({ index: 0, playerId: 'p0', codename: 'Vogel', kind: 'HUMAN', ready: true }),
        seat({ index: 1, playerId: 'p1', codename: 'Katja', kind: 'HUMAN', ready: false }),
      ]),
    );

    expect(rows.filter((r) => r.badgeText === READY_BADGE_TEXT)).toHaveLength(1);
    expect(rows.filter((r) => r.badgeText === NOT_READY_BADGE_TEXT)).toHaveLength(1);
    expect(rows[0]!.badgeText).toBe('Ready ✓');
    expect(rows[1]!.badgeText).toBe('Not ready');
  });

  it('an open seat yields kind OPEN, badgeText null and label null', () => {
    const rows = seatRows(snapshot([seat({ index: 0 })]));
    expect(rows[0]).toMatchObject({ kind: 'OPEN', badgeText: null, label: null });
  });

  it('a BOT seat yields isAi true; a HUMAN seat yields isAi false', () => {
    const rows = seatRows(
      snapshot([
        seat({ index: 0, playerId: 'b0', codename: 'Marek', kind: 'BOT' }),
        seat({ index: 1, playerId: 'p1', codename: 'Katja', kind: 'HUMAN' }),
      ]),
    );
    expect(rows[0]!.isAi).toBe(true);
    expect(rows[1]!.isAi).toBe(false);
  });

  it('preserves snapshot.seats array order exactly, before and after a ready toggle', () => {
    const base = [
      seat({ index: 0, playerId: 'p0', codename: 'Vogel', kind: 'HUMAN', ready: false }),
      seat({ index: 1, playerId: 'p1', codename: 'Katja', kind: 'HUMAN', ready: false }),
    ];
    const before = seatRows(snapshot(base)).map((r) => r.playerId);
    const toggled = [base[0], { ...base[1]!, ready: true }];
    const after = seatRows(snapshot(toggled as LobbySeat[])).map((r) => r.playerId);
    expect(after).toEqual(before);
  });

  it('shouldShowCountdown is false for a null startsAt and true for a set one', () => {
    expect(shouldShowCountdown(snapshot([], null))).toBe(false);
    expect(shouldShowCountdown(snapshot([], Date.now() - 1000))).toBe(true);
  });

  it('readySummary counts only filled seats on both sides; an all-open snapshot yields zeroes', () => {
    expect(readySummary(snapshot([seat({ index: 0 }), seat({ index: 1 })]))).toEqual({
      ready: 0,
      filled: 0,
    });
    expect(
      readySummary(
        snapshot([
          seat({ index: 0, playerId: 'p0', kind: 'HUMAN', ready: true }),
          seat({ index: 1, playerId: 'p1', kind: 'HUMAN', ready: false }),
          seat({ index: 2 }),
        ]),
      ),
    ).toEqual({ ready: 1, filled: 2 });
  });

  it('gives every seat a row, including open ones, mixing HUMAN, BOT and OPEN', () => {
    const s = snapshot([
      seat({ index: 0, playerId: 'p0', kind: 'HUMAN' }),
      seat({ index: 1, playerId: 'b1', kind: 'BOT' }),
      seat({ index: 2 }),
    ]);
    expect(seatRows(s)).toHaveLength(s.seats.length);
  });

  it("as the host, canKick is true on every occupied non-host row and false on the host's own row and every OPEN row", () => {
    const s = snapshot([
      seat({ index: 0, playerId: 'p0', codename: 'Vogel', kind: 'HUMAN' }),
      seat({ index: 1, playerId: 'p1', codename: 'Katja', kind: 'HUMAN' }),
      seat({ index: 2, playerId: 'b2', codename: 'Marek', kind: 'BOT' }),
      seat({ index: 3 }),
    ]);
    const rows = seatRows(s, { playerId: 'p0' });
    expect(rows[0]!.canKick).toBe(false); // host's own row
    expect(rows[1]!.canKick).toBe(true); // occupied non-host row
    expect(rows[2]!.canKick).toBe(true); // occupied non-host row (bot)
    expect(rows[3]!.canKick).toBe(false); // OPEN row
  });

  it('as a non-host viewer (or with no viewer), canKick is false on every row', () => {
    const s = snapshot([
      seat({ index: 0, playerId: 'p0', codename: 'Vogel', kind: 'HUMAN' }),
      seat({ index: 1, playerId: 'p1', codename: 'Katja', kind: 'HUMAN' }),
    ]);
    const asGuest = seatRows(s, { playerId: 'p1' });
    expect(asGuest.every((r) => r.canKick === false)).toBe(true);

    const noViewer = seatRows(s);
    expect(noViewer.every((r) => r.canKick === false)).toBe(true);
  });
});
