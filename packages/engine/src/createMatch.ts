import {
  agentId,
  matchId as toMatchId,
  playerId as toPlayerId,
  type BlockadeEvent,
  type GameState,
  type MatchSettings,
  type NodeId,
  type NodeRuntime,
  type PlayerSecrets,
  type RngState,
  type Sector,
} from '@berlin/shared';
import { getMap, getRuleset, STARTER_LOADOUTS } from './content/index.js';
import { seedRng, chance, nextInt, shuffled } from './rng.js';
import { consumablePassivesIn } from './loadout.js';
import { extractionPointFor } from './graph.js';

/**
 * Build a fresh match from host settings and a seed.
 *
 * The blockade schedule is rolled HERE, once, for the whole match — that is
 * what makes the Kontrolle Schedule passive implementable at all. A player
 * holding it simply reads a schedule that already exists.
 */
export function createMatch(settings: MatchSettings, seed: string): GameState {
  const map = getMap(settings.mapId);
  const ruleset = getRuleset(settings.rulesetId);
  const rng = seedRng(seed);

  const nodes: Record<string, NodeRuntime> = {};
  for (const n of map.nodes) {
    nodes[n.id as string] = {
      informantOwner: null,
      dossiers: 0,
      blockadedUntil: null,
    };
  }

  const players: Record<string, PlayerSecrets> = {};
  const playerOrder = settings.seats.map((s) => s.id);

  for (const seat of settings.seats) {
    const home = homeNodeFor(map, seat.faction);
    const loadout = defaultLoadoutFor(seat.faction);

    const agents = [];
    for (let i = 0; i < settings.agentsPerPlayer; i++) {
      agents.push({
        id: agentId(`${seat.id}:a${i + 1}`),
        playerId: seat.id,
        nodeId: home,
        dossiers: 0,
        alive: true,
        actionPenalty: 0,
      });
    }

    players[seat.id as string] = {
      id: seat.id,
      name: seat.name,
      faction: seat.faction,
      team: seat.team,
      isBot: seat.kind === 'BOT',
      agents,
      intel: settings.startingIntel,
      safehouse: null,
      loadout: [...loadout],
      passivesAvailable: consumablePassivesIn(loadout),
      cooldowns: {},
      silencers: 0,
      burnsInflicted: 0,
      dossiersExtracted: 0,
      eliminated: false,
      pausesRemaining: settings.pausesPerPlayer,
      hasCrossedCheckpoint: false,
    };
  }

  placeDossiers(map.nodes.map((n) => n.id), nodes, settings, rng, players);

  const blockadeSchedule = rollBlockadeSchedule(
    map.nodes.map((n) => n.id),
    map.nodes.filter((n) => n.extractionFor !== null).map((n) => n.id),
    settings,
    ruleset,
    rng,
  );

  const burnTracks: Record<string, never[]> = {};
  for (const id of playerOrder) burnTracks[id as string] = [];

  const history: Record<string, never[]> = {};
  for (const id of playerOrder) history[id as string] = [];

  return {
    matchId: toMatchId(seed),
    settings,
    ruleset,
    map,
    round: 1,
    phase: 'ORDERS',
    rng,
    playerOrder: [...playerOrder],
    players,
    nodes,
    traps: [],
    decoys: [],
    blockadeSchedule,
    pendingOrders: {},
    burnTracks,
    dossierRespawns: [],
    lastRoundLog: [],
    history,
    signals: Object.fromEntries(playerOrder.map((id) => [id as string, []])),
    outcome: null,
    nextEntityId: 1,
  };
}

/** Agents start at their faction's extraction point — home ground. */
function homeNodeFor(map: ReturnType<typeof getMap>, faction: Sector): NodeId {
  const ex = extractionPointFor(map, faction);
  if (ex) return ex;
  const own = map.nodes.find((n) => n.sector === faction);
  if (own) return own.id;
  return map.nodes[0]!.id;
}

