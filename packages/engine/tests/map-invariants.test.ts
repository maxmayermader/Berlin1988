import { describe, expect, it } from 'vitest';
import { MAPS } from '../src/index.js';
import { mapIdForPlayerCount, SECTORS, type MapDefinition, type NodeId } from '@berlin/shared';

/**
 * Structural invariants every map must hold, checked against the whole MAPS
 * registry rather than a hand-listed set — a new map file added without a
 * thought for these properties fails here rather than in a playtest.
 *
 * These are the properties a map can get wrong while still being
 * well-formed enough for buildMap() to accept it. buildMap throws on the
 * genuinely malformed cases (unknown node in an edge, duplicate id), so
 * nothing here re-checks those.
 */

const ALL = Object.entries(MAPS);

/**
 * docs/GAME_DESIGN.md §3.1's table, as the assertion it implies. Node and
 * station counts are exact requirements. Average degree is marked 🔧 in the
 * doc — a tuning target — and `targetDegree` is null for a map that
 * knowingly diverges from it.
 *
 * duel-12 is that case: it ships at 3.17, not §3.1's 2.8. That divergence
 * predates this suite, and it is deliberately NOT corrected here — duel-12's
 * topology is what every golden replay fixture and the whole of
 * packages/ai/tests/validation.test.ts's balance data was produced against,
 * so re-wiring it to hit the documented figure would churn every golden and
 * invalidate the personality win-rate numbers in docs/AI_OPPONENTS.md §7.
 * Either the map or the doc should move; that is a balance decision, not a
 * test fix, so this records the real value rather than asserting a target
 * the shipped map has never met.
 */
const SPEC: Record<string, { nodes: number; stations: number; targetDegree: number | null }> = {
  'duel-12': { nodes: 12, stations: 3, targetDegree: null },
  'ffa-16': { nodes: 16, stations: 4, targetDegree: 3.0 },
  'ffa-18': { nodes: 18, stations: 5, targetDegree: 3.2 },
};

/** How far a map may sit from its §3.1 target and still count as hitting it. */
const DEGREE_TOLERANCE = 0.1;

/** The band every map must sit inside regardless of its §3.1 target. Below
 *  this the board is a corridor with no route choices; above it, adjacency
 *  chatter fires constantly and hiding stops working. */
const DEGREE_BAND = { min: 2.5, max: 3.6 };

/** No single node may be this connected — a hub with too many exits is
 *  untrackable, which breaks the deduction the whole game rests on. */
const MAX_NODE_DEGREE = 5;

function degreeOf(map: MapDefinition, id: NodeId): number {
  return map.nodes.find((n) => n.id === id)!.edges.length;
}

function averageDegree(map: MapDefinition): number {
  const total = map.nodes.reduce((sum, n) => sum + n.edges.length, 0);
  return total / map.nodes.length;
}

/** Every node reachable from `map.nodes[0]` over edges of the given types. */
function reachable(map: MapDefinition, types: readonly string[]): Set<string> {
  const seen = new Set<string>([map.nodes[0]!.id as string]);
  const queue: NodeId[] = [map.nodes[0]!.id];
  while (queue.length > 0) {
    const current = queue.shift()!;
    const node = map.nodes.find((n) => n.id === current)!;
    for (const edge of node.edges) {
      if (!types.includes(edge.type)) continue;
      if (seen.has(edge.to as string)) continue;
      seen.add(edge.to as string);
      queue.push(edge.to);
    }
  }
  return seen;
}

