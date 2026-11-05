import { describe, expect, it } from 'vitest';
import { projectView, quickSettings } from '@berlin/engine';
import type { PlayerId, ResolutionEvent } from '@berlin/shared';
import { beatFor, ownAgentsAt } from './replay.js';
import { playRounds } from './testing/playedMatch.js';

/**
 * REPLAY-03 / SPECT-03: the replay may only ever show what the viewer's fog
 * already delivered. Written against real, engine-resolved, fog-filtered
 * logs — not hand-built fixtures — so a future event shape is covered
 * automatically.
 */

function nodesNamedBy(event: ResolutionEvent): Set<string> {
  // Every string value anywhere in the event, which is a superset of the
  // node ids it names.
  const out = new Set<string>();
  const walk = (v: unknown) => {
    if (typeof v === 'string') out.add(v);
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object') Object.values(v).forEach(walk);
  };
  walk(event);
  return out;
}

const fourPlayer = quickSettings({
  seats: [
    { id: 'p1' as PlayerId, name: 'A', faction: 'BLUE', kind: 'HUMAN', team: null },
    { id: 'p2' as PlayerId, name: 'B', faction: 'RED', kind: 'HUMAN', team: null },
    { id: 'p3' as PlayerId, name: 'C', faction: 'GOLD', kind: 'HUMAN', team: null },
    { id: 'p4' as PlayerId, name: 'D', faction: 'GREEN', kind: 'HUMAN', team: null },
  ],
  mapId: 'ffa-18',
});

describe('beatFor — a beat only points at nodes its own event names', () => {
  it.each(['replay-a', 'replay-b', 'replay-c'])('holds for every event of a played 4-player match (%s)', (seed) => {
    for (const state of playRounds(seed, 14, fourPlayer)) {
      for (const pid of state.playerOrder) {
        const view = projectView(state, pid);
        for (const event of view.lastRound) {
          const named = nodesNamedBy(event);
          const beat = beatFor(event);
          for (const n of beat.nodes) expect(named.has(n as string)).toBe(true);
          if (beat.arrow) {
            expect(named.has(beat.arrow.from as string)).toBe(true);
            expect(named.has(beat.arrow.to as string)).toBe(true);
          }
        }
      }
    }
  });
});

describe('ownAgentsAt — traces the viewer\'s own agents and nothing else', () => {
  it('only ever returns agents from view.self.agents, at every reveal step', () => {
    for (const state of playRounds('trace-own', 10, fourPlayer)) {
      for (const pid of state.playerOrder) {
        const view = projectView(state, pid);
        const ownIds = new Set(view.self.agents.map((a) => a.id as string));
        for (let revealed = 0; revealed <= view.lastRound.length; revealed++) {
          for (const r of ownAgentsAt(view.self.agents, view.lastRound, revealed)) {
            expect(ownIds.has(r.agent.id as string)).toBe(true);
          }
        }
      }
    }
  });

  it('starts each moving agent at its pre-move node and ends at its real post-round node', () => {
    let checkedAMove = false;
    for (const state of playRounds('trace-moves', 8)) {
      for (const pid of state.playerOrder) {
        const view = projectView(state, pid);
        const atStart = ownAgentsAt(view.self.agents, view.lastRound, 1);
        const atEnd = ownAgentsAt(view.self.agents, view.lastRound, view.lastRound.length);
        for (const end of atEnd) {
          if (end.alive) expect(end.nodeId).toBe(end.agent.nodeId);
        }
        for (const start of atStart) {
          const firstMove = view.lastRound.find(
            (e) => e.type === 'AGENT_MOVED' && e.agentId === start.agent.id,
          );
          if (firstMove?.type === 'AGENT_MOVED') {
            expect(start.nodeId).toBe(firstMove.from);
            checkedAMove = true;
          }
        }
      }
    }
    expect(checkedAMove).toBe(true);
  });

  it('drops an agent burned in an earlier round, keeps one burned this round until its beat', () => {
    const synthetic = [
      { id: 'me:a1', playerId: 'me', nodeId: 'x', dossiers: 0, alive: false, actionPenalty: 0 },
      { id: 'me:a2', playerId: 'me', nodeId: 'y', dossiers: 0, alive: false, actionPenalty: 0 },
    ] as never[];
    const log: ResolutionEvent[] = [
      { type: 'ROUND_START', round: 3 },
      {
        type: 'AGENT_BURNED',
        playerId: 'me' as never,
        agentId: 'me:a2' as never,
        nodeId: 'y' as never,
        byPlayerId: null,
        cause: 'STRIKE',
        dossiersDropped: 0,
      },
    ];
    const before = ownAgentsAt(synthetic, log, 1);
    expect(before.map((r) => r.agent.id)).toEqual(['me:a2']);
    expect(before[0]!.alive).toBe(true);
    const after = ownAgentsAt(synthetic, log, 2);
    expect(after[0]!.alive).toBe(false);
  });
});
