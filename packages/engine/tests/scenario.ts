import { createMatch, quickSettings } from '../src/index.js';
import { cardId, nodeId, playerId, type Action, type AgentId, type CardId, type GameState, type MatchSettings, type NodeId, type PlayerId } from '@berlin/shared';

/**
 * Scenario builder for rules tests.
 *
 * These tests set `pendingOrders` directly rather than going through
 * submitOrder: the point is to exercise the RESOLUTION pipeline in a controlled
 * position, not to re-test legality (determinism.test.ts covers that path).
 */
export class Scenario {
  state: GameState;

  constructor(seed = 'scenario', overrides: Partial<MatchSettings> = {}) {
    this.state = createMatch(
      quickSettings({ agentsPerPlayer: 1, blockadeMode: 'OFF', ...overrides }),
      seed,
    );
    // Clear the random dossier placement so objectives don't fire unexpectedly.
    for (const n of Object.values(this.state.nodes)) n.dossiers = 0;
    this.state.dossierRespawns = [];
  }

  p(n: 1 | 2): PlayerId {
    return playerId(`p${n}`);
  }

  agent(n: 1 | 2, i = 1): AgentId {
    return `p${n}:a${i}` as AgentId;
  }

  at(n: 1 | 2, node: string, i = 1): this {
    const p = this.state.players[`p${n}`]!;
    p.agents[i - 1]!.nodeId = nodeId(node);
    return this;
  }

  intel(n: 1 | 2, amount: number): this {
    this.state.players[`p${n}`]!.intel = amount;
    return this;
  }

  safehouse(n: 1 | 2, node: string | null): this {
    this.state.players[`p${n}`]!.safehouse = node ? nodeId(node) : null;
    return this;
  }

  /** Replace a player's loadout wholesale. Consumable passives are re-derived. */
  loadout(n: 1 | 2, cards: string[]): this {
    const p = this.state.players[`p${n}`]!;
    p.loadout = cards.map(cardId) as CardId[];
    p.passivesAvailable = cards
      .filter((c) => c.startsWith('ps_'))
      .map(cardId) as CardId[];
    p.cooldowns = {};
    return this;
  }

  trap(n: 1 | 2, node: string): this {
    this.state.traps.push({
      id: `t${this.state.traps.length + 1}`,
      ownerId: this.p(n),
      nodeId: nodeId(node),
      expiresAfterRound: this.state.round + 3,
    });
    return this;
  }

  dossiers(n: 1 | 2, count: number, i = 1): this {
    this.state.players[`p${n}`]!.agents[i - 1]!.dossiers = count;
    return this;
  }

  nodeDossiers(node: string, count: number): this {
    this.state.nodes[node]!.dossiers = count;
    return this;
  }

  silencers(n: 1 | 2, count: number): this {
    this.state.players[`p${n}`]!.silencers = count;
    return this;
  }

  blockade(node: string, round: number, duration = 2, announced = false): this {
    (this.state.blockadeSchedule as unknown[]).push({
      nodeId: nodeId(node),
      round,
      duration,
      announced,
    });
    return this;
  }

  order(n: 1 | 2, actions: Action[], i = 1): this {
    const id = this.agent(n, i);
    this.state.pendingOrders[id as string] = { agentId: id, actions };
    return this;
  }

  node(name: string): NodeId {
    return nodeId(name);
  }
}

export const strike = (target: string, card = 'st_red'): Action => ({
  type: 'STRIKE',
  cardId: cardId(card),
  target: nodeId(target),
});

export const ambush = (card = 'st_red'): Action => ({
  type: 'AMBUSH',
  cardId: cardId(card),
});

export const move = (to: string): Action => ({ type: 'MOVE', to: nodeId(to) });

export const hold = (): Action => ({ type: 'HOLD' });

export const wiretap = (target: string, card = 'wt_red'): Action => ({
  type: 'WIRETAP',
  cardId: cardId(card),
  target: nodeId(target),
});
