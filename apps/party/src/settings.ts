import { consumablePassivesIn, createMatch, DEFAULT_RULESET, PHANTOM, seedRng, validateLoadout } from '@berlin/engine';
import { mapIdForPlayerCount, playerId as toPlayerId } from '@berlin/shared';
import type { MatchSettings, PlayerSecrets, SeatConfig } from '@berlin/shared';
import { fillEmptySeatsWithBots } from './bots.js';
import type { RoomSeat, RoomState } from './state.js';

/**
 * Builds the match's locked MatchSettings from the room's own lobby state.
 *
 * The five host-settable fields (LOBBY-08..LOBBY-12) come from
 * `state.settings`, validated on arrival by handleSetSettings and never
 * re-derived here. The rest stay literal at this call site: `teams`,
 * `pausesPerPlayer`, `startingIntel` and `rulesetId` have no host control
 * because nothing in the UI or the room honors changing them yet — a
 * control for a field nothing reads is the placebo this separation exists
 * to prevent.
 *
 * `mapId` is the one derived field: MAP-03 makes the map a function of the
 * seat count, not a host choice, and `mapIdForPlayerCount` in @berlin/shared
 * is the single definition of that rule — the lobby calls the same function
 * to show the host which map their current seat count selects.
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
    agentsPerPlayer: state.settings.agentsPerPlayer,
    mapId: mapIdForPlayerCount(seats.length),
    teams: false,
    roundTimerSeconds: state.settings.roundTimerSeconds,
    pausesPerPlayer: 0, // no pause flow yet
    roundLimit: state.settings.roundLimit,
    dossierCount: state.settings.dossierCount,
    startingIntel: 4,
    blockadeMode: state.settings.blockadeMode,
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
