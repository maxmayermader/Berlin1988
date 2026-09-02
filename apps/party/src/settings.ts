import { consumablePassivesIn, createMatch, DEFAULT_RULESET, PHANTOM, seedRng, validateLoadout } from '@berlin/engine';
import { playerId as toPlayerId } from '@berlin/shared';
import type { MatchSettings, PlayerSecrets, SeatConfig } from '@berlin/shared';
import { fillEmptySeatsWithBots } from './bots.js';
import type { RoomSeat, RoomState } from './state.js';

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
    // Deliberately still reads seat.kind, not seat.controlledBy (audited in
    // Plan 03-04 Task 1): this records how the seat originated for the
    // match's own config, and a mid-match AI takeover (Task 3, D-08) must
    // not retroactively change the SeatConfig a match was built from.
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

  const seatsById = new Map<string, RoomSeat>(
    filled.seats.filter((seat) => seat.playerId !== null).map((seat) => [seat.playerId!, seat]),
  );

  // Phase 2 (this plan): a human seat plays the loadout it submitted via
  // SUBMIT_LOADOUT, re-validated here as defence in depth (the handler
  // already checked it on arrival, but the ruleset could move between
  // submission and match start — 02-RESEARCH.md Pitfall 2). A bot seat is
  // left exactly as createMatch() built it — its per-faction starter
  // loadout (defaultLoadoutFor) — never routed through the human path
  // (02-RESEARCH.md Pitfall 4: a bot seat has no submitted deck).
  const withLoadouts: Record<string, PlayerSecrets> = Object.fromEntries(
    Object.entries(gameState.players).map(([id, player]) => {
      const seat = seatsById.get(id);
      if (!seat || seat.kind === 'BOT') return [id, player];

      const chosen =
        seat.loadout !== null && validateLoadout(seat.loadout, DEFAULT_RULESET).length === 0
          ? seat.loadout
          : [...PHANTOM];

      return [
        id,
        {
          ...player,
          loadout: [...chosen],
          passivesAvailable: consumablePassivesIn(chosen),
        },
      ];
    }),
  );

  return {
    ...filled,
    phase: 'IN_GAME',
    startsAt: null,
    gameState: { ...gameState, players: withLoadouts },
  };
}
