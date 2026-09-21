import type { MapDefinition } from '@berlin/shared';
import { buildMap, type RawEdge, type RawNode } from './buildMap.js';

/**
 * FFA-16 — the 3-player map. 16 nodes, 24 edges (avg degree 3.0), 4 U-Bahn
 * stations, built to docs/GAME_DESIGN.md §3.1.
 *
 * Three players means three home corners that must not be adjacent, so the
 * sectors are pushed to the edges of the layout — BLUE west, RED east, GOLD
 * down the middle and south — with GREEN's stations threaded between them as
 * the only quiet way across. Kurfürstendamm, Schöneberg, Glienicke Bridge and
 * Friedrichshain are deliberate degree-2 corners: with a third hunter on the
 * board, hiding needs more dead ends than the duel map has, not fewer.
 */

const RAW_NODES: RawNode[] = [
  // BLUE — West Berlin.
  { id: 'kurfurstendamm', name: 'Kurfürstendamm', sector: 'BLUE', x: 10, y: 40 },
  { id: 'schoneberg', name: 'Schöneberg', sector: 'BLUE', x: 12, y: 56, informant: true },
  { id: 'tiergarten', name: 'Tiergarten', sector: 'BLUE', x: 24, y: 25 },
  { id: 'tempelhof', name: 'Tempelhof', sector: 'BLUE', x: 18, y: 70, extractionFor: 'BLUE', informant: true },

  // GREEN — the U-Bahn.
  { id: 'bernauer', name: 'Bernauer Straße', sector: 'GREEN', x: 40, y: 14, uBahn: true },
  { id: 'gesundbrunnen', name: 'Gesundbrunnen', sector: 'GREEN', x: 56, y: 8, uBahn: true, extractionFor: 'GREEN', informant: true },
  { id: 'kreuzberg', name: 'Kreuzberg', sector: 'GREEN', x: 36, y: 60, uBahn: true, informant: true },
  { id: 'hermannplatz', name: 'Hermannplatz', sector: 'GREEN', x: 44, y: 78, uBahn: true },

  // GOLD — the corridor.
  { id: 'potsdamer_platz', name: 'Potsdamer Platz', sector: 'GOLD', x: 44, y: 40 },
  { id: 'friedrichstrasse', name: 'Friedrichstraße', sector: 'GOLD', x: 54, y: 30, informant: true },
  { id: 'checkpoint_charlie', name: 'Checkpoint Charlie', sector: 'GOLD', x: 50, y: 48 },
  { id: 'glienicke_bridge', name: 'Glienicke Bridge', sector: 'GOLD', x: 26, y: 90, extractionFor: 'GOLD' },

  // RED — East Berlin.
  { id: 'alexanderplatz', name: 'Alexanderplatz', sector: 'RED', x: 66, y: 36, informant: true },
  { id: 'prenzlauer_berg', name: 'Prenzlauer Berg', sector: 'RED', x: 76, y: 16, informant: true },
  { id: 'karl_marx_allee', name: 'Karl-Marx-Allee', sector: 'RED', x: 80, y: 52, extractionFor: 'RED' },
  { id: 'friedrichshain', name: 'Friedrichshain', sector: 'RED', x: 70, y: 68, informant: true },
];

const RAW_EDGES: RawEdge[] = [
  // West.
  ['kurfurstendamm', 'tiergarten', 'STREET'],
  ['kurfurstendamm', 'schoneberg', 'STREET'],
  ['schoneberg', 'tempelhof', 'STREET'],
  ['tiergarten', 'bernauer', 'STREET'],
  ['tiergarten', 'potsdamer_platz', 'STREET'],
  ['tempelhof', 'kreuzberg', 'STREET'],
  ['tempelhof', 'glienicke_bridge', 'STREET'],

  // South.
  ['kreuzberg', 'potsdamer_platz', 'STREET'],
  ['hermannplatz', 'glienicke_bridge', 'STREET'],

  // North and the corridor.
  ['bernauer', 'friedrichstrasse', 'STREET'],
  ['gesundbrunnen', 'prenzlauer_berg', 'STREET'],
  ['friedrichstrasse', 'potsdamer_platz', 'STREET'],
  ['friedrichstrasse', 'checkpoint_charlie', 'STREET'],
  ['friedrichstrasse', 'alexanderplatz', 'STREET'],
  ['potsdamer_platz', 'checkpoint_charlie', 'STREET'],

  // East.
  ['alexanderplatz', 'prenzlauer_berg', 'STREET'],
  ['alexanderplatz', 'karl_marx_allee', 'STREET'],
  ['prenzlauer_berg', 'karl_marx_allee', 'STREET'],
  ['karl_marx_allee', 'friedrichshain', 'STREET'],

  // The wall. Crossing costs Intel and always emits a public signal.
  ['checkpoint_charlie', 'alexanderplatz', 'CHECKPOINT'],
  ['hermannplatz', 'friedrichshain', 'CHECKPOINT'],

  // U-Bahn. Silent, and the only way to cross the map without chatter.
  ['kreuzberg', 'gesundbrunnen', 'TUNNEL'],
  ['kreuzberg', 'hermannplatz', 'TUNNEL'],
  ['bernauer', 'gesundbrunnen', 'TUNNEL'],
];

export const FFA_16: MapDefinition = buildMap('ffa-16', 'Berlin — Three Networks', RAW_NODES, RAW_EDGES);
