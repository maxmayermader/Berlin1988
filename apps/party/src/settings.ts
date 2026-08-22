import { consumablePassivesIn, createMatch, PHANTOM, seedRng } from '@berlin/engine';
import { playerId as toPlayerId } from '@berlin/shared';
import type { MatchSettings, SeatConfig } from '@berlin/shared';
import { fillEmptySeatsWithBots } from './bots.js';
import type { RoomState } from './state.js';

/**
 * Every field this phase locks (D-01 through D-04), readable as literal
 * values at this call site rather than hidden behind a test helper's
 * defaults. `quickSettings()` in packages/engine is a reference for the
 * field set only — building the object explicitly here is what keeps
 * these decisions visible in review.
 */
export function buildMatchConfig(state: RoomState): MatchSettings {
  const seats: SeatConfig[] = state.seats.map((seat) => ({
    id: toPlayerId(seat.playerId ?? `empty-${seat.index}`),
    name: seat.codename ?? `Seat ${seat.index + 1}`,
    faction: seat.faction,
    kind: seat.kind === 'BOT' ? 'BOT' : 'HUMAN',
    personality: seat.personality ?? undefined,
    difficulty: seat.difficulty ?? undefined,
    team: null,
  }));

  return {
    seats,
    agentsPerPlayer: 1, // D-02
    mapId: 'duel-12', // D-03 — the only key in MAPS
    teams: false,
    roundTimerSeconds: 90, // D-04
    pausesPerPlayer: 0, // no pause flow this phase
    roundLimit: 14,
    dossierCount: 2,
    startingIntel: 4,
    blockadeMode: 'MIXED',
    rulesetId: 'default',
  };
}

/**
 * The single LOADOUT -> IN_GAME transition, and the only createMatch call
 * site in the codebase. Idempotence guard: returns `state` unchanged
 * unless still in LOBBY or LOADOUT, so a double-fired alarm or a replayed
 * message can never reset an in-progress match.
 */
export function startMatch(state: RoomState, now: number): RoomState {
  if (state.phase !== 'LOBBY' && state.phase !== 'LOADOUT') return state;

  const filled = fillEmptySeatsWithBots(state, seedRng(`${state.matchId}:bots`));
  const config = buildMatchConfig(filled);
  const gameState = createMatch(config, state.matchId);

  // D-01: no deckbuilder this phase — every seat plays PHANTOM regardless
  // of the faction-based starter loadout createMatch() assigns by default.
  const withPhantom = {
    ...gameState,
    players: Object.fromEntries(
      Object.entries(gameState.players).map(([id, player]) => [
        id,
        {
          ...player,
          loadout: [...PHANTOM],
          passivesAvailable: consumablePassivesIn(PHANTOM),
        },
      ]),
    ),
  };

  return {
    ...filled,
    phase: 'IN_GAME',
    startsAt: null,
    gameState: withPhantom,
  };
}
