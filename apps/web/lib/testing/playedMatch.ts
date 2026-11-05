import {
  createMatch,
  legalOrders,
  nextInt,
  quickSettings,
  resolveRound,
  seedRng,
  submitOrder,
  viewForOrdering,
} from '@berlin/engine';
import type { Action, GameState, MatchSettings } from '@berlin/shared';

/**
 * TEST-ONLY fixture: drives a real match through the authoritative engine
 * with seeded random legal orders, yielding the state after every round.
 *
 * Lives under lib/testing/ and is imported only by *.test.ts files — never
 * by a component or route — so no browser bundle ever holds a GameState
 * (apps/web/lib/CLAUDE.md rule 2). Its purpose is the opposite of a leak:
 * the fog regression tests project each state through `projectView()` and
 * check the client code only ever works from that.
 */
export function playRounds(seed: string, rounds: number, settings: MatchSettings = quickSettings()): GameState[] {
  let state = createMatch(settings, seed);
  const rng = seedRng(`${seed}:web-fixture`);
  const out: GameState[] = [];

  for (let r = 0; r < rounds && state.phase === 'ORDERS'; r++) {
    for (const pid of state.playerOrder) {
      const player = state.players[pid as string]!;
      if (player.eliminated) continue;
      for (const agent of player.agents) {
        if (!agent.alive) continue;
        const actions: Action[] = [];
        for (let k = 0; k < 4; k++) {
          const view = viewForOrdering(state, pid, agent.id as string);
          const legal = legalOrders(view, agent.id, actions);
          if (legal.length === 0) break;
          actions.push(legal[nextInt(rng, legal.length)]!);
        }
        const res = submitOrder(state, pid, { agentId: agent.id, actions });
        if (!res.rejection) state = res.state;
      }
    }
    state = resolveRound(state).state;
    out.push(state);
  }
  return out;
}
