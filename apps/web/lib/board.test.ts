import { describe, expect, it } from 'vitest';
import { nodeId, type MapDefinition, type MapNode } from '@berlin/shared';
import { DUEL_12 } from '@berlin/engine';
import { HIT_TARGET_PX, adjacentTo, edgePath, projectNode, traversalOrder } from './board.js';

/**
 * Board maths, proven twice: against a synthetic map (so nothing here
 * secretly assumes twelve nodes) and against the real DUEL_12 edge list
 * (so a map edit that silently drops an edge fails a test). Per this plan's
 * <testing_note>, this file covers apps/web/lib/board.ts's pure geometry
 * only — MapNode/MapEdge/TargetOverlay's *rendered* markers and stroke
 * treatments are proven in apps/web/e2e/match.spec.ts, since this phase
 * ships no React component-testing stack.
 */

function makeNode(
  id: string,
  x: number,
  y: number,
  edges: { to: string; type: 'STREET' | 'TUNNEL' | 'CHECKPOINT' }[] = [],
): MapNode {
  return {
    id: nodeId(id),
    name: id,
    sector: 'BLUE',
    x,
    y,
    edges: edges.map((e) => ({ to: nodeId(e.to), type: e.type })),
    isUBahnStation: false,
    extractionFor: null,
    hasInformant: false,
  };
}

// Nothing in board.ts should assume there are twelve nodes — MATCH-01's
// map-size-independence edge (planner_assumptions).
const SYNTHETIC_MAP: MapDefinition = {
  id: 'synthetic-line',
  name: 'Synthetic Line',
  nodes: [
    makeNode('a', 0, 50, [{ to: 'b', type: 'STREET' }]),
    makeNode('b', 50, 50, [
      { to: 'a', type: 'STREET' },
      { to: 'c', type: 'TUNNEL' },
    ]),
    makeNode('c', 100, 50, [{ to: 'b', type: 'TUNNEL' }]),
  ],
};

// One neighbour per compass direction, so traversalOrder's four calls can be
// asserted to collectively reach every neighbour without repeating one.
const CROSS_MAP: MapDefinition = {
  id: 'synthetic-cross',
  name: 'Synthetic Cross',
  nodes: [
    makeNode('center', 50, 50, [
      { to: 'north', type: 'STREET' },
      { to: 'south', type: 'STREET' },
      { to: 'east', type: 'STREET' },
      { to: 'west', type: 'STREET' },
    ]),
    makeNode('north', 50, 0, [{ to: 'center', type: 'STREET' }]),
    makeNode('south', 50, 100, [{ to: 'center', type: 'STREET' }]),
    makeNode('east', 100, 50, [{ to: 'center', type: 'STREET' }]),
    makeNode('west', 0, 50, [{ to: 'center', type: 'STREET' }]),
  ],
};

describe('projectNode', () => {
  it('maps 0,0 to the viewBox origin and 100,100 to the opposite corner, uncapped', () => {
    const origin = makeNode('origin', 0, 0);
    const corner = makeNode('corner', 100, 100);
    expect(projectNode(origin)).toEqual({ cx: 0, cy: 0 });
    expect(projectNode(corner)).toEqual({ cx: 100, cy: 100 });
  });

  it('is a pure function of the node alone — same node, same coordinates', () => {
    const node = DUEL_12.nodes[0]!;
    expect(projectNode(node)).toEqual(projectNode(node));
    expect(projectNode(node)).toEqual({ cx: node.x, cy: node.y });
  });
});

describe('edgePath', () => {
  it('describes the identical segment for A→B and B→A', () => {
    const [a, b] = SYNTHETIC_MAP.nodes;
    expect(edgePath(a!, b!)).toBe(edgePath(b!, a!));
  });

  it('does not depend on which endpoint is passed first, on the real map either', () => {
    const kurfurstendamm = DUEL_12.nodes.find((n) => n.id === nodeId('kurfurstendamm'))!;
    const tiergarten = DUEL_12.nodes.find((n) => n.id === nodeId('tiergarten'))!;
    expect(edgePath(kurfurstendamm, tiergarten)).toBe(edgePath(tiergarten, kurfurstendamm));
  });
});

describe('board maths on a synthetic three-node map', () => {
  it('projects and connects correctly through the same functions used for duel-12', () => {
    const [a, b, c] = SYNTHETIC_MAP.nodes;
    expect(projectNode(a!)).toEqual({ cx: 0, cy: 50 });
    expect(projectNode(b!)).toEqual({ cx: 50, cy: 50 });
    expect(projectNode(c!)).toEqual({ cx: 100, cy: 50 });

    expect(adjacentTo(SYNTHETIC_MAP, a!.id)).toEqual([b!.id]);
    expect([...adjacentTo(SYNTHETIC_MAP, b!.id)].sort()).toEqual([a!.id, c!.id].sort());
    expect(adjacentTo(SYNTHETIC_MAP, c!.id)).toEqual([b!.id]);
  });
});

describe('adjacentTo against the real DUEL_12 edge list', () => {
  it('returns exact neighbour ids for a street node, a tunnel node, and a checkpoint node', () => {
    // kurfurstendamm: pure street node (both its edges are STREET).
    expect([...adjacentTo(DUEL_12, nodeId('kurfurstendamm'))].sort()).toEqual(
      [nodeId('tiergarten'), nodeId('tempelhof')].sort(),
    );

    // kreuzberg: has two TUNNEL edges among its neighbours.
    const kreuzbergNeighbours = adjacentTo(DUEL_12, nodeId('kreuzberg'));
    expect(kreuzbergNeighbours).toContain(nodeId('gesundbrunnen'));
    expect(kreuzbergNeighbours).toContain(nodeId('bernauer'));

    // checkpoint_charlie: has a CHECKPOINT edge to alexanderplatz.
    expect(adjacentTo(DUEL_12, nodeId('checkpoint_charlie'))).toContain(nodeId('alexanderplatz'));
  });

  it('never returns a node two hops away', () => {
    // kurfurstendamm -> tempelhof -> kreuzberg is two hops; kreuzberg is not
    // a direct neighbour of kurfurstendamm.
    const neighbours = adjacentTo(DUEL_12, nodeId('kurfurstendamm'));
    expect(neighbours).not.toContain(nodeId('kreuzberg'));
  });
});

describe('traversalOrder', () => {
  it('returns null rather than wrapping or throwing when there is no neighbour in that direction', () => {
    const [a] = SYNTHETIC_MAP.nodes;
    expect(traversalOrder(SYNTHETIC_MAP, a!.id, 'up')).toBeNull();
    expect(traversalOrder(SYNTHETIC_MAP, a!.id, 'left')).toBeNull();
  });

  it("visits every one of a node's neighbours across the four directions without repeating one", () => {
    const seen = new Set<string>();
    for (const direction of ['up', 'down', 'left', 'right'] as const) {
      const next = traversalOrder(CROSS_MAP, nodeId('center'), direction);
      expect(next).not.toBeNull();
      expect(seen.has(next as string)).toBe(false);
      seen.add(next as string);
    }
    expect(seen).toEqual(new Set(['north', 'south', 'east', 'west']));
  });
});

describe('HIT_TARGET_PX', () => {
  it('is 44 and independent of any rendered radius', () => {
    expect(HIT_TARGET_PX).toBe(44);
  });
});
