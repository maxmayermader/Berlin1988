import {
  createMatch,
  legalOrders,
  submitOrder,
  resolveRound,
  viewForOrdering,
  quickSettings,
  seedRng,
  nextInt,
  actionBudget,
  maxFreeActions,
} from '../src/index.js';
import type {
  Action,
  AgentOrder,
  GameState,
  MatchSettings,
  PlayerId,
  ResolutionEvent,
  RngState,
} from '@berlin/shared';

/**
 * A deliberately crude random-legal-move bot. Not an opponent — a fuzzer. Its
 * job is to drive thousands of matches through the pipeline so soak, property,
 * and determinism tests have something to chew on.
 */
export function randomActions(
  state: GameState,
  player: PlayerId,
  agentId: string,
  rng: RngState,
): AgentOrder {
  // Must be viewForOrdering, not projectView: a player's agents share one
  // Intel pool, so agent two has to see what agent one already committed.
  const view = viewForOrdering(state, player, agentId);
  const agent = view.self.agents.find((a) => (a.id as string) === agentId);
  if (!agent) return { agentId: agentId as never, actions: [] };

  // Bounded by legalOrders returning [] once slots and free actions are spent,
  // not by a fixed count — ambush costs Intel but no slot, so an agent can have
  // more entries than it has actions.
  const cap = actionBudget(agent, state.ruleset) + maxFreeActions(state.ruleset);
  const actions: Action[] = [];
  for (let i = 0; i < cap; i++) {
    const options = legalOrders(view, agentId as never, actions);
    if (options.length === 0) break;
    actions.push(options[nextInt(rng, options.length)]!);
  }
  return { agentId: agentId as never, actions };
}

export interface PlayedMatch {
  final: GameState;
  rounds: number;
  log: ResolutionEvent[];
  /** Every order issued, in submission sequence — replay input. */
  script: { player: PlayerId; order: AgentOrder }[];
}

/** Drive a whole match with random legal moves. */
export function playRandomMatch(
  seed: string,
  settings: MatchSettings = quickSettings(),
  maxRounds = 40,
): PlayedMatch {
  let state = createMatch(settings, seed);
  const rng = seedRng(`${seed}:bot`);
  const log: ResolutionEvent[] = [];
  const script: { player: PlayerId; order: AgentOrder }[] = [];

  let guard = 0;
  while (state.phase === 'ORDERS' && guard++ < maxRounds) {
    for (const pid of state.playerOrder) {
      const p = state.players[pid as string]!;
      if (p.eliminated) continue;
      for (const agent of p.agents) {
        if (!agent.alive) continue;
        const order = randomActions(state, pid, agent.id as string, rng);
        const res = submitOrder(state, pid, order);
        if (res.rejection) {
          throw new Error(
            `Random bot produced an illegal order: ${res.rejection.code} ${res.rejection.message}`,
          );
        }
        state = res.state;
        script.push({ player: pid, order });
      }
    }
    const out = resolveRound(state);
    state = out.state;
    log.push(...out.log);
  }

  return { final: state, rounds: state.round, log, script };
}

/** Replay a recorded script. Must reproduce the original byte for byte. */
export function replay(
  seed: string,
  settings: MatchSettings,
  script: { player: PlayerId; order: AgentOrder }[],
): GameState {
  let state = createMatch(settings, seed);
  let i = 0;
  while (i < script.length && state.phase === 'ORDERS') {
    const liveAgents = countLiveAgents(state);
    for (let n = 0; n < liveAgents && i < script.length; n++, i++) {
      const step = script[i]!;
      state = submitOrder(state, step.player, step.order).state;
    }
    state = resolveRound(state).state;
  }
  return state;
}

function countLiveAgents(state: GameState): number {
  let n = 0;
  for (const pid of state.playerOrder) {
    const p = state.players[pid as string]!;
    if (p.eliminated) continue;
    n += p.agents.filter((a) => a.alive).length;
  }
  return n;
}

/** Stable fingerprint of everything that matters, for replay comparison. */
export function fingerprint(state: GameState): string {
  return JSON.stringify({
    round: state.round,
    phase: state.phase,
    rng: state.rng,
    outcome: state.outcome,
    players: state.playerOrder.map((id) => {
      const p = state.players[id as string]!;
      return {
        id: p.id,
        intel: p.intel,
        safehouse: p.safehouse,
        eliminated: p.eliminated,
        burnsInflicted: p.burnsInflicted,
        dossiersExtracted: p.dossiersExtracted,
        passives: [...p.passivesAvailable].sort(),
        agents: p.agents.map((a) => ({ id: a.id, node: a.nodeId, alive: a.alive, d: a.dossiers })),
      };
    }),
    nodes: Object.entries(state.nodes)
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([k, v]) => [k, v.informantOwner, v.dossiers, v.blockadedUntil]),
    traps: [...state.traps].map((t) => `${t.ownerId}@${t.nodeId}`).sort(),
    decoys: [...state.decoys].map((d) => `${d.ownerId}@${d.nodeId}`).sort(),
  });
}