describe('map invariants (every map in the MAPS registry)', () => {
  it('registers each map under its own id', () => {
    for (const [key, map] of ALL) expect(map.id).toBe(key);
  });

  it.each(ALL)('%s — matches the GAME_DESIGN §3.1 node and station counts', (key, map) => {
    const spec = SPEC[key];
    expect(spec, `${key} has no §3.1 spec entry — add one`).toBeDefined();
    expect(map.nodes).toHaveLength(spec!.nodes);
    expect(map.nodes.filter((n) => n.isUBahnStation)).toHaveLength(spec!.stations);
  });

  it.each(ALL)('%s — average degree sits in the playable band', (_key, map) => {
    const avg = averageDegree(map);
    expect(avg).toBeGreaterThanOrEqual(DEGREE_BAND.min);
    expect(avg).toBeLessThanOrEqual(DEGREE_BAND.max);
  });

  it.each(ALL)('%s — average degree matches its §3.1 target where it has one', (key, map) => {
    const target = SPEC[key]!.targetDegree;
    if (target === null) return;
    expect(Math.abs(averageDegree(map) - target)).toBeLessThanOrEqual(DEGREE_TOLERANCE);
  });

  it.each(ALL)('%s — no node is a runaway hub', (_key, map) => {
    for (const node of map.nodes) {
      expect(node.edges.length, `${node.id} has too many exits`).toBeLessThanOrEqual(
        MAX_NODE_DEGREE,
      );
    }
  });

  it.each(ALL)('%s — every edge is mirrored back with the same type', (_key, map) => {
    for (const node of map.nodes) {
      for (const edge of node.edges) {
        const other = map.nodes.find((n) => n.id === edge.to);
        expect(other, `${node.id} points at missing node ${edge.to}`).toBeDefined();
        const back = other!.edges.filter((e) => e.to === node.id && e.type === edge.type);
        expect(back.length, `${edge.to} -> ${node.id} (${edge.type}) missing`).toBe(1);
      }
    }
  });

  it.each(ALL)('%s — no node has a self-edge or a duplicate neighbour', (_key, map) => {
    for (const node of map.nodes) {
      const targets = node.edges.map((e) => e.to as string);
      expect(targets).not.toContain(node.id as string);
      expect(new Set(targets).size, `${node.id} has a duplicate neighbour`).toBe(targets.length);
    }
  });

  it.each(ALL)('%s — no node is stranded', (_key, map) => {
    for (const node of map.nodes) expect(degreeOf(map, node.id)).toBeGreaterThan(0);
  });

  it.each(ALL)('%s — the whole map is connected without using tunnels', (_key, map) => {
    // Tunnels cost Intel. If a node were reachable only by tunnel, a player
    // starting the match with no Intel could be locked out of part of the
    // board entirely — so street/checkpoint connectivity is the real
    // requirement, and tunnel connectivity is a bonus on top.
    expect(reachable(map, ['STREET', 'CHECKPOINT']).size).toBe(map.nodes.length);
  });

  it.each(ALL)('%s — every sector has exactly one extraction point', (_key, map) => {
    for (const sector of SECTORS) {
      const points = map.nodes.filter((n) => n.extractionFor === sector);
      expect(points, `${sector} needs exactly one extraction point`).toHaveLength(1);
    }
  });

  it.each(ALL)('%s — every sector is represented by at least two nodes', (_key, map) => {
    for (const sector of SECTORS) {
      expect(map.nodes.filter((n) => n.sector === sector).length).toBeGreaterThanOrEqual(2);
    }
  });

  it.each(ALL)('%s — at least a third of nodes carry an informant', (_key, map) => {
    // Informants are the map's Intel supply. duel-12 ships at 50%; well
    // under a third would starve the economy that funds Sprints, tunnels and
    // checkpoint crossings. Deliberately a floor, not a range: putting an
    // informant on an extraction point is duel-12's own shipped pattern
    // (Tempelhof, Gesundbrunnen) and is a balance choice, not a defect.
    const withInformant = map.nodes.filter((n) => n.hasInformant).length;
    expect(withInformant / map.nodes.length).toBeGreaterThanOrEqual(1 / 3);
  });

  it.each(ALL)('%s — every tunnel edge joins two U-Bahn stations', (_key, map) => {
    for (const node of map.nodes) {
      for (const edge of node.edges) {
        if (edge.type !== 'TUNNEL') continue;
        const other = map.nodes.find((n) => n.id === edge.to)!;
        expect(node.isUBahnStation, `${node.id} has a tunnel but is not a station`).toBe(true);
        expect(other.isUBahnStation, `${other.id} has a tunnel but is not a station`).toBe(true);
      }
    }
  });

  it.each(ALL)('%s — every U-Bahn station is on the tunnel network', (_key, map) => {
    const stations = map.nodes.filter((n) => n.isUBahnStation);
    for (const station of stations) {
      expect(
        station.edges.some((e) => e.type === 'TUNNEL'),
        `${station.id} is a station with no tunnel`,
      ).toBe(true);
    }
  });

  it.each(ALL)('%s — every checkpoint edge actually crosses into RED', (_key, map) => {
    // "Crosses between RED and BLUE territory" (§3.1) — the rule that matters
    // is that exactly one end is in the East, so a crossing always means the
    // wall was crossed and the public Border Crossing signal is honest.
    for (const node of map.nodes) {
      for (const edge of node.edges) {
        if (edge.type !== 'CHECKPOINT') continue;
        const other = map.nodes.find((n) => n.id === edge.to)!;
        const redEnds = [node, other].filter((n) => n.sector === 'RED').length;
        expect(redEnds, `${node.id} <-> ${other.id} is not an East/West crossing`).toBe(1);
      }
    }
  });

  it.each(ALL)('%s — x/y are layout percentages', (_key, map) => {
    for (const node of map.nodes) {
      expect(node.x).toBeGreaterThanOrEqual(0);
      expect(node.x).toBeLessThanOrEqual(100);
      expect(node.y).toBeGreaterThanOrEqual(0);
      expect(node.y).toBeLessThanOrEqual(100);
    }
  });

  it.each(ALL)('%s — no two nodes sit on the same point', (_key, map) => {
    const points = map.nodes.map((n) => `${n.x},${n.y}`);
    expect(new Set(points).size).toBe(points.length);
  });
});

describe('mapIdForPlayerCount (MAP-03)', () => {
  it('selects duel-12 for 1 and 2 players, ffa-16 for 3, ffa-18 for 4', () => {
    expect(mapIdForPlayerCount(1)).toBe('duel-12');
    expect(mapIdForPlayerCount(2)).toBe('duel-12');
    expect(mapIdForPlayerCount(3)).toBe('ffa-16');
    expect(mapIdForPlayerCount(4)).toBe('ffa-18');
  });

  it('only ever names a map the registry actually holds', () => {
    for (let count = 1; count <= 4; count++) {
      expect(MAPS[mapIdForPlayerCount(count)]).toBeDefined();
    }
  });

  it('gives every seated player their own faction extraction point', () => {
    // createMatch spawns each seat at extractionPointFor(faction), and
    // factions are SECTORS.slice(0, count) — so the map chosen for a given
    // seat count must carry an extraction point for each of those factions.
    for (let count = 1; count <= 4; count++) {
      const map = MAPS[mapIdForPlayerCount(count)]!;
      for (const sector of SECTORS.slice(0, count)) {
        expect(
          map.nodes.some((n) => n.extractionFor === sector),
          `${map.id} has no ${sector} spawn for a ${count}-player match`,
        ).toBe(true);
      }
    }
  });
});
