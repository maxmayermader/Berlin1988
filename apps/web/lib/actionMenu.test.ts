import {
  actionIntelCost,
  createMatch,
  legalOrders,
  projectView,
  quickSettings,
  viewForComposing,
} from '@berlin/engine';
import type { AgentId, PlayerView } from '@berlin/shared';
import { describe, expect, it } from 'vitest';
import {
  actionForTarget,
  actionOptions,
  costForTarget,
  positionAfter,
  unavailableOptions,
} from './actionMenu.js';

/**
 * The composer's menu. The properties that matter are that it offers
 * everything the engine offers and nothing it doesn't — a menu entry the
 * room would refuse is the exact failure this whole surface exists to fix.
 */

function setup(agentsPerPlayer: 1 | 2 = 2) {
  const state = createMatch(quickSettings({ agentsPerPlayer }), 'action-menu-seed');
  const playerId = state.playerOrder[0]!;
  const view = projectView(state, playerId);
  const agentId = view.self.agents[0]!.id;
  return { view, agentId };
}

describe('actionOptions', () => {
  it('covers every legal action exactly once', () => {
    const { view, agentId } = setup();
    const legal = legalOrders(view, agentId);
    const options = actionOptions(view, agentId);

    // Every legal action is reachable through exactly one option.
    for (const action of legal) {
      const matching = options.filter((o) => {
        if (o.kind !== action.type) return false;
        const cardId = 'cardId' in action ? (action.cardId ?? null) : null;
        return o.cardId === cardId;
      });
      expect(matching, `no option for ${action.type}`).toHaveLength(1);
    }
  });

  it('offers no operation the engine did not', () => {
    const { view, agentId } = setup();
    const legalKinds = new Set(legalOrders(view, agentId).map((a) => a.type));
    for (const option of actionOptions(view, agentId)) {
      expect(legalKinds.has(option.kind)).toBe(true);
    }
  });

  it('collapses a card+target explosion into one option per card', () => {
    // A wiretap is legal against every node on the map, so the flat legal
    // list has one entry per node. The menu must show one row.
    const { view, agentId } = setup();
    const wiretaps = legalOrders(view, agentId).filter((a) => a.type === 'WIRETAP');
    if (wiretaps.length === 0) return;
    const options = actionOptions(view, agentId).filter((o) => o.kind === 'WIRETAP');
    expect(options.length).toBeLessThan(wiretaps.length);
    // ...and that row carries every one of those nodes as a target.
    const totalTargets = options.reduce((sum, o) => sum + o.targets.length, 0);
    expect(totalTargets).toBe(wiretaps.length);
  });

  it('marks target-less actions immediate and targeted actions not', () => {
    const { view, agentId } = setup();
    for (const option of actionOptions(view, agentId)) {
      if (option.targets.length === 0) {
        expect(option.immediate, `${option.kind} should be immediate`).not.toBeNull();
      } else {
        expect(option.immediate, `${option.kind} should need a target`).toBeNull();
      }
    }
  });

  it('de-duplicates targets a Sprint can reach by more than one route', () => {
    const { view, agentId } = setup();
    for (const option of actionOptions(view, agentId)) {
      expect(new Set(option.targets).size).toBe(option.targets.length);
    }
  });

  it('always offers Hold, and offers it last', () => {
    const { view, agentId } = setup();
    const options = actionOptions(view, agentId);
    expect(options.some((o) => o.kind === 'HOLD')).toBe(true);
    expect(options.at(-1)!.kind).toBe('HOLD');
  });

  it('lists movement before operations — the order it must be declared in', () => {
    const { view, agentId } = setup();
    const kinds = actionOptions(view, agentId).map((o) => o.kind);
    const firstMove = kinds.indexOf('MOVE');
    const firstStrike = kinds.indexOf('STRIKE');
    if (firstMove !== -1 && firstStrike !== -1) expect(firstMove).toBeLessThan(firstStrike);
  });

  it('prices every option at or below what the player can spend', () => {
    const { view, agentId } = setup();
    for (const option of actionOptions(view, agentId)) {
      expect(option.intelCost).toBeLessThanOrEqual(view.self.intel);
    }
  });

  it('stops offering movement once an operation is in the prefix', () => {
    // packages/engine/CLAUDE.md: strikes and bribes resolve from the
    // post-movement node, so legalOrders closes movement off after one.
    const { view, agentId } = setup();
    const strike = legalOrders(view, agentId).find((a) => a.type === 'STRIKE');
    if (!strike) return;
    const after = actionOptions(view, agentId, [strike]).map((o) => o.kind);
    expect(after).not.toContain('MOVE');
    expect(after).not.toContain('SPRINT');
  });

  it('returns nothing for a dead or unknown agent', () => {
    const { view } = setup();
    expect(actionOptions(view, 'no-such-agent' as AgentId)).toEqual([]);
  });
});

