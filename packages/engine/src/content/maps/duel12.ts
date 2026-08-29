import { nodeId, type EdgeType, type MapDefinition, type MapNode, type NodeId, type Sector } from '@berlin/shared';

/**
 * Duel-12 — the solo and 1v1 map. 12 nodes, 3 U-Bahn stations, 2 checkpoints.
 *
 * Pure data. x/y are percentages so the SVG board renders any map without
 * code changes. Kurfürstendamm and Tiergarten are deliberate low-degree
 * corners: the map needs quiet dead ends for hiding to be a real strategy.
 */

interface RawNode {
  id: string;
  name: string;
  sector: Sector;
  x: number;
  y: number;
  uBahn?: boolean;
  extractionFor?: Sector;
  informant?: boolean;
}

const RAW_NODES: RawNode[] = [
  { id: 'kurfurstendamm', name: 'Kurfürstendamm', sector: 'BLUE', x: 10, y: 45 },
  { id: 'tiergarten', name: 'Tiergarten', sector: 'BLUE', x: 25, y: 28 },
  { id: 'tempelhof', name: 'Tempelhof', sector: 'BLUE', x: 22, y: 72, extractionFor: 'BLUE', informant: true },
  { id: 'kreuzberg', name: 'Kreuzberg', sector: 'GREEN', x: 38, y: 62, uBahn: true, informant: true },
  { id: 'bernauer', name: 'Bernauer Straße', sector: 'GREEN', x: 42, y: 18, uBahn: true },
  { id: 'gesundbrunnen', name: 'Gesundbrunnen', sector: 'GREEN', x: 58, y: 10, uBahn: true, extractionFor: 'GREEN', informant: true },
  { id: 'checkpoint_charlie', name: 'Checkpoint Charlie', sector: 'GOLD', x: 48, y: 48 },
  { id: 'friedrichstrasse', name: 'Friedrichstraße', sector: 'GOLD', x: 55, y: 33, informant: true },
  { id: 'glienicke_bridge', name: 'Glienicke Bridge', sector: 'GOLD', x: 30, y: 88, extractionFor: 'GOLD' },
  { id: 'alexanderplatz', name: 'Alexanderplatz', sector: 'RED', x: 68, y: 38, informant: true },
  { id: 'prenzlauer_berg', name: 'Prenzlauer Berg', sector: 'RED', x: 78, y: 18, informant: true },
  { id: 'karl_marx_allee', name: 'Karl-Marx-Allee', sector: 'RED', x: 80, y: 58, extractionFor: 'RED' },
];

/** [from, to, type] — declared once, expanded to both directions below. */
const RAW_EDGES: [string, string, EdgeType][] = [
  ['kurfurstendamm', 'tiergarten', 'STREET'],
  ['kurfurstendamm', 'tempelhof', 'STREET'],
  ['tiergarten', 'bernauer', 'STREET'],
  ['tempelhof', 'kreuzberg', 'STREET'],
  ['tempelhof', 'glienicke_bridge', 'STREET'],
  ['kreuzberg', 'checkpoint_charlie', 'STREET'],
  ['kreuzberg', 'glienicke_bridge', 'STREET'],
  ['bernauer', 'friedrichstrasse', 'STREET'],
  ['bernauer', 'gesundbrunnen', 'STREET'],
  ['gesundbrunnen', 'prenzlauer_berg', 'STREET'],
  ['friedrichstrasse', 'alexanderplatz', 'STREET'],
  ['friedrichstrasse', 'checkpoint_charlie', 'STREET'],
  ['alexanderplatz', 'prenzlauer_berg', 'STREET'],
  ['alexanderplatz', 'karl_marx_allee', 'STREET'],
  ['prenzlauer_berg', 'karl_marx_allee', 'STREET'],

  // The wall. Crossing costs Intel and always emits a public signal.
  ['checkpoint_charlie', 'alexanderplatz', 'CHECKPOINT'],
  ['glienicke_bridge', 'karl_marx_allee', 'CHECKPOINT'],

  // U-Bahn. Silent, and the only way to cross the map without chatter.
  ['kreuzberg', 'gesundbrunnen', 'TUNNEL'],
  ['kreuzberg', 'bernauer', 'TUNNEL'],
];

function build(): MapDefinition {
  const edgesByNode = new Map<string, { to: NodeId; type: EdgeType }[]>();
  for (const n of RAW_NODES) edgesByNode.set(n.id, []);

  for (const [a, b, type] of RAW_EDGES) {
    edgesByNode.get(a)!.push({ to: nodeId(b), type });
    edgesByNode.get(b)!.push({ to: nodeId(a), type });
  }

  const nodes: MapNode[] = RAW_NODES.map((n) => ({
    id: nodeId(n.id),
    name: n.name,
    sector: n.sector,
    x: n.x,
    y: n.y,
    edges: edgesByNode.get(n.id)!,
    isUBahnStation: n.uBahn ?? false,
    extractionFor: n.extractionFor ?? null,
    hasInformant: n.informant ?? false,
  }));

  return { id: 'duel-12', name: 'Berlin — Duel', nodes };
}

export const DUEL_12: MapDefinition = build();
