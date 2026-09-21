import { DEFAULT_LOBBY_SETTINGS, clientMessageSchema, type LobbySettings } from '@berlin/shared';
import { describe, expect, it } from 'vitest';
import { handleSetSettings } from '../src/handlers.js';
import {
  canSetSettings,
  emptySeats,
  sameSettings,
  setSeatCount,
  setSettings,
  type RoomState,
} from '../src/state.js';

/**
 * SET_SETTINGS — the host-only settings path (LOBBY-08..LOBBY-15).
 *
 * The wire schema, the state transition and the handler are each checked
 * against the rule they own: the schema bounds a malformed frame, the
 * transition owns ready-clearing, and the handler owns host authority.
 */

function fixtureState(overrides: Partial<RoomState> = {}): RoomState {
  const seats = emptySeats(4).map((seat, i) =>
    i < 2
      ? {
          ...seat,
          playerId: `p${i}`,
          codename: `Seat ${i}`,
          kind: 'HUMAN' as const,
          controlledBy: 'HUMAN' as const,
          connectionId: `c${i}`,
        }
      : seat,
  );
  return {
    code: 'ABCDEF',
    matchId: 'ABCDEF',
    phase: 'LOBBY',
    hostPlayerId: 'p0',
    seats,
    startsAt: null,
    gameState: null,
    deadlineAt: null,
    deadlineRound: null,
    botSubmissions: [],
    chat: { LOBBY: [], MATCH: [] },
    settings: DEFAULT_LOBBY_SETTINGS,
    disconnectedSeats: [],
    ...overrides,
  };
}

const CHANGED: LobbySettings = { ...DEFAULT_LOBBY_SETTINGS, agentsPerPlayer: 1, roundLimit: 10 };

describe('SET_SETTINGS wire schema', () => {
  it('accepts a well-formed settings frame', () => {
    const parsed = clientMessageSchema.safeParse({ type: 'SET_SETTINGS', settings: CHANGED });
    expect(parsed.success).toBe(true);
  });

  it.each([
    ['agentsPerPlayer above the union', { ...DEFAULT_LOBBY_SETTINGS, agentsPerPlayer: 3 }],
    ['roundLimit below the floor', { ...DEFAULT_LOBBY_SETTINGS, roundLimit: 2 }],
    ['roundLimit above the ceiling', { ...DEFAULT_LOBBY_SETTINGS, roundLimit: 999 }],
    ['a timer below the floor', { ...DEFAULT_LOBBY_SETTINGS, roundTimerSeconds: 5 }],
    ['an unknown blockade mode', { ...DEFAULT_LOBBY_SETTINGS, blockadeMode: 'SOMETIMES' }],
    ['dossierCount of zero', { ...DEFAULT_LOBBY_SETTINGS, dossierCount: 0 }],
    ['a non-integer round limit', { ...DEFAULT_LOBBY_SETTINGS, roundLimit: 10.5 }],
  ])('rejects %s as a malformed frame', (_label, settings) => {
    expect(clientMessageSchema.safeParse({ type: 'SET_SETTINGS', settings }).success).toBe(false);
  });

  it('rejects an unknown extra field rather than silently stripping it', () => {
    const parsed = clientMessageSchema.safeParse({
      type: 'SET_SETTINGS',
      settings: { ...DEFAULT_LOBBY_SETTINGS, mapId: 'ffa-18' },
    });
    expect(parsed.success).toBe(false);
  });

  it('carries no identity field a client could forge', () => {
    const parsed = clientMessageSchema.safeParse({
      type: 'SET_SETTINGS',
      settings: CHANGED,
      playerId: 'p0',
    });
    // The extra top-level key is stripped by z.object, never trusted — the
    // acting seat is always resolved from the connection binding.
    if (parsed.success) expect('playerId' in parsed.data).toBe(false);
  });
});

describe('setSettings (state transition)', () => {
  it('clears every ready flag and cancels a running countdown (LOBBY-15)', () => {
    const readied = fixtureState({
      seats: emptySeats(4).map((seat, i) =>
        i < 2
          ? { ...seat, playerId: `p${i}`, kind: 'HUMAN' as const, controlledBy: 'HUMAN' as const, ready: true }
          : seat,
      ),
      startsAt: 5_000,
    });
    const next = setSettings(readied, CHANGED, 1_000);
    expect(next.seats.every((s) => !s.ready)).toBe(true);
    expect(next.startsAt).toBeNull();
    expect(next.settings.roundLimit).toBe(10);
  });

  it('is a reference-equal no-op for identical settings — and so does NOT clear ready', () => {
    // A host nudging a control back to the value it already had must not
    // reset everyone's readiness, and must not fire a duplicate broadcast.
    const readied = fixtureState({
      seats: fixtureState().seats.map((s) => ({ ...s, ready: true })),
      startsAt: 5_000,
    });
    const next = setSettings(readied, { ...DEFAULT_LOBBY_SETTINGS }, 1_000);
    expect(next).toBe(readied);
    expect(next.seats.every((s) => s.ready)).toBe(true);
  });

  it('refuses to change settings outside LOBBY', () => {
    for (const phase of ['LOADOUT', 'IN_GAME', 'ENDED'] as const) {
      const state = fixtureState({ phase });
      expect(canSetSettings(state, CHANGED)).toBe(false);
      expect(setSettings(state, CHANGED, 1_000)).toBe(state);
    }
  });

  it('refuses an out-of-range value even when the wire schema is bypassed', () => {
    const state = fixtureState();
    const illegal = { ...DEFAULT_LOBBY_SETTINGS, roundLimit: 999 } as LobbySettings;
    expect(canSetSettings(state, illegal)).toBe(false);
    expect(setSettings(state, illegal, 1_000)).toBe(state);
  });
});