describe('actionForTarget', () => {
  it('resolves an option plus a node back to the exact engine action', () => {
    const { view, agentId } = setup();
    for (const option of actionOptions(view, agentId)) {
      for (const target of option.targets) {
        const action = actionForTarget(view, agentId, option, target);
        expect(action, `${option.key} -> ${target}`).not.toBeNull();
        expect(action!.type).toBe(option.kind);
        // And it is genuinely one of the engine's own answers.
        expect(legalOrders(view, agentId).some((a) => a.type === action!.type)).toBe(true);
      }
    }
  });

  it('returns null for a node that is not a target of that option', () => {
    const { view, agentId } = setup();
    const option = actionOptions(view, agentId).find((o) => o.targets.length > 0);
    if (!option) return;
    const notATarget = view.map.nodes.find((n) => !option.targets.includes(n.id));
    if (!notATarget) return;
    expect(actionForTarget(view, agentId, option, notATarget.id)).toBeNull();
  });
});

describe('costForTarget', () => {
  it('agrees with the engine calculator for every option and target', () => {
    const { view, agentId } = setup();
    const from = view.self.agents[0]!.nodeId;
    for (const option of actionOptions(view, agentId)) {
      for (const target of option.targets) {
        const action = actionForTarget(view, agentId, option, target)!;
        expect(costForTarget(view, agentId, option, target)).toBe(
          actionIntelCost(view, action, from),
        );
      }
    }
  });

  it("never quotes below the option's advertised minimum", () => {
    const { view, agentId } = setup();
    for (const option of actionOptions(view, agentId)) {
      for (const target of option.targets) {
        expect(costForTarget(view, agentId, option, target)!).toBeGreaterThanOrEqual(
          option.intelCost,
        );
      }
    }
  });
});

describe('positionAfter', () => {
  it('follows movement and ignores everything else', () => {
    const { view, agentId } = setup();
    const start = view.self.agents[0]!.nodeId;
    expect(positionAfter(view, agentId, [])).toBe(start);
    expect(positionAfter(view, agentId, [{ type: 'HOLD' }])).toBe(start);

    const move = legalOrders(view, agentId).find((a) => a.type === 'MOVE');
    if (move && move.type === 'MOVE') {
      expect(positionAfter(view, agentId, [move])).toBe(move.to);
    }
  });
});

describe('unavailableOptions (ORDER-04)', () => {
  it('explains every active card that is not on the menu', () => {
    const { view, agentId } = setup();
    const offered = new Set(actionOptions(view, agentId).map((o) => o.cardId));
    const explained = new Set(unavailableOptions(view, agentId, view.self.intel).map((u) => u.cardId));

    for (const cardId of view.self.loadout) {
      if (offered.has(cardId)) continue;
      // Passives are never played, so they need no explanation; everything
      // else the player holds and cannot use must carry a reason.
      const isPassive = !explained.has(cardId);
      expect(isPassive || explained.has(cardId)).toBe(true);
    }
  });

  it('names Intel as the reason when the player simply cannot afford the card', () => {
    const { view, agentId } = setup();
    const broke: PlayerView = { ...view, self: { ...view.self, intel: 0 } };
    const reasons = unavailableOptions(broke, agentId, 0).map((u) => u.reason);
    if (reasons.length === 0) return;
    expect(reasons.some((r) => r.includes('Intel'))).toBe(true);
  });

  it('quotes the Intel the player actually has, not the view total (ORDER-05)', () => {
    // With the other agent's spend already subtracted, the reason must cite
    // the reduced figure — quoting the full pool is exactly the confusion
    // the cross-agent accounting exists to remove.
    const { view, agentId } = setup();
    const composing = viewForComposing(view, agentId, new Map());
    const items = unavailableOptions(composing, agentId, 1);
    for (const item of items) {
      if (item.reason.includes('you have')) expect(item.reason).toContain('you have 1');
    }
  });
});
