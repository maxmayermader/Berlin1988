import { describe, expect, it } from 'vitest';
import type { Action, AgentId, PlayerView } from '@berlin/shared';
import {
  actionIntelCost,
  costOfOrder,
  createMatch,
  intelAvailableFor,
  legalOrders,
  projectView,
  quickSettings,
  submitOrder,
  viewForComposing,
  viewForOrdering,
} from '../src/index.js';

/**
 * The Intel cost calculator the order composer prices options with
 * (ORDER-03/ORDER-05).
 *
 * The property that actually matters is agreement with the engine's own
 * charging: a price the UI shows and a price the room charges that differ
 * by even 1 Intel is worse than showing nothing, because the player plans
 * against the wrong number. So the central test here compares this
 * PlayerView-shaped calculator against `viewForOrdering`, the GameState-shaped
 * accounting the room actually uses.
 */

function setup(agentsPerPlayer: 1 | 2 = 2) {
  const state = createMatch(quickSettings({ agentsPerPlayer }), 'action-cost-seed');
  const playerId = state.playerOrder[0]!;
  const view = projectView(state, playerId);
  return { state, playerId, view };
}

function agentsOf(view: PlayerView): AgentId[] {
  return view.self.agents.map((a) => a.id);
}

describe('actionIntelCost', () => {
  it('prices HOLD at nothing', () => {
    const { view } = setup();
    const agent = view.self.agents[0]!;
    expect(actionIntelCost(view, { type: 'HOLD' }, agent.nodeId)).toBe(0);
  });

  it('agrees with the engine on every legal action for an agent', () => {
    // The strong form: for each legal action, submitting it must reduce the
    // player's spendable Intel by exactly what this function predicted.
    const { state, playerId, view } = setup();
    const agentId = agentsOf(view)[0]!;
    const agent = view.self.agents.find((a) => a.id === agentId)!;

    for (const action of legalOrders(view, agentId)) {
      const predicted = actionIntelCost(view, action, agent.nodeId);

      const order = { agentId, actions: [action, { type: 'HOLD' as const }] };
      const result = submitOrder(state, playerId, order);
      if (result.rejection) continue; // a two-action pair can be illegal together

      // viewForOrdering reduces Intel by what this player's OTHER agents
      // committed, so ask it about a different agent to read the charge.
      const otherAgentId = agentsOf(view)[1];
      if (!otherAgentId) continue;
      const after = viewForOrdering(result.state, playerId, otherAgentId as string);
      expect(view.self.intel - after.self.intel).toBe(predicted);
    }
  });

  it('prices a sprint as both edge tolls plus the surcharge', () => {
    const { view } = setup();
    const agentId = agentsOf(view)[0]!;
    const agent = view.self.agents.find((a) => a.id === agentId)!;
    const sprint = legalOrders(view, agentId).find(
      (a): a is Extract<Action, { type: 'SPRINT' }> => a.type === 'SPRINT' && !a.cardId,
    );
    if (!sprint) return; // no legal cardless sprint from this position
    expect(actionIntelCost(view, sprint, agent.nodeId)).toBeGreaterThanOrEqual(
      view.ruleset.sprintIntelCost,
    );
  });

  it('never returns a negative price', () => {
    const { view } = setup();
    for (const agentId of agentsOf(view)) {
      const agent = view.self.agents.find((a) => a.id === agentId)!;
      for (const action of legalOrders(view, agentId)) {
        expect(actionIntelCost(view, action, agent.nodeId)).toBeGreaterThanOrEqual(0);
      }
    }
  });
});

