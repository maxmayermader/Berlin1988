import { describe, expect, it } from 'vitest';
import { createMatch, legalOrders, projectView, quickSettings } from '@berlin/engine';
import type { Action, PlayerId, PlayerView } from '@berlin/shared';
import {
  ACTIONS_PER_AGENT,
  assignAction,
  clearSlot,
  emptyDraft,
  isSubmittable,
  toAgentOrder,
  type OrderDraft,
} from './orderDraft.js';

/**
 * MATCH-02's rules, exercised against a real PlayerView built by driving
 * createMatch() and projecting it — the reducer's rules are checked against
 * genuine legality answers, not a stub, per this plan's <testing_note>.
 */

function buildView(playerId: PlayerId): PlayerView {
  const state = createMatch(quickSettings(), 'orderDraft-test-seed');
  return projectView(state, playerId);
}

const HOLD: Action = { type: 'HOLD' };

describe('ACTIONS_PER_AGENT and emptyDraft', () => {
  it('is the fixed integer 2, and emptyDraft has exactly two empty slots', () => {
    expect(ACTIONS_PER_AGENT).toBe(2);
    expect(emptyDraft()).toEqual({ slots: [null, null] });
  });
});

describe('isSubmittable', () => {
  it('is false with zero or one slot filled, true with exactly two', () => {
    const empty = emptyDraft();
    expect(isSubmittable(empty)).toBe(false);

    const one = assignAction(empty, 0, HOLD);
    expect(isSubmittable(one)).toBe(false);

    const two = assignAction(one, 1, { type: 'MOVE', to: 'x' as never });
    expect(isSubmittable(two)).toBe(true);
  });
});

describe('assignAction', () => {
  it('fills an empty slot, producing an ordered pair of two distinct entries', () => {
    const draft = emptyDraft();
    const withFirst = assignAction(draft, 0, HOLD);
    const move: Action = { type: 'MOVE', to: 'tiergarten' as never };
    const withBoth = assignAction(withFirst, 1, move);

    expect(withBoth.slots[0]).toEqual(HOLD);
    expect(withBoth.slots[1]).toEqual(move);
    expect(withBoth.slots[0]).not.toEqual(withBoth.slots[1]);
  });

  it('on a draft that already holds two actions, returns the draft unchanged', () => {
    const full: OrderDraft = { slots: [HOLD, { type: 'MOVE', to: 'tiergarten' as never }] };
    const attempted = assignAction(full, 0, { type: 'MOVE', to: 'kreuzberg' as never });
    expect(attempted).toEqual(full);
    const attempted2 = assignAction(full, 1, { type: 'MOVE', to: 'kreuzberg' as never });
    expect(attempted2).toEqual(full);
  });

  it('returns the draft unchanged for an out-of-range slot index', () => {
    const draft = emptyDraft();
    expect(assignAction(draft, 2, HOLD)).toEqual(draft);
    expect(assignAction(draft, -1, HOLD)).toEqual(draft);
  });
});

describe('clearSlot', () => {
  it('clears one slot and leaves the other untouched', () => {
    const move: Action = { type: 'MOVE', to: 'tiergarten' as never };
    const full: OrderDraft = { slots: [HOLD, move] };
    const cleared = clearSlot(full, 0);
    expect(cleared.slots[0]).toBeNull();
    expect(cleared.slots[1]).toEqual(move);
  });
});

describe('toAgentOrder', () => {
  it('emits actions in slot order: slot 1 at index 0, slot 2 at index 1', () => {
    const move: Action = { type: 'MOVE', to: 'tiergarten' as never };
    const draft: OrderDraft = { slots: [HOLD, move] };
    const order = toAgentOrder('agent-1' as never, draft);
    expect(order.actions[0]).toEqual(HOLD);
    expect(order.actions[1]).toEqual(move);
  });
});

describe('legalOrders prefix behavior (the engine answer the composer renders verbatim)', () => {
  it('offers MOVE and HOLD for an empty prefix', () => {
    const view = buildView('p1' as PlayerId);
    const agent = view.self.agents[0]!;
    const options = legalOrders(view, agent.id, []);
    expect(options.some((a) => a.type === 'HOLD')).toBe(true);
    expect(options.some((a) => a.type === 'MOVE')).toBe(true);
  });

  it('stops offering MOVE and SPRINT once an operation (STRIKE/BRIBE) sits in the prefix', () => {
    // RED's starter loadout (HUNTER) carries STRIKE cards; a self-strike is
    // always a legal target (legalOrders' STRIKE loop includes sim.pos).
    const view = buildView('p2' as PlayerId);
    const agent = view.self.agents[0]!;
    const options = legalOrders(view, agent.id, []);
    const strike = options.find((a) => a.type === 'STRIKE' && a.target === agent.nodeId);
    expect(strike).toBeDefined();

    const nextOptions = legalOrders(view, agent.id, [strike as Action]);
    expect(nextOptions.some((a) => a.type === 'MOVE')).toBe(false);
    expect(nextOptions.some((a) => a.type === 'SPRINT')).toBe(false);
  });
});
