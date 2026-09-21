import type { MapDefinition } from '@berlin/shared';
import { buildMap, type RawEdge, type RawNode } from './buildMap.js';

/**
 * FFA-18 — the 4-player and 2v2 map. 18 nodes, 29 edges (avg degree 3.22),
 * 5 U-Bahn stations, built to docs/GAME_DESIGN.md §3.1.
 *
 * With four networks on the board every sector owns a corner and GREEN owns
 * the middle. Kreuzberg is the one node here reachable by exactly one street
 * (Tempelhof) and three tunnels — deliberately: on a map this crowded the
 * U-Bahn has to be a genuinely different kind of route rather than a faster
 * street, and a node the tunnel network reaches easily and the street network
 * barely reaches at all is what makes GREEN's loadout mean something.
 */

const RAW_NODES: RawNode[] = [
  // BLUE — West Berlin.
  { id: 'kurfurstendamm', name: 'Kurfürstendamm', sector: 'BLUE', x: 8, y: 42 },
  { id: 'tiergarten', name: 'Tiergarten', sector: 'BLUE', x: 22, y: 26 },
  { id: 'schoneberg', name: 'Schöneberg', sector: 'BLUE', x: 12, y: 58, informant: true },
  { id: 'tempelhof', name: 'Tempelhof', sector: 'BLUE', x: 18, y: 74, extractionFor: 'BLUE', informant: true },
  { id: 'wedding', name: 'Wedding', sector: 'BLUE', x: 30, y: 12 },

  // GREEN — the U-Bahn.
  { id: 'bernauer', name: 'Bernauer Straße', sector: 'GREEN', x: 40, y: 16, uBahn: true },
  { id: 'gesundbrunnen', name: 'Gesundbrunnen', sector: 'GREEN', x: 52, y: 6, uBahn: true, extractionFor: 'GREEN', informant: true },
  { id: 'kreuzberg', name: 'Kreuzberg', sector: 'GREEN', x: 34, y: 58, uBahn: true, informant: true },
  { id: 'kottbusser_tor', name: 'Kottbusser Tor', sector: 'GREEN', x: 44, y: 68, uBahn: true, informant: true },
  { id: 'hermannplatz', name: 'Hermannplatz', sector: 'GREEN', x: 38, y: 84, uBahn: true },

  // GOLD — the corridor.
  { id: 'potsdamer_platz', name: 'Potsdamer Platz', sector: 'GOLD', x: 42, y: 38 },
  { id: 'friedrichstrasse', name: 'Friedrichstraße', sector: 'GOLD', x: 54, y: 28, informant: true },
  { id: 'checkpoint_charlie', name: 'Checkpoint Charlie', sector: 'GOLD', x: 52, y: 48 },
  { id: 'glienicke_bridge', name: 'Glienicke Bridge', sector: 'GOLD', x: 22, y: 92, extractionFor: 'GOLD' },

  // RED — East Berlin.
  { id: 'alexanderplatz', name: 'Alexanderplatz', sector: 'RED', x: 66, y: 38, informant: true },
  { id: 'prenzlauer_berg', name: 'Prenzlauer Berg', sector: 'RED', x: 76, y: 18, informant: true },
  { id: 'karl_marx_allee', name: 'Karl-Marx-Allee', sector: 'RED', x: 82, y: 52, extractionFor: 'RED' },
  { id: 'friedrichshain', name: 'Friedrichshain', sector: 'RED', x: 70, y: 70, informant: true },
];

const RAW_EDGES: RawEdge[] = [
  // West.
  ['kurfurstendamm', 'tiergarten', 'STREET'],
  ['kurfurstendamm', 'schoneberg', 'STREET'],
  ['tiergarten', 'wedding', 'STREET'],
  ['tiergarten', 'potsdamer_platz', 'STREET'],
  ['schoneberg', 'tempelhof', 'STREET'],
  ['schoneberg', 'potsdamer_platz', 'STREET'],
  ['tempelhof', 'glienicke_bridge', 'STREET'],
  ['tempelhof', 'kreuzberg', 'STREET'],

  // North.
  ['wedding', 'bernauer', 'STREET'],
  ['wedding', 'gesundbrunnen', 'STREET'],
  ['bernauer', 'friedrichstrasse', 'STREET'],
  ['gesundbrunnen', 'prenzlauer_berg', 'STREET'],

  // South.
  ['kottbusser_tor', 'hermannplatz', 'STREET'],
  ['hermannplatz', 'glienicke_bridge', 'STREET'],

  // The corridor.
  ['potsdamer_platz', 'friedrichstrasse', 'STREET'],
  ['potsdamer_platz', 'checkpoint_charlie', 'STREET'],
  ['friedrichstrasse', 'checkpoint_charlie', 'STREET'],
  ['friedrichstrasse', 'alexanderplatz', 'STREET'],

  // East.
  ['alexanderplatz', 'prenzlauer_berg', 'STREET'],
  ['alexanderplatz', 'karl_marx_allee', 'STREET'],
  ['prenzlauer_berg', 'karl_marx_allee', 'STREET'],
  ['karl_marx_allee', 'friedrichshain', 'STREET'],

  // The wall. Crossing costs Intel and always emits a public signal.
  ['checkpoint_charlie', 'alexanderplatz', 'CHECKPOINT'],
  ['kottbusser_tor', 'friedrichshain', 'CHECKPOINT'],
  ['hermannplatz', 'friedrichshain', 'CHECKPOINT'],

  // U-Bahn. Silent, and the only way to cross the map without chatter.
  ['kreuzberg', 'gesundbrunnen', 'TUNNEL'],
  ['kreuzberg', 'kottbusser_tor', 'TUNNEL'],
  ['kreuzberg', 'hermannplatz', 'TUNNEL'],
  ['gesundbrunnen', 'bernauer', 'TUNNEL'],
];

export const FFA_18: MapDefinition = buildMap('ffa-18', 'Berlin — Four Networks', RAW_NODES, RAW_EDGES);