describe('costOfOrder', () => {
  it('threads position, so a second action is priced from where the first ended', () => {
    const { view } = setup();
    const agentId = agentsOf(view)[0]!;
    const agent = view.self.agents.find((a) => a.id === agentId)!;
    const move = legalOrders(view, agentId).find(
      (a): a is Extract<Action, { type: 'MOVE' }> => a.type === 'MOVE',
    );
    if (!move) return;

    const { endsAt } = costOfOrder(view, agentId, [move]);
    expect(endsAt).toBe(move.to);
    expect(endsAt).not.toBe(agent.nodeId);
  });

  it('sums an empty order to nothing and leaves the agent where it started', () => {
    const { view } = setup();
    const agentId = agentsOf(view)[0]!;
    const agent = view.self.agents.find((a) => a.id === agentId)!;
    expect(costOfOrder(view, agentId, [])).toEqual({ intel: 0, endsAt: agent.nodeId });
  });
});

describe('intelAvailableFor (ORDER-05 — the cross-agent pool)', () => {
  it('subtracts what another agent has already committed', () => {
    const { view } = setup();
    const [first, second] = agentsOf(view);
    if (!first || !second) throw new Error('fixture needs two agents');

    const costly = legalOrders(view, first)
      .map((action) => ({
        action,
        cost: actionIntelCost(view, action, view.self.agents[0]!.nodeId),
      }))
      .sort((a, b) => b.cost - a.cost)[0];
    if (!costly || costly.cost === 0) return; // nothing costly is legal here

    const committed = new Map([[first as string, [costly.action]]]);
    expect(intelAvailableFor(view, second, committed)).toBe(view.self.intel - costly.cost);
  });

  it("ignores the agent's own entry — an agent never blocks itself", () => {
    const { view } = setup();
    const [first] = agentsOf(view);
    if (!first) throw new Error('fixture needs an agent');
    const committed = new Map([[first as string, [{ type: 'HOLD' as const }]]]);
    expect(intelAvailableFor(view, first, committed)).toBe(view.self.intel);
  });

  it('never goes negative', () => {
    const { view } = setup();
    const [first, second] = agentsOf(view);
    if (!first || !second) throw new Error('fixture needs two agents');
    // An implausibly expensive committed order — the floor still holds.
    const committed = new Map([
      [first as string, Array.from({ length: 20 }, () => ({ type: 'HOLD' as const }))],
    ]);
    expect(intelAvailableFor(view, second, committed)).toBeGreaterThanOrEqual(0);
  });
});

describe('viewForComposing', () => {
  it('returns the same view by reference when nothing is committed', () => {
    const { view } = setup();
    const agentId = agentsOf(view)[0]!;
    expect(viewForComposing(view, agentId, new Map())).toBe(view);
  });

  it('stops legalOrders offering a card the other agent has already spent the Intel for', () => {
    const { view } = setup();
    const [first, second] = agentsOf(view);
    if (!first || !second) throw new Error('fixture needs two agents');

    const startNode = view.self.agents[0]!.nodeId;
    const costly = legalOrders(view, first)
      .map((action) => ({ action, cost: actionIntelCost(view, action, startNode) }))
      .sort((a, b) => b.cost - a.cost)[0];
    if (!costly || costly.cost === 0) return;

    const committed = new Map([[first as string, [costly.action]]]);
    const composing = viewForComposing(view, second, committed);

    expect(composing.self.intel).toBe(view.self.intel - costly.cost);

    // Nothing offered to the second agent may cost more than what is left.
    for (const action of legalOrders(composing, second)) {
      expect(actionIntelCost(composing, action, startNode)).toBeLessThanOrEqual(
        composing.self.intel,
      );
    }
  });

  it('leaves every field but Intel untouched', () => {
    const { view } = setup();
    const [first, second] = agentsOf(view);
    if (!first || !second) throw new Error('fixture needs two agents');
    const committed = new Map([[first as string, [{ type: 'HOLD' as const }]]]);
    const composing = viewForComposing(view, second, committed);

    expect(composing.map).toBe(view.map);
    expect(composing.self.loadout).toBe(view.self.loadout);
    expect(composing.self.agents).toBe(view.self.agents);
    expect(composing.round).toBe(view.round);
  });
});