describe('dossier count follows the seat count (MAP-04)', () => {
  it('moves to the new count\'s tuned default when the host has not deviated', () => {
    // A 4-seat room opens at 3 dossiers; shrinking to a duel should land on
    // duel-12's tested value of 2.
    const four = fixtureState();
    expect(four.settings.dossierCount).toBe(3);
    const duel = setSeatCount(four, 2, 1_000);
    expect(duel.settings.dossierCount).toBe(2);
    // And back up again.
    expect(setSeatCount(duel, 4, 1_000).settings.dossierCount).toBe(3);
  });

  it('never overwrites a dossier count the host chose deliberately', () => {
    const chosen = fixtureState({
      settings: { ...DEFAULT_LOBBY_SETTINGS, dossierCount: 5 },
    });
    expect(setSeatCount(chosen, 2, 1_000).settings.dossierCount).toBe(5);
  });

  it('leaves every other setting alone on a resize', () => {
    const custom = fixtureState({
      settings: { ...DEFAULT_LOBBY_SETTINGS, agentsPerPlayer: 1, roundLimit: 20 },
    });
    const resized = setSeatCount(custom, 2, 1_000);
    expect(resized.settings.agentsPerPlayer).toBe(1);
    expect(resized.settings.roundLimit).toBe(20);
  });
});

describe('sameSettings', () => {
  it('distinguishes a change in any single field', () => {
    expect(sameSettings(DEFAULT_LOBBY_SETTINGS, { ...DEFAULT_LOBBY_SETTINGS })).toBe(true);
    const variants: LobbySettings[] = [
      { ...DEFAULT_LOBBY_SETTINGS, agentsPerPlayer: 1 },
      { ...DEFAULT_LOBBY_SETTINGS, roundTimerSeconds: null },
      { ...DEFAULT_LOBBY_SETTINGS, roundLimit: 12 },
      { ...DEFAULT_LOBBY_SETTINGS, blockadeMode: 'OFF' },
      { ...DEFAULT_LOBBY_SETTINGS, dossierCount: 5 },
    ];
    for (const variant of variants) {
      expect(sameSettings(DEFAULT_LOBBY_SETTINGS, variant)).toBe(false);
    }
  });
});

describe('handleSetSettings (host authority, LOBBY-14)', () => {
  it('applies a host change', () => {
    const result = handleSetSettings(fixtureState(), CHANGED, 'c0', 1_000);
    expect(result.toSender).toBeNull();
    expect(result.state!.settings.agentsPerPlayer).toBe(1);
  });

  it('rejects a non-host change and leaves settings untouched', () => {
    const state = fixtureState();
    const result = handleSetSettings(state, CHANGED, 'c1', 1_000);
    expect(result.state).toBe(state);
    expect(result.toSender).toEqual({
      type: 'SET_SETTINGS_REJECTED',
      field: null,
      message: 'Only the host can change match settings.',
    });
  });

  it('names the offending field when a value is out of range', () => {
    const illegal = { ...DEFAULT_LOBBY_SETTINGS, dossierCount: 99 } as LobbySettings;
    const result = handleSetSettings(fixtureState(), illegal, 'c0', 1_000);
    expect(result.state!.settings).toEqual(DEFAULT_LOBBY_SETTINGS);
    expect(result.toSender).toMatchObject({
      type: 'SET_SETTINGS_REJECTED',
      field: 'dossierCount',
    });
  });

  it('refuses once the match has started', () => {
    const result = handleSetSettings(fixtureState({ phase: 'IN_GAME' }), CHANGED, 'c0', 1_000);
    expect(result.toSender).toMatchObject({ type: 'SET_SETTINGS_REJECTED', field: null });
  });

  it('is a silent no-op for a connection bound to no seat', () => {
    const state = fixtureState();
    const result = handleSetSettings(state, CHANGED, 'unbound-connection', 1_000);
    expect(result.state).toBe(state);
    expect(result.toSender).toBeNull();
  });
});
