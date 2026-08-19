import type { MapDefinition, NodeId, PlayerId, PlayerView, RngState } from '@berlin/shared';
import { neighbours, distance, nodeOf, rngNext } from '@berlin/engine';

/**
 * Particle filter over rival positions.
 *
 * One weighted cloud per rival PLAYER, not per agent — which is not a
 * simplification, it's the correct shape. The fog deliberately hides agent
 * identity (see the leak fixed in filterEvents), so a bot has no way to tell
 * one of an opponent's agents from the other and must not pretend otherwise.
 * The cloud represents "an agent of theirs is here".
 *
 * This is why the bots feel alive: the filter produces genuine uncertainty and
 * genuine convictions. When a bot sweeps toward you it is because it BELIEVES
 * something, and when a decoy fools it the belief stays wrong for rounds.
 */

export interface Belief {
  /** rival playerId → weight per node. Sums to ~1 per rival. */
  readonly clouds: Map<string, Map<string, number>>;
  /** Uniform floor injected each round so a wrong lock can recover. */
  readonly floor: number;
}

/** Deep copy, for forward-predicting without disturbing the posterior. */
export function cloneBelief(b: Belief): Belief {
  const clouds = new Map<string, Map<string, number>>();
  for (const [k, cloud] of b.clouds) clouds.set(k, new Map(cloud));
  return { clouds, floor: b.floor };
}

export function createBelief(view: PlayerView, floor: number): Belief {
  const clouds = new Map<string, Map<string, number>>();
  const nodes = view.map.nodes;

  for (const opp of view.opponents) {
    const cloud = new Map<string, number>();
    // Rivals start at their faction's extraction point — public map knowledge,
    // the same thing a human reads off the board on turn one.
    const home = nodes.find((n) => n.extractionFor === opp.faction);
    for (const n of nodes) {
      cloud.set(n.id as string, n.id === home?.id ? 0.6 : 0.4 / (nodes.length - 1));
    }
    normalize(cloud);
    clouds.set(opp.id as string, cloud);
  }

  return { clouds, floor };
}

/**
 * Diffuse along the graph. Rivals stay put or step to a neighbour.
 *
 * `tunnelBias` rises as a rival's Burn Track shows GREEN cards: a bot that has
 * watched you play tunnel ops should start believing you take tunnels.
 */
export function predict(
  belief: Belief,
  map: MapDefinition,
  tunnelBias: Map<string, number>,
): void {
  for (const [playerId, cloud] of belief.clouds) {
    const next = new Map<string, number>();
    const bias = tunnelBias.get(playerId) ?? 0;

    for (const [nodeKey, w] of cloud) {
      if (w <= 0) continue;
      const node = nodeOf(map, nodeKey as NodeId);
      const stay = 0.25;
      add(next, nodeKey, w * stay);

      const edges = node.edges;
      if (edges.length === 0) {
        add(next, nodeKey, w * (1 - stay));
        continue;
      }

      // Weight tunnel edges up for a suspected tunnel deck, and checkpoints
      // down — crossing is expensive and always announced, so it's rarer.
      let total = 0;
      const weights = edges.map((e) => {
        const w2 =
          e.type === 'TUNNEL' ? 1 + bias * 3 : e.type === 'CHECKPOINT' ? 0.4 : 1;
        total += w2;
        return w2;
      });

      for (let i = 0; i < edges.length; i++) {
        add(next, edges[i]!.to as string, (w * (1 - stay) * weights[i]!) / total);
      }
    }

    cloud.clear();
    for (const [k, v] of next) cloud.set(k, v);
    normalize(cloud);
  }
}

/** Multiply a node's weight. The workhorse of every evidence rule. */
export function reweight(
  belief: Belief,
  playerId: string | null,
  node: string,
  factor: number,
): void {
  for (const [pid, cloud] of belief.clouds) {
    if (playerId !== null && pid !== playerId) continue;
    cloud.set(node, (cloud.get(node) ?? 0) * factor);
  }
}

