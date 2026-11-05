import { describe, expect, it } from 'vitest';
import { projectView } from '@berlin/engine';
import type { ResolutionEvent } from '@berlin/shared';
import { ownBurnsIn, rosterRows } from './roster.js';
import { playRounds } from './testing/playedMatch.js';

describe('rosterRows (BURN-01/03/05)', () => {
  it('lists the viewer first, then every opponent, each with their own public burn track', () => {
    const [state] = playRounds('roster-a', 3).slice(-1);
    const view = projectView(state!, state!.playerOrder[0]!);
    const rows = rosterRows(view, {});
    expect(rows[0]!.isSelf).toBe(true);
    expect(rows.map((r) => r.id)).toEqual([view.self.id, ...view.opponents.map((o) => o.id)]);
    for (const row of rows) expect(row.burnTrack).toBe(view.burnTracks[row.id] ?? row.burnTrack);
  });

  it('gives opponents counts only — never an individual agent list', () => {
    for (const state of playRounds('roster-b', 12)) {
      const view = projectView(state, state.playerOrder[1]!);
      for (const row of rosterRows(view, {})) {
        if (row.isSelf) {
          expect(row.ownAgents).toHaveLength(view.self.agents.length);
        } else {
          expect(row.ownAgents).toBeNull();
          const o = view.opponents.find((p) => p.id === row.id)!;
          expect(row.agentsAlive).toBe(o.agentsAlive);
          expect(row.agentsTotal).toBe(o.agentsTotal);
        }
      }
    }
  });

  it('marks a seat locked in only when every one of its agents has committed', () => {
    const [state] = playRounds('roster-c', 1);
    const view = projectView(state!, state!.playerOrder[0]!);
    const half = rosterRows(view, { [view.self.id]: { committed: 1, total: 2 } });
    const full = rosterRows(view, { [view.self.id]: { committed: 2, total: 2 } });
    expect(half[0]!.lockedIn).toBe(false);
    expect(full[0]!.lockedIn).toBe(true);
  });
});

describe('ownBurnsIn (BURN-02)', () => {
  it('reports only the viewer\'s own losses, including blockade deaths', () => {
    const log: ResolutionEvent[] = [
      { type: 'ROUND_START', round: 8 },
      { type: 'AGENT_BURNED', playerId: 'me' as never, agentId: 'me:a1' as never, nodeId: 'n1' as never, byPlayerId: null, cause: 'STRIKE', dossiersDropped: 0 },
      { type: 'AGENT_BURNED', playerId: 'them' as never, agentId: null, nodeId: 'n2' as never, byPlayerId: null, cause: 'AMBUSH', dossiersDropped: 0 },
      { type: 'BLOCKADE_CAUGHT', playerId: 'me' as never, agentId: 'me:a2' as never, nodeId: 'n3' as never, survived: false, relocatedTo: null },
      { type: 'BLOCKADE_CAUGHT', playerId: 'me' as never, agentId: 'me:a2' as never, nodeId: 'n3' as never, survived: true, relocatedTo: 'n4' as never },
    ];
    expect(ownBurnsIn(log, 'me')).toEqual([
      { agentId: 'me:a1', cause: 'STRIKE', nodeId: 'n1' },
      { agentId: 'me:a2', cause: 'BLOCKADE', nodeId: 'n3' },
    ]);
  });
});
