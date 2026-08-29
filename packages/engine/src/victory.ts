import type { GameState, MatchOutcome, PlayerId } from '@berlin/shared';

/** Score = dossiers × 3 + informants × 1 + burns inflicted × 2. */
export function scoreOf(state: GameState, id: PlayerId): number {
  const p = state.players[id as string];
  if (!p) return 0;
  const rs = state.ruleset;

  let informants = 0;
  for (const n of Object.values(state.nodes)) {
    if (n.informantOwner === id) informants++;
  }

  return (
    p.dossiersExtracted * rs.scorePerDossier +
    informants * rs.scorePerInformant +
    p.burnsInflicted * rs.scorePerBurn
  );
}

export function agentsAlive(state: GameState, id: PlayerId): number {
  return state.players[id as string]?.agents.filter((a) => a.alive).length ?? 0;
}

/**
 * Checked at Upkeep, in order: extraction, elimination, round limit.
 * Every match ends — there are no draws and no infinite stalemates.
 */
export function checkVictory(state: GameState): MatchOutcome | null {
  const rs = state.ruleset;

  // 1. Extraction — already recorded by the objectives step.
  const extracted = state.playerOrder.filter(
    (id) => (state.players[id as string]?.dossiersExtracted ?? 0) >= rs.dossiersToExtract,
  );
  if (extracted.length > 0) {
    return { reason: 'EXTRACTION', winners: withTeammates(state, extracted) };
  }

  // 2. Elimination — one side left standing.
  const living = state.playerOrder.filter((id) => agentsAlive(state, id) > 0);
  if (living.length === 0) {
    return { reason: 'ELIMINATION', winners: [] };
  }
  if (living.length === 1 && state.playerOrder.length > 1) {
    return { reason: 'ELIMINATION', winners: withTeammates(state, living) };
  }
  if (state.settings.teams) {
    const teams = new Set(living.map((id) => state.players[id as string]!.team));
    if (teams.size === 1) {
      return { reason: 'ELIMINATION', winners: withTeammates(state, living) };
    }
  }

  // 3. Round limit — highest score, ties broken by Intel then surviving agents.
  if (state.round > state.settings.roundLimit) {
    const ranked = [...state.playerOrder].sort((a, b) => {
      const ds = scoreOf(state, b) - scoreOf(state, a);
      if (ds !== 0) return ds;
      const di =
        (state.players[b as string]?.intel ?? 0) - (state.players[a as string]?.intel ?? 0);
      if (di !== 0) return di;
      return agentsAlive(state, b) - agentsAlive(state, a);
    });
    const top = ranked[0]!;
    const topScore = scoreOf(state, top);
    const tied = ranked.filter((id) => scoreOf(state, id) === topScore);
    return { reason: 'ROUND_LIMIT', winners: withTeammates(state, tied.slice(0, 1)) };
  }

  return null;
}

function withTeammates(state: GameState, ids: readonly PlayerId[]): PlayerId[] {
  if (!state.settings.teams) return [...ids];
  const teams = new Set(ids.map((id) => state.players[id as string]?.team));
  return state.playerOrder.filter((id) => teams.has(state.players[id as string]!.team));
}