function defaultLoadoutFor(faction: Sector) {
  switch (faction) {
    case 'RED':
      return STARTER_LOADOUTS.HUNTER!;
    case 'BLUE':
      return STARTER_LOADOUTS.PHANTOM!;
    case 'GOLD':
      return STARTER_LOADOUTS.OLIGARCH!;
    case 'GREEN':
      return STARTER_LOADOUTS.SPIDER!;
  }
}

/** Dossiers spawn on neutral nodes — never on an extraction point or a start node. */
function placeDossiers(
  allNodes: readonly NodeId[],
  nodes: Record<string, NodeRuntime>,
  settings: MatchSettings,
  rng: RngState,
  players: Record<string, PlayerSecrets>,
): void {
  const occupied = new Set<string>();
  for (const p of Object.values(players)) {
    for (const a of p.agents) occupied.add(a.nodeId as string);
  }

  const candidates = allNodes.filter((id) => !occupied.has(id as string));
  const chosen = shuffled(rng, candidates).slice(0, settings.dossierCount);
  for (const id of chosen) nodes[id as string]!.dossiers += 1;
}

/**
 * Pre-roll every blockade. Extraction points are never closed — sealing the
 * only way to win would turn a long match into a guaranteed round-limit finish.
 */
function rollBlockadeSchedule(
  allNodes: readonly NodeId[],
  extractionPoints: readonly NodeId[],
  settings: MatchSettings,
  ruleset: ReturnType<typeof getRuleset>,
  rng: RngState,
): BlockadeEvent[] {
  if (settings.blockadeMode === 'OFF') return [];

  const exSet = new Set(extractionPoints.map((n) => n as string));
  const candidates = allNodes.filter((n) => !exSet.has(n as string));
  const out: BlockadeEvent[] = [];

  for (let round = ruleset.blockadeStartRound; round <= settings.roundLimit; round++) {
    if (!chance(rng, ruleset.blockadeChancePerRound)) continue;

    const node = candidates[nextInt(rng, candidates.length)]!;
    const span = ruleset.blockadeMaxDuration - ruleset.blockadeMinDuration + 1;
    const duration = ruleset.blockadeMinDuration + nextInt(rng, span);
    const coin = chance(rng, 0.5);

    const announced =
      settings.blockadeMode === 'ANNOUNCED'
        ? true
        : settings.blockadeMode === 'RANDOM'
          ? false
          : coin;

    out.push({ nodeId: node, round, duration, announced });
  }

  return out;
}

/** Convenience for tests and the sim harness. */
export function quickSettings(overrides: Partial<MatchSettings> = {}): MatchSettings {
  return {
    seats: [
      { id: toPlayerId('p1'), name: 'Station West', faction: 'BLUE', kind: 'HUMAN', team: null },
      { id: toPlayerId('p2'), name: 'HVA', faction: 'RED', kind: 'HUMAN', team: null },
    ],
    agentsPerPlayer: 2,
    mapId: 'duel-12',
    teams: false,
    roundTimerSeconds: 60,
    pausesPerPlayer: 3,
    roundLimit: 14,
    /**
     * 2, not 3 — fewer dossiers on the map than you need to extract.
     *
     * Measured, not guessed. With 3 on the map a runner picks up a full set in
     * one loop and never has to come back, and in a duel that is close to
     * unbeatable: the sim harness put a pure objective-runner at 92% with
     * essentially zero combat in the whole match. At 2 they must wait for a
     * respawn, which forces a predictable return trip and creates the
     * interception window the hunt needs. Win rates tighten to 75/63/58/28 and
     * burns rise roughly twentyfold. At 1 it overshoots the other way —
     * extraction drops to 17% and the turtle wins.
     *
     * See docs/AI_OPPONENTS.md §7 for the full sweep.
     */
    dossierCount: 2,
    startingIntel: 4,
    blockadeMode: 'MIXED',
    rulesetId: 'default',
    ...overrides,
  };
}
