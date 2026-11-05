import type { BurnEntry, PlayerView, Sector } from '@berlin/shared';
import type { CommittedCount } from './matchStore.js';

/**
 * BURN-01..05: one row per player — who is still in the game, how many of
 * their agents are standing, and their public Burn Track.
 *
 * Fog (PITFALLS.md 2, "death by inference"): an opponent row carries COUNTS
 * only — `agentsAlive` / `agentsTotal` from `OpponentPublicInfo` — never
 * which of their agents burned, because no field the viewer holds says so.
 * Only the viewer's own row lists agents individually, from `view.self`.
 */
export interface RosterAgent {
  /** "1" / "2" — the viewer's own agents only. */
  readonly label: string;
  readonly alive: boolean;
}

export interface RosterRow {
  readonly id: string;
  readonly name: string;
  readonly faction: Sector;
  readonly isSelf: boolean;
  readonly isBot: boolean;
  readonly agentsAlive: number;
  readonly agentsTotal: number;
  /** Present for the viewer's own row only. */
  readonly ownAgents: readonly RosterAgent[] | null;
  readonly intel: number;
  readonly score: number;
  readonly eliminated: boolean;
  readonly lockedIn: boolean;
  /** Every player's track is public and identically redacted (§6.3). */
  readonly burnTrack: readonly BurnEntry[];
}

function isLockedIn(c: CommittedCount | undefined): boolean {
  return c !== undefined && c.total > 0 && c.committed >= c.total;
}

export function rosterRows(view: PlayerView, committed: Readonly<Record<string, CommittedCount>>): RosterRow[] {
  const self = view.self;
  const selfAlive = self.agents.filter((a) => a.alive).length;
  const rows: RosterRow[] = [
    {
      id: self.id as string,
      name: self.name,
      faction: self.faction,
      isSelf: true,
      isBot: false,
      agentsAlive: selfAlive,
      agentsTotal: self.agents.length,
      ownAgents: self.agents.map((a, i) => ({ label: String(i + 1), alive: a.alive })),
      intel: self.intel,
      score: self.score,
      eliminated: self.eliminated,
      lockedIn: isLockedIn(committed[self.id as string]),
      burnTrack: view.burnTracks[self.id as string] ?? [],
    },
  ];
  for (const o of view.opponents) {
    rows.push({
      id: o.id as string,
      name: o.name,
      faction: o.faction,
      isSelf: false,
      isBot: o.isBot,
      agentsAlive: o.agentsAlive,
      agentsTotal: o.agentsTotal,
      ownAgents: null,
      intel: o.intel,
      score: o.score,
      eliminated: o.eliminated,
      lockedIn: isLockedIn(committed[o.id as string]),
      burnTrack: view.burnTracks[o.id as string] ?? [],
    });
  }
  return rows;
}

/**
 * BURN-02: the agents this player lost in the round just resolved, read
 * from the viewer's own fog-filtered log. A burn of one of the viewer's own
 * agents keeps its agent id through fog (`filterEvents()`), so this can
 * name which agent; for everyone else it can only ever count.
 */
export interface OwnBurn {
  readonly agentId: string | null;
  readonly cause: string;
  readonly nodeId: string;
}

export function ownBurnsIn(log: PlayerView['lastRound'], selfId: string): OwnBurn[] {
  return log.flatMap((e): OwnBurn[] => {
    if (e.type === 'AGENT_BURNED' && (e.playerId as string) === selfId) {
      return [{ agentId: e.agentId as string | null, cause: e.cause, nodeId: e.nodeId as string }];
    }
    if (e.type === 'BLOCKADE_CAUGHT' && !e.survived && (e.playerId as string) === selfId) {
      return [{ agentId: e.agentId as string, cause: 'BLOCKADE', nodeId: e.nodeId as string }];
    }
    return [];
  });
}
