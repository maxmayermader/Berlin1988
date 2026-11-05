import { describe, expect, it } from 'vitest';
import type { Action, AgentState } from '@berlin/shared';
import { agentPlans, plannedMarks } from './plannedPaths.js';

const n = (id: string) => id as never;

describe('plannedMarks (ORDER-08)', () => {
  it('threads movement: a strike after a move fires from where the move ends', () => {
    const marks = plannedMarks(n('a'), [
      { type: 'MOVE', to: n('b') },
      { type: 'STRIKE', cardId: n('st'), target: n('c') },
    ]);
    expect(marks).toEqual([
      { kind: 'route', slot: 0, nodes: ['a', 'b'] },
      { kind: 'strike', slot: 1, from: 'b', target: 'c' },
    ]);
  });

  it('draws a sprint as a three-node route', () => {
    expect(plannedMarks(n('a'), [{ type: 'SPRINT', via: n('b'), to: n('c') }])).toEqual([
      { kind: 'route', slot: 0, nodes: ['a', 'b', 'c'] },
    ]);
  });

  it('places pre-movement operations (safehouse, ambush, decoy) from the start node', () => {
    const marks = plannedMarks(n('a'), [
      { type: 'MOVE', to: n('b') },
      { type: 'SAFEHOUSE', cardId: n('sh') },
    ]);
    expect(marks[1]).toEqual({ kind: 'safehouse', slot: 1, at: 'a' });
    const decoy = plannedMarks(n('a'), [
      { type: 'MOVE', to: n('b') },
      { type: 'DECOY', cardId: n('dc'), target: n('z') },
    ]);
    expect(decoy[1]).toEqual({ kind: 'decoy', slot: 1, from: 'a', target: 'z' });
  });

  it('skips empty slots without renumbering the filled ones', () => {
    const marks = plannedMarks(n('a'), [null, { type: 'HOLD' }]);
    expect(marks).toEqual([{ kind: 'hold', slot: 1, at: 'a' }]);
  });
});

describe('agentPlans', () => {
  const agents: AgentState[] = [
    { id: n('p:a1'), playerId: n('p'), nodeId: n('a'), dossiers: 0, alive: true, actionPenalty: 0 },
    { id: n('p:a2'), playerId: n('p'), nodeId: n('b'), dossiers: 0, alive: false, actionPenalty: 0 },
  ];
  const hold: Action = { type: 'HOLD' };

  it('prefers the room-acknowledged order over the draft, and marks it locked', () => {
    const plans = agentPlans(agents, { 'p:a1': [{ type: 'MOVE', to: n('x') }, null] }, { 'p:a1': [hold, hold] });
    expect(plans).toHaveLength(1);
    expect(plans[0]!.status).toBe('locked');
    expect(plans[0]!.marks.every((m) => m.kind === 'hold')).toBe(true);
  });

  it('keeps agent numbering stable and never plans for a burned agent', () => {
    const plans = agentPlans(agents, { 'p:a2': [hold, hold] }, {});
    expect(plans).toEqual([]);
    const first = agentPlans(agents, { 'p:a1': [hold, null] }, {});
    expect(first[0]!.agentIndex).toBe(0);
    expect(first[0]!.status).toBe('draft');
  });
});