/** Multiply every node EXCEPT the listed ones. Used for hard constraints. */
export function reweightExcept(
  belief: Belief,
  playerId: string | null,
  keep: Set<string>,
  factor: number,
): void {
  for (const [pid, cloud] of belief.clouds) {
    if (playerId !== null && pid !== playerId) continue;
    for (const [k, w] of cloud) {
      if (!keep.has(k)) cloud.set(k, w * factor);
    }
  }
}

/** Collapse to certainty. Only for genuinely observed positions. */
export function collapse(belief: Belief, playerId: string, node: string): void {
  const cloud = belief.clouds.get(playerId);
  if (!cloud) return;
  for (const k of cloud.keys()) cloud.set(k, k === node ? 1 : 0);
}

/**
 * Renormalize and inject the uniform floor. Difficulty degrades inference by
 * raising the floor and blending toward uniform — a Recruit-tier bot still
 * sweeps like its personality, it's just genuinely bad at reading evidence.
 */
export function settle(belief: Belief, noise: number, rng: RngState): void {
  for (const cloud of belief.clouds.values()) {
    const n = cloud.size;
    if (n === 0) continue;

    normalize(cloud);

    if (noise > 0) {
      const uniform = 1 / n;
      for (const [k, w] of cloud) {
        // A little jitter so two bots with the same evidence don't move in
        // lockstep, plus a blend toward uniform scaled by difficulty.
        const jitter = 1 + (rngNext(rng) - 0.5) * noise;
        cloud.set(k, (w * (1 - noise) + uniform * noise) * jitter);
      }
    }

    for (const [k, w] of cloud) {
      cloud.set(k, Math.max(w, belief.floor / n));
    }
    normalize(cloud);
  }
}

/** P(a specific rival is on this node). */
export function pAt(belief: Belief, playerId: string, node: string): number {
  return belief.clouds.get(playerId)?.get(node) ?? 0;
}

/** P(any rival is on this node) — 1 minus all of them being elsewhere. */
export function pAnyAt(belief: Belief, node: string): number {
  let miss = 1;
  for (const cloud of belief.clouds.values()) {
    miss *= 1 - (cloud.get(node) ?? 0);
  }
  return 1 - miss;
}

/** The bot's single best guess about a rival, and how sure it is. */
export function peak(belief: Belief, playerId: string): { node: string; p: number } {
  let best = '';
  let bestP = -1;
  for (const [k, w] of belief.clouds.get(playerId) ?? []) {
    if (w > bestP) {
      bestP = w;
      best = k;
    }
  }
  return { node: best, p: Math.max(0, bestP) };
}

/** Shannon entropy in bits. Lower means the bot has a read. */
export function entropy(belief: Belief, playerId: string): number {
  let h = 0;
  for (const w of belief.clouds.get(playerId)?.values() ?? []) {
    if (w > 0) h -= w * Math.log2(w);
  }
  return h;
}

/** Total entropy across every rival — the quantity a wiretap tries to reduce. */
export function totalEntropy(belief: Belief): number {
  let h = 0;
  for (const pid of belief.clouds.keys()) h += entropy(belief, pid);
  return h;
}

/** Expected hops from `from` to wherever a rival probably is. */
export function expectedDistance(
  belief: Belief,
  map: MapDefinition,
  from: NodeId,
  playerId: string,
): number {
  let sum = 0;
  for (const [k, w] of belief.clouds.get(playerId) ?? []) {
    if (w <= 0) continue;
    sum += w * distance(map, from, k as NodeId);
  }
  return sum;
}

/** Drop a rival that has been eliminated. */
export function forget(belief: Belief, playerId: PlayerId): void {
  belief.clouds.delete(playerId as string);
}

function add(m: Map<string, number>, k: string, v: number): void {
  m.set(k, (m.get(k) ?? 0) + v);
}

function normalize(m: Map<string, number>): void {
  let total = 0;
  for (const w of m.values()) total += w;
  if (total <= 0) {
    const u = 1 / Math.max(1, m.size);
    for (const k of m.keys()) m.set(k, u);
    return;
  }
  for (const [k, w] of m) m.set(k, w / total);
}

export { neighbours };
