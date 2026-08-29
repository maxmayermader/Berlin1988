import type { NodeId, PlayerView, RngState } from '@berlin/shared';
import { neighbours, nodeOf, withinRange } from '@berlin/engine';
import { collapse, predict, reweight, reweightExcept, settle, type Belief } from './belief.js';

/**
 * Turn one round's observations into belief updates.
 *
 * Everything here comes from the bot's own PlayerView — the same projection a
 * human in that seat receives. If a rule needs GameState to implement, it is a
 * cheat and does not belong in this package.
 */

export interface EvidenceOptions {
  /** 0 = perfect inference, 1 = barely reads the evidence at all. */
  readonly beliefNoise: number;
}

export function updateBelief(
  belief: Belief,
  view: PlayerView,
  tunnelBias: Map<string, number>,
  opts: EvidenceOptions,
  rng: RngState,
): void {
  predict(belief, view.map, tunnelBias);

  const map = view.map;
  const selfNodes = new Set(
    view.self.agents.filter((a) => a.alive).map((a) => a.nodeId as string),
  );

  // --- Strongest evidence first: things that pin a position ---------------

  for (const sig of view.signals) {
    switch (sig.kind) {
      // "You are not alone" — a rival is standing on MY node. Near-certainty,
      // and the single strongest signal in the game.
      case 'NOT_ALONE':
        if (sig.nodeId) reweight(belief, null, sig.nodeId as string, 25);
        break;

      // An informant reported an arrival. Almost as good.
      case 'INFORMANT_REPORT':
        if (sig.nodeId) reweight(belief, null, sig.nodeId as string, 15);
        break;

      // Gunfire next door. Somebody is at that node or was a moment ago.
      case 'STRIKE_EXACT':
        if (sig.nodeId) reweight(belief, null, sig.nodeId as string, 12);
        break;

      // Gunfire somewhere in a sector. Much weaker, but real.
      case 'STRIKE_VICINITY':
        if (sig.sector) {
          const inSector = new Set(
            map.nodes.filter((n) => n.sector === sig.sector).map((n) => n.id as string),
          );
          reweightExcept(belief, null, inSector, 0.5);
        }
        break;

      // Someone crossed the Wall. Mass shifts to that checkpoint's side.
      case 'BORDER_CROSSING':
        if (sig.nodeId) reweight(belief, null, sig.nodeId as string, 6);
        break;

      // A dossier was taken, and this signal DOES name the player.
      case 'DOSSIER_TAKEN':
        if (sig.nodeId && sig.playerId) {
          collapse(belief, sig.playerId as string, sig.nodeId as string);
        }
        break;

      // Movement near one of my agents. Weak, directionless, but it is the
      // steadiest drip in the game.
      case 'CHATTER':
        if (sig.nodeId) reweight(belief, null, sig.nodeId as string, 3);
        break;

      // A node closed. Nobody is in it; whoever was is now next door.
      case 'BLOCKADE_ACTIVE':
        if (sig.nodeId) {
          reweight(belief, null, sig.nodeId as string, 0);
          for (const n of neighbours(map, sig.nodeId)) {
            reweight(belief, null, n as string, 1.5);
          }
        }
        break;

      // Radio intercept — guaranteed true, and anonymous. Applied as a soft
      // constraint across all rivals rather than a hard one on any single
      // rival, because it never says whose agent it describes.
      case 'RADIO_INTERCEPT':
        applyIntercept(belief, view, sig.intercept);
        break;

      default:
        break;
    }
  }

  // --- My own scans: the one place a bot gets a near-clean read ------------

  for (const ev of view.lastRound) {
    if (ev.type !== 'WIRETAP_RESULT' || ev.playerId !== view.self.id) continue;
    for (const r of ev.results) {
      if (r.occupied) {
        // Not proof — it might be a decoy, or Counter-Surveillance may have
        // eaten a real hit elsewhere. Strong, not absolute.
        reweight(belief, null, r.nodeId as string, 20);
      } else {
        // CLEAR is also not proof: Counter-Surveillance turns one real hit
        // into a miss. Near-zero rather than zero.
        reweight(belief, null, r.nodeId as string, 0.05);
      }
    }
  }

  // A rival cannot be standing on my agent's node without the game telling me.
  const toldNotAlone = new Set(
    view.signals.filter((s) => s.kind === 'NOT_ALONE').map((s) => s.nodeId as string),
  );
  for (const node of selfNodes) {
    if (!toldNotAlone.has(node)) reweight(belief, null, node, 0.02);
  }

  settle(belief, opts.beliefNoise, rng);
}

function applyIntercept(
  belief: Belief,
  view: PlayerView,
  fact: PlayerView['signals'][number]['intercept'],
): void {
  if (!fact) return;
  const map = view.map;

  switch (fact.kind) {
    case 'IN_SECTOR': {
      const inSector = new Set(
        map.nodes.filter((n) => n.sector === fact.sector).map((n) => n.id as string),
      );
      // Soft, not hard: it describes *an* agent, not every agent.
      reweightExcept(belief, null, inSector, 0.55);
      break;
    }
    case 'NEAR_NODE': {
      const near = new Set<string>([
        fact.nodeId as string,
        ...withinRange(map, fact.nodeId, fact.within).map((n) => n as string),
      ]);
      reweightExcept(belief, null, near, 0.55);
      break;
    }
    case 'CARRYING_DOSSIER':
    case 'DID_NOT_MOVE':
    case 'CROSSED_CHECKPOINT':
      // True, but not positional on its own. A stronger bot could fold these
      // into a motion model; leaving them unused is honest rather than faking
      // an inference the fact doesn't support.
      break;
  }
}

/**
 * How much a rival looks like a tunnel deck, from their public Burn Track.
 * Feeds the filter's transition model — inference from public data, not a peek.
 */
export function tunnelBiasFrom(view: PlayerView): Map<string, number> {
  const out = new Map<string, number>();
  for (const opp of view.opponents) {
    const track = view.burnTracks[opp.id as string] ?? [];
    if (track.length === 0) {
      out.set(opp.id as string, 0);
      continue;
    }
    const green = track.filter((e) => e.sector === 'GREEN').length;
    out.set(opp.id as string, green / track.length);
  }
  return out;
}

export { nodeOf };
export type { NodeId };
